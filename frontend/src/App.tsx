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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const NAV = [
  { to: "/", label: "Command Centre" },
  { to: "/people", label: "People & tiers" },
  { to: "/events", label: "Events & Academy" },
];

function Shell({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-cu focus:bg-cu-teal-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header className="border-b border-cu-line bg-cu-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 rounded-full bg-cu-teal"
            />
            <span className="font-display text-cu-h3 text-cu-teal-ink">CU-OS</span>
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`tap-target inline-flex items-center rounded-cu px-4 py-2 text-cu-body font-medium ${
                    active
                      ? "bg-cu-teal-tint text-cu-teal-ink"
                      : "text-cu-body-text hover:bg-cu-line-soft"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/register"
              className="tap-target inline-flex items-center rounded-cu px-4 py-2 text-cu-body font-medium text-cu-teal-ink hover:bg-cu-teal-tint"
            >
              Registration form
            </Link>
            <button
              onClick={onSignOut}
              className="tap-target rounded-cu px-4 py-2 text-cu-body font-medium text-cu-body-text hover:bg-cu-line-soft"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 text-cu-caption text-cu-muted">
        Community Unlimited remains the connector. The human community remains
        in charge.
      </footer>
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
          {/* Public - no sign-in, this is what a resident sees. */}
          <Route
            path="/register"
            element={
              <main className="mx-auto max-w-7xl px-4 py-10">
                <Register />
              </main>
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
