import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { signOut } from "aws-amplify/auth";
import { Toaster } from "sonner";

import Header from "./modules/header/page";
import Login from "./modules/auth/login/page";
import Signup from "./modules/auth/signup/page";
import Otp from "./modules/auth/otp/page";
import useUser from "./hooks/userUser";

type View = "home" | "animals" | "login" | "signup" | "otp";
type Status = "high" | "watch" | "ok";

/* ------------------------------------------------------------------ */
/* DEV SWITCH                                                          */
/* true  = skip login and open the app straight away (for building).  */
/* false = use the real Cognito login, signup and OTP screens.        */
/* ------------------------------------------------------------------ */
const DEV_BYPASS_AUTH = true;

// Only used while DEV_BYPASS_AUTH is true, so the header has something to show.
const PREVIEW_USER = { name: "Preview farmer", email: "preview@local.dev" };

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

/* ------------------------------ types ------------------------------ */
type AppNotification = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "watch";
  timestamp: string;
};

type Animal = {
  id: string; // the farmer-facing ID, for example Cow01
  species: string;
  breed: string;
  sex: string;
  born: string;
  status: Status;
  reason: string;
  nextVaccine: string;
};

const STATUS_LABEL: Record<Status, string> = {
  high: "High risk",
  watch: "Under observation",
  ok: "Healthy",
};

const STATUS_STYLE: Record<Status, string> = {
  high: "bg-red-100 text-red-700 border-red-300",
  watch: "bg-amber-100 text-amber-800 border-amber-300",
  ok: "bg-green-100 text-green-800 border-green-300",
};

/* ------------------------------ small pieces ------------------------------ */
const BellIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
    {STATUS_LABEL[status]}
  </span>
);

