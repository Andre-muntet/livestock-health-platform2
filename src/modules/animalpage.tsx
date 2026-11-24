import { useCallback, useEffect, useState, type FormEvent } from "react";

const API_URL =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "http://localhost:5000";

const SPECIES_OPTIONS = ["Cow", "Goat", "Sheep", "Pig", "Chicken", "Other"];
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const SHORT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type RiskLevel = "high" | "watch" | "ok";

export type HealthLogEntry = {
  id: string;
  type: "VACCINE" | "TREATMENT" | "SYMPTOM";
  detail: string;
  date: string;
};

type ParsedMeta = {
  birthMonth: string;
  ageOverride: string;
  lastVaccineDate: string;
  plainNotes: string;
  logs: HealthLogEntry[];
};

export type ApiAnimal = {
  id: string | number;
  tagNumber: string;
  name?: string | null;
  species: string;
  breed?: string | null;
  vaccinationStatus?: string | null;
  notes?: string | null;
};

/* --- Metadata helpers stored inside notes --- */
const META_PREFIX = "__META__:";

export const parseAnimalMeta = (notes?: string | null): ParsedMeta => {
  if (!notes) {
    return { birthMonth: "", ageOverride: "", lastVaccineDate: "", plainNotes: "", logs: [] };
  }
  if (notes.startsWith(META_PREFIX)) {
    try {
      const parsed = JSON.parse(notes.slice(META_PREFIX.length));
      return {
        birthMonth: parsed.birthMonth ?? "",
        ageOverride: parsed.ageOverride ?? parsed.age ?? "",
        lastVaccineDate: parsed.lastVaccineDate ?? "",
        plainNotes: parsed.plainNotes ?? "",
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    } catch {
      return { birthMonth: "", ageOverride: "", lastVaccineDate: "", plainNotes: notes, logs: [] };
    }
  }
  return { birthMonth: "", ageOverride: "", lastVaccineDate: "", plainNotes: notes, logs: [] };
};

const serializeAnimalMeta = (meta: ParsedMeta): string =>
  `${META_PREFIX}${JSON.stringify(meta)}`;

/* --- Calculate human-readable Age from Birth Month (YYYY-MM) --- */
export const calculateAgeFromBirthMonth = (birthMonth: string, ageOverride?: string): string => {
  if (ageOverride && ageOverride.trim()) return ageOverride.trim();
  if (!birthMonth || !/^\d{4}-\d{2}$/.test(birthMonth)) return "";

  const [yearStr, monthStr] = birthMonth.split("-");
  const birthYear = Number(yearStr);
  const birthMon = Number(monthStr);

  const now = new Date();
  const totalMonths =
    (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMon);

  if (totalMonths < 0) return "Newborn";
  if (totalMonths === 0) return "Under 1 month";
  if (totalMonths < 12) {
    return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`;
  }
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  if (remMonths === 0) {
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${years} yr${years === 1 ? "" : "s"} ${remMonths} month${remMonths === 1 ? "" : "s"}`;
};

const formatBirthMonthLabel = (birthMonth: string): string => {
  if (!birthMonth || !/^\d{4}-\d{2}$/.test(birthMonth)) return "";
  const [y, m] = birthMonth.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

/* --- 6-Month General Vaccination Reference --- */
export const getSixMonthVaccineInfo = (
  lastVaccineDate: string,
  fallbackStatus?: string | null
) => {
  if (!lastVaccineDate) {
    return {
      statusLabel: fallbackStatus || "Not set",
      nextDueLabel: "General 6-month check-in · No date logged yet",
      isOverdue: fallbackStatus === "Overdue",
      isDueSoon: fallbackStatus === "Due soon",
    };
  }
  const given = new Date(lastVaccineDate);
  if (Number.isNaN(given.getTime())) {
    return {
      statusLabel: fallbackStatus || "Not set",
      nextDueLabel: "General 6-month check-in",
      isOverdue: fallbackStatus === "Overdue",
      isDueSoon: fallbackStatus === "Due soon",
    };
  }
  const nextDue = new Date(given.getTime() + SIX_MONTHS_MS);
  const daysLeft = Math.ceil((nextDue.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const formattedDue = nextDue.toLocaleDateString();

  if (daysLeft < 0) {
    return {
      statusLabel: "Overdue",
      nextDueLabel: `6-month check-in passed on ${formattedDue}`,
      isOverdue: true,
      isDueSoon: false,
    };
  }
  if (daysLeft <= 21) {
    return {
      statusLabel: "Due soon",
      nextDueLabel: `6-month check-in due ${formattedDue} · ${daysLeft}d left`,
      isOverdue: false,
      isDueSoon: true,
    };
  }
  return {
    statusLabel: "Up to date",
    nextDueLabel: `Next 6-month check-in: ${formattedDue}`,
    isOverdue: false,
    isDueSoon: false,
  };
};

/* --- Background Intelligence: Scans logs across the herd to flag risk --- */
export const evaluateHerdIntelligence = (animals: ApiAnimal[]) => {
  const now = Date.now();
  const parsedMap = new Map<string | number, ParsedMeta>();

  let herdRecentSymptomAnimals = 0;
  animals.forEach((a) => {
    const meta = parseAnimalMeta(a.notes);
    parsedMap.set(a.id, meta);
    const hasRecentSymptom = meta.logs.some(
      (l) => l.type === "SYMPTOM" && now - new Date(l.date).getTime() <= SHORT_WINDOW_MS
    );
    if (hasRecentSymptom) herdRecentSymptomAnimals += 1;
  });

  const areaClusterAlert = herdRecentSymptomAnimals >= 2;

  const riskById = new Map<
    string | number,
    { risk: RiskLevel; reason: string; meta: ParsedMeta }
  >();

  animals.forEach((a) => {
    const meta = parsedMap.get(a.id)!;
    const recentIllnessLogs = meta.logs.filter(
      (l) =>
        (l.type === "SYMPTOM" || l.type === "TREATMENT") &&
        now - new Date(l.date).getTime() <= SHORT_WINDOW_MS
    );
    const recentSymptoms = meta.logs.filter(
      (l) => l.type === "SYMPTOM" && now - new Date(l.date).getTime() <= SHORT_WINDOW_MS
    );
    const vaccineInfo = getSixMonthVaccineInfo(meta.lastVaccineDate, a.vaccinationStatus);

    if (recentIllnessLogs.length >= 2) {
      riskById.set(a.id, {
        risk: "high",
        reason: `Flagged for Vet: Repeated illness or symptoms (${recentIllnessLogs.length} events in 14 days).`,
        meta,
      });
    } else if (areaClusterAlert && recentSymptoms.length >= 1) {
      riskById.set(a.id, {
        risk: "high",
        reason: `Flagged for Vet: Area cluster alert (${herdRecentSymptomAnimals} animals showing symptoms).`,
        meta,
      });
    } else if (recentSymptoms.length === 1 || vaccineInfo.isOverdue || vaccineInfo.isDueSoon) {
      riskById.set(a.id, {
        risk: "watch",
        reason:
          recentSymptoms.length === 1
            ? `Symptom logged: "${recentSymptoms[0].detail}" — needs attention.`
            : vaccineInfo.nextDueLabel,
        meta,
      });
    } else {
      riskById.set(a.id, {
        risk: "ok",
        reason: "",
        meta,
      });
    }
  });

  return { riskById, areaClusterAlert, herdRecentSymptomAnimals };
};

const RISK_PILL: Record<RiskLevel, { label: string; dot: string; box: string }> = {
  high: {
    label: "High risk",
    dot: "bg-red-600",
    box: "bg-red-50 text-red-700",
  },
  watch: {
    label: "Needs attention",
    dot: "bg-amber-500",
    box: "bg-amber-50 text-amber-800",
  },
  ok: {
    label: "Healthy",
    dot: "bg-green-600",
    box: "bg-green-50 text-green-800",
  },
};

const emptyForm = {
  tagNumber: "",
  species: "Cow",
  customSpecies: "",
  birthMonth: "",
  ageOverride: "",
  breed: "",
  lastVaccineDate: "",
  vaccinationStatus: "Not set",
  notes: "",
};

type AnimalsPageProps = {
  ownerId?: string;
  role?: "FARMER" | "VET";
  statusFilter?: "all" | RiskLevel;
  onClearFilter?: () => void;
  onChanged?: () => void;
};

const AnimalsPage = ({
  ownerId,
  role = "FARMER",
  statusFilter = "all",
  onClearFilter,
  onChanged,
}: AnimalsPageProps) => {
  const [animals, setAnimals] = useState<ApiAnimal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // Add Animal Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Selected Animal Profile Modal
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | number | null>(null);

  // Farmer Log Form inside Profile Modal
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<"SYMPTOM" | "TREATMENT" | "VACCINE">("SYMPTOM");
  const [logDetail, setLogDetail] = useState("");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logSaving, setLogSaving] = useState(false);

  const isFarmer = role === "FARMER";

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await fetch(`${API_URL}/animals`);
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const data = await res.json();
      setAnimals(Array.isArray(data) ? data : data.animals ?? []);
    } catch (e) {
      console.error(e);
      setError("Failed to fetch animals from the database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const tagNumber = form.tagNumber.trim();
    const resolvedSpecies =
      form.species === "Other" ? form.customSpecies.trim() : form.species.trim();

    if (!resolvedSpecies) {
      return setFormError("Specify the animal species when choosing Other.");
    }
    if (!tagNumber) {
      return setFormError("Animal ID is required before saving.");
    }
    if (!form.birthMonth) {
      return setFormError("Birth month is required.");
    }
    if (animals.some((a) => a.tagNumber?.toLowerCase() === tagNumber.toLowerCase())) {
      return setFormError("Another animal already uses this ID.");
    }

    const vaccineInfo = getSixMonthVaccineInfo(form.lastVaccineDate, form.vaccinationStatus);
    const initialLogs: HealthLogEntry[] = form.lastVaccineDate
      ? [
          {
            id: crypto.randomUUID(),
            type: "VACCINE",
            detail: "Vaccination recorded",
            date: new Date(form.lastVaccineDate).toISOString(),
          },
        ]
      : [];

    const packedNotes = serializeAnimalMeta({
      birthMonth: form.birthMonth,
      ageOverride: form.ageOverride.trim(),
      lastVaccineDate: form.lastVaccineDate,
      plainNotes: form.notes.trim(),
      logs: initialLogs,
    });

    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`${API_URL}/animals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagNumber,
          name: tagNumber,
          species: resolvedSpecies,
          breed: form.breed.trim() || undefined,
          vaccinationStatus: vaccineInfo.statusLabel,
          notes: packedNotes,
          ...(ownerId ? { ownerId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      setShowForm(false);
      await load();
      onChanged?.();
    } catch (err) {
      console.error(err);
      setFormError("Could not save the animal. Check the backend terminal for the reason.");
    } finally {
      setSaving(false);
    }
  };

  const selectedAnimal = animals.find((a) => a.id === selectedAnimalId) ?? null;

  const submitFarmerLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnimal || !logDetail.trim()) return;

    const currentMeta = parseAnimalMeta(selectedAnimal.notes);
    const isoDate = new Date(logDate || Date.now()).toISOString();

    const newEntry: HealthLogEntry = {
      id: crypto.randomUUID(),
      type: logType,
      detail: logDetail.trim(),
      date: isoDate,
    };

    const updatedLastVaccineDate =
      logType === "VACCINE" ? logDate : currentMeta.lastVaccineDate;
    const updatedVaccineInfo = getSixMonthVaccineInfo(
      updatedLastVaccineDate,
      selectedAnimal.vaccinationStatus
    );

    const updatedNotes = serializeAnimalMeta({
      ...currentMeta,
      lastVaccineDate: updatedLastVaccineDate,
      logs: [newEntry, ...currentMeta.logs],
    });

    setLogSaving(true);
    try {
      let res = await fetch(`${API_URL}/animals/${selectedAnimal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagNumber: selectedAnimal.tagNumber,
          name: selectedAnimal.tagNumber,
          species: selectedAnimal.species,
          breed: selectedAnimal.breed ?? undefined,
          vaccinationStatus: updatedVaccineInfo.statusLabel,
          notes: updatedNotes,
        }),
      });

      if (!res.ok) {
        res = await fetch(`${API_URL}/animals/${selectedAnimal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vaccinationStatus: updatedVaccineInfo.statusLabel,
            notes: updatedNotes,
          }),
        });
      }

      if (!res.ok) throw new Error(`Server answered ${res.status}`);

      const simulatedAnimals = animals.map((item) =>
        item.id === selectedAnimal.id ? { ...item, notes: updatedNotes } : item
      );
      const { riskById } = evaluateHerdIntelligence(simulatedAnimals);
      const assessed = riskById.get(selectedAnimal.id);

      if (assessed?.risk === "high" && ownerId) {
        await fetch(`${API_URL}/alerts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `High Risk: ${selectedAnimal.tagNumber}`,
            message: assessed.reason,
            severity: "HIGH",
            animalId: String(selectedAnimal.id),
            userId: ownerId,
          }),
        }).catch(() => {});
      }

      setShowLogForm(false);
      setLogDetail("");
      await load();
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError("Could not save health log. Ensure PUT or PATCH on /animals/:id is enabled on the backend.");
    } finally {
      setLogSaving(false);
    }
  };

  const remove = async (a: ApiAnimal) => {
    if (!window.confirm(`Remove ${a.tagNumber}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_URL}/animals/${a.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`Server answered ${res.status}`);
      setSelectedAnimalId(null);
      await load();
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError("Could not remove the animal. Check the backend terminal for the reason.");
    }
  };

  const { riskById, areaClusterAlert, herdRecentSymptomAnimals } =
    evaluateHerdIntelligence(animals);

  const attentionCount = animals.filter(
    (a) => riskById.get(a.id)?.risk !== "ok"
  ).length;

  const shown = animals.filter((a) => {
    const assessment = riskById.get(a.id);
    if (statusFilter !== "all" && assessment?.risk !== statusFilter) {
      return false;
    }
    const q = query.trim().toLowerCase();
    const meta = parseAnimalMeta(a.notes);
    const computedAge = calculateAgeFromBirthMonth(meta.birthMonth, meta.ageOverride);
    return (
      !q ||
      `${a.tagNumber} ${a.species} ${a.breed ?? ""} ${computedAge}`.toLowerCase().includes(q)
    );
  });

  const field = "w-full rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm outline-none focus:bg-muted";

  return (
    <div>
      {/* Android-style header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your livestock</h1>
          <p className="mt-0.5 text-sm text-foreground/65">
            Select an animal to view its profile and health records.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-foreground/75">
            <span>
              {animals.length} animal{animals.length === 1 ? "" : "s"}
            </span>
            {attentionCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {attentionCount} needs attention
              </span>
            )}
          </div>
        </div>

        {isFarmer && !showForm && (
          <button
            type="button"
            onClick={openForm}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:w-auto"
          >
            + Add animal
          </button>
        )}
      </div>

      {areaClusterAlert && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Vet Intelligence Alert:</strong> {herdRecentSymptomAnimals} animals reported symptoms within the last 14 days and have been flagged as <strong>High risk</strong>.
        </div>
      )}

      {/* Register New Animal Form */}
      {isFarmer && showForm && (
        <form onSubmit={save} className="mt-5 space-y-4 rounded-2xl bg-muted/35 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Register an animal</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-foreground/65 hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Species *
              <select
                required
                className={`${field} mt-1`}
                value={form.species}
                onChange={(e) =>
                  setForm({
                    ...form,
                    species: e.target.value,
                    customSpecies: e.target.value === "Other" ? form.customSpecies : "",
                  })
                }
              >
                {SPECIES_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Animal ID *
              <input
                required
                placeholder="e.g. Cow01"
                className={`${field} mt-1`}
                value={form.tagNumber}
                onChange={(e) => setForm({ ...form, tagNumber: e.target.value })}
              />
            </label>
          </div>

          {form.species === "Other" && (
            <label className="block text-sm font-medium">
              Species name *
              <input
                required
                placeholder="e.g. Donkey, Turkey"
                className={`${field} mt-1`}
                value={form.customSpecies}
                onChange={(e) => setForm({ ...form, customSpecies: e.target.value })}
              />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Birth Month *
              <input
                required
                type="month"
                max={new Date().toISOString().slice(0, 7)}
                className={`${field} mt-1`}
                value={form.birthMonth}
                onChange={(e) => setForm({ ...form, birthMonth: e.target.value })}
              />
            </label>

            <label className="block text-sm font-medium">
              Breed — optional
              <input
                placeholder="e.g. Friesian, Boer"
                className={`${field} mt-1`}
                value={form.breed}
                onChange={(e) => setForm({ ...form, breed: e.target.value })}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Last Vaccination Date — optional
            <input
              type="date"
              className={`${field} mt-1`}
              value={form.lastVaccineDate}
              onChange={(e) => setForm({ ...form, lastVaccineDate: e.target.value })}
            />
          </label>

          <label className="block text-sm font-medium">
            Notes — optional
            <textarea
              rows={2}
              className={`${field} mt-1`}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          {formError && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 sm:flex-initial"
            >
              {saving ? "Saving..." : "Save animal"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted sm:flex-initial"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by ID, species, breed or age"
        aria-label="Search animals"
        className={`${field} mt-4`}
      />

      {statusFilter !== "all" && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-2 text-xs">
          <span>
            Showing: <strong>{RISK_PILL[statusFilter].label}</strong>
          </span>
          {onClearFilter && (
            <button type="button" onClick={onClearFilter} className="font-semibold underline">
              Show all
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {/* Clean Android-style clickable list */}
      {loading ? (
        <p className="mt-6 text-sm text-foreground/70">Loading animals...</p>
      ) : !error && shown.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-muted/40 p-6 text-center text-sm text-foreground/70">
          {animals.length === 0
            ? "No animals yet. Tap “+ Add animal” to register your first one."
            : "No animals match your search."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((a) => {
            const assessment = riskById.get(a.id)!;
            const pill = RISK_PILL[assessment.risk];
            const computedAge = calculateAgeFromBirthMonth(
              assessment.meta.birthMonth,
              assessment.meta.ageOverride
            );

            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAnimalId(a.id);
                    setShowLogForm(false);
                    setLogDetail("");
                  }}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl bg-background p-4 text-left shadow-sm ring-1 ring-black/5 transition hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-base font-bold">{a.tagNumber}</p>
                      <span className="shrink-0 text-xs font-medium text-foreground/50">
                        {a.tagNumber}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-foreground/65">
                      {[a.breed, a.species, computedAge].filter(Boolean).join(" · ")}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.box}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                        {pill.label}
                      </span>
                    </div>
                  </div>

                  <span
                    className="shrink-0 text-lg font-medium text-foreground/40"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Animal Profile & Health Records Pop-up Modal */}
      {selectedAnimal && (() => {
        const assessment = riskById.get(selectedAnimal.id)!;
        const pill = RISK_PILL[assessment.risk];
        const computedAge = calculateAgeFromBirthMonth(
          assessment.meta.birthMonth,
          assessment.meta.ageOverride
        );
        const birthMonthText = formatBirthMonthLabel(assessment.meta.birthMonth);
        const vaccineInfo = getSixMonthVaccineInfo(
          assessment.meta.lastVaccineDate,
          selectedAnimal.vaccinationStatus
        );
        const vaccineCount = assessment.meta.logs.filter((l) => l.type === "VACCINE").length;

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setSelectedAnimalId(null)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-label={`${selectedAnimal.tagNumber} profile`}
              className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{selectedAnimal.tagNumber}</h2>
                  <p className="mt-0.5 text-sm text-foreground/65">
                    {[selectedAnimal.species, selectedAnimal.breed, computedAge]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAnimalId(null)}
                  aria-label="Close profile"
                  className="rounded-full bg-muted px-3 py-1 text-base font-medium hover:opacity-80"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${pill.box}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                  {pill.label}
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/80">
                  Vaccinated {vaccineCount} time{vaccineCount === 1 ? "" : "s"}
                </span>
                {computedAge && (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/80">
                    Age: {computedAge}
                  </span>
                )}
              </div>

              {assessment.reason && (
                <p
                  className={`mt-3 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                    assessment.risk === "high"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {assessment.reason}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-muted/40 p-4 text-sm">
                <div>
                  <p className="text-xs text-foreground/55">Species</p>
                  <p className="font-semibold">{selectedAnimal.species}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/55">Breed</p>
                  <p className="font-semibold">{selectedAnimal.breed || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/55">Birth Month</p>
                  <p className="font-semibold">{birthMonthText || "Not recorded"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/55">Age</p>
                  <p className="font-semibold">{computedAge || "Not recorded"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-foreground/55">Vaccination Status</p>
                  <p className="font-semibold">{vaccineInfo.statusLabel}</p>
                  <p className="text-xs text-foreground/60">{vaccineInfo.nextDueLabel}</p>
                </div>
              </div>

              {assessment.meta.plainNotes && (
                <div className="mt-3 rounded-2xl bg-muted/40 p-3.5 text-sm text-foreground/80">
                  <p className="text-xs font-medium text-foreground/55">Notes</p>
                  <p className="mt-0.5">{assessment.meta.plainNotes}</p>
                </div>
              )}

              {isFarmer && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogForm((v) => !v)}
                    className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {showLogForm ? "Hide log form" : "+ Log vaccine, treatment or symptom"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(selectedAnimal)}
                    className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Remove
                  </button>
                </div>
              )}

              {isFarmer && showLogForm && (
                <form
                  onSubmit={submitFarmerLog}
                  className="mt-4 space-y-3 rounded-2xl bg-muted/50 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold">
                      Event Type
                      <select
                        className={`${field} mt-1`}
                        value={logType}
                        onChange={(e) =>
                          setLogType(e.target.value as "SYMPTOM" | "TREATMENT" | "VACCINE")
                        }
                      >
                        <option value="SYMPTOM">Spotted Symptom</option>
                        <option value="TREATMENT">Treatment Given</option>
                        <option value="VACCINE">Vaccination</option>
                      </select>
                    </label>

                    <label className="block text-xs font-semibold">
                      Date
                      <input
                        type="date"
                        className={`${field} mt-1`}
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-semibold">
                    Details
                    <input
                      required
                      placeholder="e.g. fever, dewormer, FMD booster"
                      className={`${field} mt-1`}
                      value={logDetail}
                      onChange={(e) => setLogDetail(e.target.value)}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={logSaving}
                    className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {logSaving ? "Saving..." : "Save health record"}
                  </button>
                </form>
              )}

              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                  Health & Vaccination Records ({assessment.meta.logs.length})
                </h3>
                {assessment.meta.logs.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground/60">
                    No health or vaccination records logged yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {assessment.meta.logs.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-xl bg-muted/35 px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-bold text-foreground/85">{entry.type}</span>
                          <p className="mt-0.5 text-foreground/75">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 text-foreground/50">
                          {new Date(entry.date).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AnimalsPage;