import { useEffect, useState } from "react";
import type { ComponentType } from "react";
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
import { AuthContext } from "./auth";
import Assets from "./pages/Assets";
import CommandCentre from "./pages/CommandCentre";
import Events from "./pages/Events";
import HelpSupport from "./pages/HelpSupport";
import Login from "./pages/Login";
import People from "./pages/People";
import Register from "./pages/Register";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

type IconProps = { className?: string };

function IconGrid({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconPeople({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7.3" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.3 16.2c0-2.7 2.2-4.4 5-4.4s5 1.7 5 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="14.3" cy="6.1" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M13.2 12c2 .2 3.6 1.7 3.6 4.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCalendar({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.8" width="15" height="13.2" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 7.6h15M6.2 2.3v2.6M13.8 2.3v2.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChart({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.2 17V9.7M9 17V3M14.8 17v-6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2.3 17h15.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 6h5M12.4 6H16M4 10h2.6M9.6 10H16M4 14h6.4M13.8 14H16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10.2" cy="6" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="10" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconHelp({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.7 7.9c0-1.3 1-2.2 2.3-2.2 1.3 0 2.3.9 2.3 2 0 1.5-2.3 1.6-2.3 3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconSignOut({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M8.6 3.2H5A1.5 1.5 0 0 0 3.5 4.7v10.6A1.5 1.5 0 0 0 5 16.8h3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.7 16 10l-4 3.3M16 10H7.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV: { to: string; label: string; icon: ComponentType<IconProps> }[] = [
  { to: "/", label: "Command Centre", icon: IconGrid },
  { to: "/people", label: "People & tiers", icon: IconPeople },
  { to: "/events", label: "Events & Academy", icon: IconCalendar },
];

const NAV_SECONDARY: { to: string; label: string; icon: ComponentType<IconProps> }[] = [
  { to: "/reports", label: "Reports", icon: IconChart },
  { to: "/settings", label: "Settings", icon: IconSettings },
  { to: "/help", label: "Help & support", icon: IconHelp },
];

/**
 * The CU lockup, for use on the emerald sidebar and sign-in chip.
 *
 * Typographic rather than the bitmap mark: the `logo-cu.png` shipped in the
 * design project is malformed — its IDAT chunk declares 14,086 bytes but only
 * 13,916 are present, so browsers draw roughly the top 95% and stop. It is also
 * dark artwork, which would need inverting to read on emerald at all. Drop a
 * clean, light-on-transparent asset at `public/logo-cu.png` and swap the
 * wordmark below for an <img>.
 */
export function Brand({ size = 38, stacked = false }: { size?: number; stacked?: boolean }) {
  if (stacked) {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="text-[1.125rem] font-bold leading-none tracking-[-0.01em] text-white">
          Community<span className="text-cu-teal">Unlimited</span>
        </span>
        <span className="text-cu-caption font-bold uppercase tracking-[0.14em] text-cu-teal">
          CU-OS
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-none items-baseline gap-2.5" style={{ height: size }}>
      <span className="self-center text-[1.0625rem] font-bold leading-none tracking-[-0.01em] text-white">
        Community<span className="text-cu-teal">Unlimited</span>
      </span>
      <span aria-hidden="true" className="self-center h-4 w-px bg-cu-teal-edge/40" />
      <span className="self-center text-cu-caption font-bold uppercase tracking-[0.14em] text-cu-teal">
        CU-OS
      </span>
    </span>
  );
}

function NavItem({
  to,
  label,
  Icon,
  active,
}: {
  to: string;
  label: string;
  Icon: ComponentType<IconProps>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`tap-target flex items-center gap-3 rounded-xl px-3.5 text-cu-body ${
        active
          ? "bg-cu-teal-edge/20 font-bold text-white shadow-[inset_3px_0_0_var(--color-cu-teal)]"
          : "font-medium text-cu-teal-edge hover:bg-cu-teal-edge/15 hover:text-white"
      }`}
    >
      <Icon className="size-5 flex-none" />
      {label}
    </Link>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      {NAV.map((item) => (
        <NavItem key={item.to} to={item.to} label={item.label} Icon={item.icon} active={pathname === item.to} />
      ))}
      <div aria-hidden="true" className="my-3 border-t border-cu-teal-edge/20" />
      {NAV_SECONDARY.map((item) => (
        <NavItem key={item.to} to={item.to} label={item.label} Icon={item.icon} active={pathname === item.to} />
      ))}
    </nav>
  );
}

function SidebarFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex flex-col gap-1 border-t border-cu-teal-edge/20 pt-4">
      <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2">
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-cu-teal-edge/25 text-cu-caption font-bold text-white">
          CU
        </span>
        <span className="min-w-0 truncate text-cu-body font-semibold text-white">
          Community Unlimited
        </span>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="tap-target flex items-center gap-3 rounded-xl px-3.5 text-cu-body font-medium text-cu-teal-edge hover:bg-cu-teal-edge/15 hover:text-white"
      >
        <IconSignOut className="size-5 flex-none" />
        Sign out
      </button>
    </div>
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

  return (
    <div className="min-h-screen bg-cu-sage md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-cu-teal-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* mobile top bar — the sidebar collapses into a slide-out sheet below md */}
      <div className="sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-3 bg-cu-emerald px-4 py-2.5 md:hidden">
        <Link to="/" aria-label="Command Centre" className="shrink-0">
          <Brand size={34} />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="tap-target inline-flex items-center gap-2 rounded-xl border-[1.5px] border-cu-teal-edge/45 px-3.5 text-cu-body font-semibold text-cu-teal-edge"
        >
          <span aria-hidden="true" className="text-[1.25rem] leading-none">
            {menuOpen ? "✕" : "☰"}
          </span>
          Menu
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-cu-emerald-ink/50"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="mobile-menu"
            className="absolute inset-y-0 left-0 flex w-[280px] flex-col gap-6 overflow-y-auto bg-cu-emerald px-5 py-6"
          >
            <Brand stacked />
            <SidebarNav pathname={pathname} />
            <SidebarFooter onSignOut={onSignOut} />
          </div>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[260px] flex-none flex-col gap-6 overflow-y-auto bg-cu-emerald px-5 py-7 md:flex">
        <Link to="/" aria-label="Command Centre">
          <Brand stacked />
        </Link>
        <SidebarNav pathname={pathname} />
        <SidebarFooter onSignOut={onSignOut} />
      </aside>

      <div className="min-w-0 flex-1">
        <main
          id="main"
          className="mx-auto flex max-w-[1760px] flex-col gap-7 px-4 pb-16 pt-6 sm:px-8 sm:pt-9 lg:px-11"
        >
          {children}
        </main>
      </div>
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
                <AuthContext.Provider value={{ signOut }}>
                  <Shell onSignOut={signOut}>
                    <Routes>
                      <Route path="/" element={<CommandCentre />} />
                      <Route path="/people" element={<People />} />
                      <Route path="/events" element={<Events />} />
                      <Route path="/assets" element={<Assets />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/help" element={<HelpSupport />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Shell>
                </AuthContext.Provider>
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