/* The popup, styled like YouTube's bell panel. The page behind it stays visible. */
const NotificationsPanel = ({
  items,
  onClose,
  onOpen,
  onClear,
}: {
  items: AppNotification[];
  onClose: () => void;
  onOpen: () => void;
  onClear: () => void;
}) => (
  <>
    {/* invisible layer: clicking anywhere outside the panel closes it */}
    <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

    <section
      role="dialog"
      aria-label="Notifications"
      className="fixed right-4 top-20 z-50 flex max-h-[80vh] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
    >
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-lg font-bold">Notifications</h2>
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button type="button" onClick={onClear} className="text-sm font-medium text-foreground/70 underline">
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="rounded-full px-2.5 py-1 text-lg leading-none hover:bg-muted"
          >
            ×
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <BellIcon className="h-16 w-16 text-foreground/30" />
          <p className="mt-2 font-semibold">Your notifications live here</p>
          <p className="text-sm text-foreground/70">
            Health alerts and vaccination reminders for your animals will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted">
                <span
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${n.severity === "high" ? "bg-red-600" : "bg-amber-500"}`}
                  aria-hidden="true"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{n.title}</span>
                  <span className="text-sm text-foreground/70">{n.detail}</span>
                  <span className="text-xs text-foreground/50">{n.timestamp}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  </>
);

const HomePage = ({
  animals,
  isLoading,
  isError,
  onViewAnimals,
}: {
  animals: Animal[];
  isLoading: boolean;
  isError: boolean;
  onViewAnimals: () => void;
}) => {
  const count = (s: Status) => animals.filter((a) => a.status === s).length;
  const cards: { status: Status; box: string }[] = [
    { status: "high", box: "border-red-300 bg-red-50 text-red-700" },
    { status: "watch", box: "border-amber-300 bg-amber-50 text-amber-800" },
    { status: "ok", box: "border-green-300 bg-green-50 text-green-800" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Livestock Health Dashboard</h1>
      <p className="text-sm text-foreground/70">Herd overview, vaccination reminders and health alerts.</p>

      {isError && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Could not load live herd data from the backend. Check that your server is running and `/animals` is reachable.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.status} className={`rounded-lg border p-4 ${c.box}`}>
            <p className="text-sm font-medium">{STATUS_LABEL[c.status]}</p>
            <p className="mt-1 text-3xl font-semibold">{isLoading ? "…" : count(c.status)}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onViewAnimals}
        className="mt-6 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        View all animals
      </button>
    </div>
  );
};

const AnimalsPage = ({
  animals,
  isLoading,
  isError,
}: {
  animals: Animal[];
  isLoading: boolean;
  isError: boolean;
}) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | Status>("");

  const shown = animals.filter((a) => {
    const q = query.trim().toLowerCase();
    if (q && !`${a.id} ${a.species} ${a.breed}`.toLowerCase().includes(q)) return false;
    if (status && a.status !== status) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Animals</h1>
      <p className="text-sm text-foreground/70">
        {isLoading ? "Loading animals…" : `${animals.length} animals on your farm.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ID, species or breed"
          aria-label="Search animals"
          className="min-w-[220px] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | Status)}
          aria-label="Filter by health status"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Any health status</option>
          <option value="high">High risk</option>
          <option value="watch">Under observation</option>
          <option value="ok">Healthy</option>
        </select>
      </div>

      {isError ? (
        <p className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Failed to fetch animals from the database.
        </p>
      ) : isLoading ? (
        <p className="mt-6 rounded-md border border-dashed p-4 text-sm text-foreground/70">Loading farm records…</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed p-4 text-sm text-foreground/70">No animals match these filters.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-lg font-semibold">{a.id}</p>
                <p className="text-sm text-foreground/70">
                  {a.species} · {a.breed} · {a.sex} · born {a.born}
                </p>
                {a.reason && <p className="mt-1 text-sm font-medium text-red-700">{a.reason}</p>}
                <p className="mt-1 text-sm text-foreground/70">Next vaccine: {a.nextVaccine}</p>
              </div>
              <StatusBadge status={a.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ---------------------------------- app ---------------------------------- */
const App = () => {
  const [view, setView] = useState<View>(DEV_BYPASS_AUTH ? "home" : "login");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [landingDone, setLandingDone] = useState(false);

  const queryClient = useQueryClient();
  const { user, isLoading } = useUser();

  const signedIn = DEV_BYPASS_AUTH || !!user;
  const onAuthScreen = view === "login" || view === "signup" || view === "otp";

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE_URL}/alerts`);
      return Array.isArray(res.data) ? res.data : res.data.alerts ?? [];
    },
    enabled: signedIn,
  });

  const {
    data: animals = [],
    isLoading: isAnimalsLoading,
    isError: isAnimalsError,
  } = useQuery<Animal[]>({
    queryKey: ["animals"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE_URL}/animals`);
      return Array.isArray(res.data) ? res.data : res.data.animals ?? [];
    },
    enabled: signedIn,
  });

  // If Cognito already has a session, never leave the person on a login screen.
  // This is what fixes "You are already signed in" with nothing happening.
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && user && onAuthScreen) setView("home");
  }, [user, onAuthScreen]);

  // Landing rule, once per sign-in:
  //   alerts exist -> stay on Home and pop the notifications panel over it
  //   no alerts    -> go straight to the animal list
  useEffect(() => {
    if (!signedIn || landingDone || view !== "home") return;
    setLandingDone(true);
    if (notifications.length > 0) setPanelOpen(true);
    else setView("animals");
  }, [signedIn, landingDone, view, notifications.length]);

  const handleVerificationRequired = (email: string) => {
    setVerificationEmail(email);
    setView("otp");
  };

  const handleLoginSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    setLandingDone(false);
    setView("home");
  };

  const resetSession = () => {
    queryClient.removeQueries({ queryKey: ["user"] });
    queryClient.removeQueries({ queryKey: ["animals"] });
    queryClient.removeQueries({ queryKey: ["alerts"] });
    setPanelOpen(false);
    setLandingDone(false);
  };

  const handleLogout = async () => {
    try {
      if (!DEV_BYPASS_AUTH) await signOut();
      resetSession();
      setView(DEV_BYPASS_AUTH ? "login" : "home");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      if (!DEV_BYPASS_AUTH) await signOut(); // sign out first, otherwise Cognito says "already signed in"
      resetSession();
      setView("login");
    } catch (error) {
      console.error("Switch account failed:", error);
    }
  };

  const goToAnimals = () => {
    setPanelOpen(false);
    setView("animals");
  };

  const tab = (name: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(name)}
      className={`rounded-md px-3.5 py-2 text-sm font-medium ${view === name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />

      <Header
        user={DEV_BYPASS_AUTH ? (PREVIEW_USER as unknown as typeof user) : user}
        isUserLoading={DEV_BYPASS_AUTH ? false : isLoading}
        onLogin={() => setView("login")}
        onCreateAccount={() => setView("signup")}
        onLogout={handleLogout}
        onSwitchAccount={handleSwitchAccount}
      />

      {view === "signup" && (
        <Signup onSignIn={() => setView("login")} onVerificationRequired={handleVerificationRequired} />
      )}

      {view === "login" && (
        <Login
          onSignUp={() => setView("signup")}
          onVerificationRequired={handleVerificationRequired}
          onSuccess={handleLoginSuccess}
        />
      )}

      {view === "otp" && (
        <Otp
          email={verificationEmail}
          onSuccess={() => setView("login")}
          onBackToLogin={() => setView("login")}
        />
      )}

      {/* Signed in: Home or Animals, with a small menu bar */}
      {signedIn && (view === "home" || view === "animals") && (
        <main className="mx-auto max-w-5xl px-4 py-6">
          <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4" aria-label="Main">
            <div className="flex gap-2">
              {tab("home", "Home")}
              {tab("animals", "Animals")}
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              aria-label={`Notifications, ${notifications.length} unread`}
              className="relative flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium hover:bg-muted"
            >
              <BellIcon />
              Notifications
              {notifications.length > 0 && (
                <span className="rounded-full bg-red-600 px-2 text-xs font-semibold text-white">{notifications.length}</span>
              )}
            </button>
          </nav>

          {view === "home" && (
            <HomePage
              animals={animals}
              isLoading={isAnimalsLoading}
              isError={isAnimalsError}
              onViewAnimals={goToAnimals}
            />
          )}
          {view === "animals" && (
            <AnimalsPage animals={animals} isLoading={isAnimalsLoading} isError={isAnimalsError} />
          )}
        </main>
      )}

      {/* Signed out (real login mode): simple front page */}
      {!signedIn && view === "home" && (
        <main className="flex min-h-[calc(100vh-100px)] flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-3xl font-semibold">Livestock Health</h1>
          <p className="max-w-md text-foreground/70">Log vaccines, treatments and symptoms, and get early warnings for your animals.</p>
          <button
            type="button"
            onClick={() => setView("login")}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Sign in
          </button>
        </main>
      )}

      {signedIn && panelOpen && (
        <NotificationsPanel
          items={notifications}
          onClose={() => setPanelOpen(false)}
          onOpen={goToAnimals}
          onClear={() => queryClient.setQueryData(["alerts"], [])}
        />
      )}

      <footer className="py-5 text-center text-xs text-foreground/70">
        Livestock Health Platform · Better livestock health through better information.
      </footer>
    </div>
  );
};

export default App;