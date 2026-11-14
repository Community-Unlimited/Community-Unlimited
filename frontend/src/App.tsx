import { useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getToken, setToken } from "./api/client";
import CommandCentre from "./pages/CommandCentre";
import Events from "./pages/Events";
import Login from "./pages/Login";
import People from "./pages/People";
import Register from "./pages/Register";
import Signups from "./pages/Signups";
import WhatsAppAdmin from "./pages/WhatsAppAdmin";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const NAV = [
  { to: "/", label: "Command Centre" },
  { to: "/signups", label: "Sign-ups" },
  { to: "/people", label: "People & Tiers" },
  { to: "/events", label: "Events & Academy" },
  { to: "/whatsapp", label: "WhatsApp" },
];

/**
 * The CU-OS lockup, for use on the emerald header and sign-in chip.
 */
export function Brand({
  size = 40,
  subtitle = "Community Unlimited",
  badge = "OPS",
}: {
  size?: number;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <span className="flex flex-none items-center gap-3" style={{ minHeight: size }}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#10b981] text-sm font-extrabold tracking-tight text-white shadow-xs">
        CU
      </span>
      <span className="flex flex-col">
        <span className="flex items-center gap-2">
          <span className="text-[1.0625rem] font-bold leading-none text-white">
            CU-OS
          </span>
          <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-cu-teal-edge">
            {badge}
          </span>
        </span>
        <span className="mt-0.5 text-xs font-medium leading-none text-cu-teal-edge/85">
          {subtitle}
        </span>
      </span>
    </span>
  );
}

function Shell({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentNav =
    NAV.find((item) => item.to === pathname) ?? NAV[0];

  const navLink = (item: (typeof NAV)[number], stacked: boolean) => {
    const active = pathname === item.to;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`tap-target inline-flex items-center rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
          stacked ? "w-full rounded-xl px-4 py-2.5 text-cu-body" : ""
        } ${
          active
            ? "bg-white font-bold text-cu-emerald shadow-xs"
            : "font-medium text-cu-teal-edge hover:bg-white/10 hover:text-white"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-cu-sage">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-cu-teal-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 bg-cu-emerald text-white">
        <div className="mx-auto flex min-h-[64px] max-w-[1760px] items-center gap-3 px-4 py-2.5 sm:px-8 lg:px-11">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            aria-label="Command Centre"
            className="shrink-0"
          >
            <Brand subtitle={currentNav.label} />
          </Link>

          <nav aria-label="Main" className="ml-4 hidden gap-1.5 lg:flex">
            {NAV.map((item) => navLink(item, false))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/register"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#1aa39a] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#178f87] sm:text-sm"
            >
              + Add Member
            </Link>

            <button
              type="button"
              onClick={onSignOut}
              className="hidden whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-cu-teal-edge transition hover:bg-white/20 hover:text-white lg:inline-flex"
            >
              Sign out
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="tap-target inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 lg:hidden"
            >
              <span aria-hidden="true" className="text-base leading-none">
                {menuOpen ? "✕" : "☰"}
              </span>
              Menu
            </button>
          </div>
        </div>

        {/* Mobile slide-down navigation sheet */}
        {menuOpen && (
          <div
            id="mobile-menu"
            className="border-t border-white/10 bg-[#032623] px-4 pb-5 pt-3 sm:px-8 lg:hidden"
          >
            <nav aria-label="Mobile" className="flex flex-col gap-1.5">
              {NAV.map((item) => navLink(item, true))}
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className="tap-target flex items-center justify-center rounded-xl border border-white/20 bg-white/5 py-2.5 text-sm font-semibold text-cu-teal-edge hover:bg-white/10 hover:text-white"
              >
                Public registration form
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
                className="tap-target flex items-center justify-center rounded-xl py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/15"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      <main id="main" className="flex w-full flex-col pb-16">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean>(() => Boolean(getToken()));

  function signOut() {
    setToken(null);
    setSignedIn(false);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public — no sign-in. This is what a resident sees. */}
          <Route
            path="/register"
            element={
              <div className="min-h-screen bg-cu-sage">
                <main className="mx-auto max-w-[1760px] px-4 py-5 sm:px-8 sm:py-10">
                  <Register />
                </main>
              </div>
            }
          />
          <Route
            path="*"
            element={
              signedIn ? (
                <Shell onSignOut={signOut}>
                  <Routes>
                    <Route path="/" element={<CommandCentre />} />
                    <Route path="/signups" element={<Signups />} />
                    <Route path="/people" element={<People />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/whatsapp" element={<WhatsAppAdmin />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Shell>
              ) : (
                <Login onSignedIn={() => setSignedIn(true)} />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
