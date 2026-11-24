import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { signOut } from "aws-amplify/auth";
import { Toaster } from "sonner";

import Header from "./modules/header/page";
import Login from "./modules/auth/login/page";
import Signup from "./modules/auth/signup/page";
import Otp from "./modules/auth/otp/page";
import AnimalsPage, {
  evaluateHerdIntelligence,
  type ApiAnimal,
  type RiskLevel,
} from "./modules/animalpage";
import useUser from "./hooks/userUser";

type AuthView = "animals" | "login" | "signup" | "otp";

const DEV_BYPASS_AUTH = false;

const API_BASE_URL =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "http://localhost:5000";

type AppNotification = {
  id: string;
  title: string;
  detail: string;
  severity?: "high" | "watch" | "info";
  timestamp?: string;
};

const BellIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.7 21a2 2 0 0 1-3.4 0"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MenuIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className={className}
    aria-hidden="true"
  >
    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NotificationsPanel = ({
  items,
  onClose,
  onSelectAlert,
  onClear,
}: {
  items: AppNotification[];
  onClose: () => void;
  onSelectAlert: () => void;
  onClear: () => void;
}) => (
  <>
    <div
      className="fixed inset-0 z-40 bg-black/25"
      onClick={onClose}
      aria-hidden="true"
    />

    <section
      role="dialog"
      aria-label="Alerts"
      className="fixed right-4 top-20 z-50 flex max-h-[80vh] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-black/5"
    >
      <header className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-bold text-foreground">Alerts</h2>
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-foreground/70 underline"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close alerts"
            className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium hover:opacity-80"
          >
            ×
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <BellIcon className="h-12 w-12 text-foreground/30" />
          <p className="mt-1 text-sm font-semibold text-foreground">No alerts right now</p>
          <p className="text-xs text-foreground/65">
            Health warnings and vaccination check-ins will pop up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-black/5 overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={onSelectAlert}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-muted/50"
              >
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    n.severity === "high" ? "bg-red-600" : "bg-amber-500"
                  }`}
                  aria-hidden="true"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{n.title}</span>
                  <span className="text-xs text-foreground/70">{n.detail}</span>
                  {n.timestamp && (
                    <span className="text-[11px] text-foreground/50">{n.timestamp}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  </>
);

const HerdSidebar = ({
  open,
  onClose,
  totalCount,
  healthyCount,
  attentionCount,
  highRiskCount,
  activeFilter,
  onSelectFilter,
}: {
  open: boolean;
  onClose: () => void;
  totalCount: number;
  healthyCount: number;
  attentionCount: number;
  highRiskCount: number;
  activeFilter: "all" | RiskLevel;
  onSelectFilter: (filter: "all" | RiskLevel) => void;
}) => {
  if (!open) return null;

  const items: {
    key: "all" | RiskLevel;
    label: string;
    count: number;
    labelClass: string;
  }[] = [
    {
      key: "all",
      label: "All animals",
      count: totalCount,
      labelClass: "text-foreground",
    },
    {
      key: "ok",
      label: "Healthy",
      count: healthyCount,
      labelClass: "text-green-700",
    },
    {
      key: "watch",
      label: "Needs attention",
      count: attentionCount,
      labelClass: "text-amber-700",
    },
    {
      key: "high",
      label: "High risk",
      count: highRiskCount,
      labelClass: "text-red-700",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label="Herd status filter"
        className="relative z-10 flex h-full w-72 max-w-[82vw] flex-col justify-between bg-background p-5 shadow-2xl"
      >
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Herd overview</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sidebar"
              className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium hover:opacity-80"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-foreground/65">
            Tap a category to filter your animals.
          </p>

          <div className="mt-5 space-y-2.5">
            {items.map((item) => {
              const selected = activeFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelectFilter(item.key);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl p-4 text-left transition ${
                    selected
                      ? "bg-muted ring-1 ring-black/10"
                      : "bg-muted/40 hover:bg-muted/70"
                  }`}
                >
                  <span className={`text-sm font-semibold ${item.labelClass}`}>
                    {item.label}
                  </span>
                  <span className="text-xl font-bold text-foreground">{item.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-foreground/55">Lily Arusei</p>
      </aside>
    </div>
  );
};

