import { useEffect, useState } from "react";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const NAV = [
  { to: "/", label: "Command Centre" },
  { to: "/people", label: "People & tiers" },
  { to: "/events", label: "Events & Academy" },
];

/**
 * The CU lockup, for use on the emerald header and sign-in chip.
 *
 * Typographic rather than the bitmap mark: the `logo-cu.png` shipped in the
 * design project is malformed — its IDAT chunk declares 14,086 bytes but only
 * 13,916 are present, so browsers draw roughly the top 95% and stop. It is also
 * dark artwork, which would need inverting to read on emerald at all. Drop a
 * clean, light-on-transparent asset at `public/logo-cu.png` and swap the
 * wordmark below for an <img>.
 */
export function Brand({ size = 38 }: { size?: number }) {
  return (
    <span className="flex flex-none items-baseline gap-2.5" style={{ height: size }}>
      <span className="self-center text-[1.0625rem] font-bold leading-none tracking-[-0.01em] text-white">
        Community<span className="text-cu-teal">Unlimited</span>
      </span>
      <span
        aria-hidden="true"
        className="self-center h-4 w-px bg-cu-teal-edge/40"
      />
      <span className="self-center text-cu-caption font-bold uppercase tracking-[0.14em] text-cu-teal">
        CU-OS
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

  // Close the sheet whenever the route changes, so tapping a link doesn't
  // leave the menu covering the page it just opened.
  useEffect(() => setMenuOpen(false), [pathname]);

  const navLink = (item: (typeof NAV)[number], stacked: boolean) => {
    const active = pathname === item.to;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={`tap-target inline-flex items-center rounded-xl px-4 text-cu-body ${
          stacked ? "w-full" : ""
        } ${
          active
            ? "bg-cu-teal-edge/20 font-bold text-white shadow-[inset_0_-3px_0_var(--color-cu-teal)]"
            : "font-medium text-cu-teal-edge hover:bg-cu-teal-edge/15 hover:text-white"
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

      <header className="sticky top-0 z-20 bg-cu-emerald">
        {/* One row at every width. Below md the links move into a sheet — the
            previous flex-wrap layout stacked into three rows on a phone and
            ate roughly half the viewport before any content. */}
        <div className="mx-auto flex min-h-[64px] max-w-[1760px] items-center gap-4 px-4 py-2.5 sm:px-8 lg:px-11">
          <Link to="/" aria-label="Command Centre" className="shrink-0">
            <Brand />
          </Link>

          <nav aria-label="Main" className="ml-2 hidden gap-1 md:flex">
            {NAV.map((item) => navLink(item, false))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <Link
              to="/register"
              className="tap-target inline-flex items-center rounded-xl border-[1.5px] border-cu-teal-edge/45 px-4 text-cu-body font-semibold text-cu-teal-edge hover:border-cu-teal-ink hover:bg-cu-teal-tint hover:text-cu-teal-ink"
            >
              Registration form
            </Link>
            <span aria-hidden="true" className="h-7 w-px bg-cu-teal-edge/30" />
            <button
              onClick={onSignOut}
              className="tap-target rounded-xl px-3.5 text-cu-body font-medium text-cu-teal-edge hover:bg-cu-teal-edge/15 hover:text-white"
            >
              Sign out
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="tap-target ml-auto inline-flex items-center gap-2 rounded-xl border-[1.5px] border-cu-teal-edge/45 px-3.5 text-cu-body font-semibold text-cu-teal-edge md:hidden"
          >
            <span aria-hidden="true" className="text-[1.25rem] leading-none">
              {menuOpen ? "✕" : "☰"}
            </span>
            Menu
          </button>
        </div>

        {menuOpen && (
          <div
            id="mobile-menu"
            className="border-t border-cu-teal-edge/20 px-4 pb-4 pt-2 md:hidden"
          >
            <nav aria-label="Main" className="flex flex-col gap-1">
              {NAV.map((item) => navLink(item, true))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-cu-teal-edge/20 pt-3">
              <Link
                to="/register"
                className="tap-target inline-flex w-full items-center rounded-xl border-[1.5px] border-cu-teal-edge/45 px-4 text-cu-body font-semibold text-cu-teal-edge"
              >
                Registration form
              </Link>
              <button
                onClick={onSignOut}
                className="tap-target w-full rounded-xl px-4 text-left text-cu-body font-medium text-cu-teal-edge hover:bg-cu-teal-edge/15 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      <main
        id="main"
        className="mx-auto flex max-w-[1760px] flex-col gap-7 px-4 pb-16 pt-6 sm:px-8 sm:pt-9 lg:px-11"
      >
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));

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
                <main className="mx-auto max-w-[1760px] px-4 py-10 sm:px-8">
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
                    <Route path="/people" element={<People />} />
                    <Route path="/events" element={<Events />} />
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