const App = () => {
  const [authView, setAuthView] = useState<AuthView>(DEV_BYPASS_AUTH ? "animals" : "login");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | RiskLevel>("all");
  const [clearedAlerts, setClearedAlerts] = useState(false);
  const autoPoppedRef = useRef(false);

  const queryClient = useQueryClient();
  const { user, isLoading } = useUser();

  const signedIn = DEV_BYPASS_AUTH || !!user;
  const onAuthScreen =
    authView === "login" || authView === "signup" || authView === "otp";

  // Land directly on the Animals list when signed in
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && !isLoading && user && onAuthScreen) {
      setAuthView("animals");
    }
  }, [user, isLoading, onAuthScreen]);

  const { data: animals = [] } = useQuery<ApiAnimal[]>({
    queryKey: ["animals"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE_URL}/animals`);
      return Array.isArray(res.data) ? res.data : res.data.animals ?? [];
    },
    enabled: signedIn,
  });

  const { riskById, areaClusterAlert, herdRecentSymptomAnimals } =
    evaluateHerdIntelligence(animals);

  const countByRisk = (level: RiskLevel) =>
    animals.filter((a) => riskById.get(a.id)?.risk === level).length;

  const computedAlerts: AppNotification[] = useMemo(() => {
    if (clearedAlerts) return [];
    const list: AppNotification[] = [];
    if (areaClusterAlert) {
      list.push({
        id: "cluster-alert",
        title: "Area symptom cluster detected",
        detail: `${herdRecentSymptomAnimals} animals reported symptoms recently and were flagged for veterinary review.`,
        severity: "high",
        timestamp: "Live check",
      });
    }
    animals.forEach((a) => {
      const info = riskById.get(a.id);
      if (info && info.risk !== "ok" && info.reason) {
        list.push({
          id: `animal-${a.id}`,
          title: `${a.tagNumber} · ${info.risk === "high" ? "High risk" : "Needs attention"}`,
          detail: info.reason,
          severity: info.risk === "high" ? "high" : "watch",
          timestamp: "Herd log",
        });
      }
    });
    return list;
  }, [animals, areaClusterAlert, clearedAlerts, herdRecentSymptomAnimals, riskById]);

  const unreadCount = useMemo(() => computedAlerts.length, [computedAlerts]);

  // Automatically pop up Alerts when opening the app if there are active alerts
  useEffect(() => {
    if (signedIn && authView === "animals" && !autoPoppedRef.current && unreadCount > 0) {
      autoPoppedRef.current = true;
      setShowNotifications(true);
    }
  }, [signedIn, authView, unreadCount]);

  const handleVerificationRequired = (email: string) => {
    setVerificationEmail(email);
    setAuthView("otp");
  };

  const handleLoginSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    setClearedAlerts(false);
    autoPoppedRef.current = false;
    setAuthView("animals");
  };

  const handleLogout = async () => {
    try {
      if (!DEV_BYPASS_AUTH) {
        await signOut();
      }
      queryClient.removeQueries({ queryKey: ["user"] });
      queryClient.removeQueries({ queryKey: ["animals"] });
      setShowNotifications(false);
      setClearedAlerts(false);
      autoPoppedRef.current = false;
      setAuthView("login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const activeUserId =
    user && typeof user === "object" && "id" in user && user.id
      ? String(user.id)
      : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />

      {!signedIn && (
        <Header
          user={user}
          isUserLoading={DEV_BYPASS_AUTH ? false : isLoading}
          onLogin={() => setAuthView("login")}
          onCreateAccount={() => setAuthView("signup")}
          onLogout={handleLogout}
        />
      )}

      {authView === "signup" && (
        <Signup
          onSignIn={() => setAuthView("login")}
          onVerificationRequired={handleVerificationRequired}
        />
      )}

      {authView === "login" && (
        <Login
          onSignUp={() => setAuthView("signup")}
          onVerificationRequired={handleVerificationRequired}
          onSuccess={handleLoginSuccess}
        />
      )}

      {authView === "otp" && (
        <Otp
          email={verificationEmail}
          onSuccess={() => setAuthView("login")}
          onBackToLogin={() => setAuthView("login")}
        />
      )}

      {signedIn && authView === "animals" && (
        <main className="mx-auto max-w-3xl px-4 py-5">
          {/* Clean Top Bar: Sidebar Trigger + Title + Farmer Name + Alerts */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open herd overview sidebar"
                className="rounded-xl bg-muted/60 p-2.5 text-foreground hover:bg-muted"
              >
                <MenuIcon />
              </button>
              <div>
                <p className="text-base font-bold leading-tight text-foreground">
                  Livestock Health
                </p>
                <p className="text-xs text-foreground/65">Lily Arusei</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <BellIcon />
              <span>Alerts{unreadCount > 0 ? ` (${unreadCount})` : ""}</span>
            </button>
          </div>

          <AnimalsPage
            ownerId={activeUserId}
            role="FARMER"
            statusFilter={statusFilter}
            onClearFilter={() => setStatusFilter("all")}
            onChanged={() => {
              setClearedAlerts(false);
              queryClient.invalidateQueries({ queryKey: ["animals"] });
            }}
          />
        </main>
      )}

      {signedIn && (
        <HerdSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          totalCount={animals.length}
          healthyCount={countByRisk("ok")}
          attentionCount={countByRisk("watch")}
          highRiskCount={countByRisk("high")}
          activeFilter={statusFilter}
          onSelectFilter={setStatusFilter}
        />
      )}

      {signedIn && showNotifications && (
        <NotificationsPanel
          items={computedAlerts}
          onClose={() => setShowNotifications(false)}
          onSelectAlert={() => {
            setShowNotifications(false);
          }}
          onClear={() => setClearedAlerts(true)}
        />
      )}

      <footer className="py-5 text-center text-xs text-foreground/65">
        Livestock Health Platform · Better livestock health through better information.
      </footer>
    </div>
  );
};

export default App;