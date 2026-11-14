import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post, setToken } from "../api/client";
import { Banner, Button, Field, inputClass } from "../components/ui";
import { Brand } from "../App";

interface TokenResponse {
  access_token: string;
  role: string;
  full_name: string;
}

const loginInputClass = `${inputClass} shadow-[0_1px_2px_rgba(5,53,49,0.04)] transition-all duration-150 hover:border-cu-teal-mid focus:outline-2 focus:outline-transparent focus:ring-4 focus:ring-cu-teal/25`;

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ask the API whether it is there, rather than inferring it from the build
  // config. The old check assumed "no VITE_API_BASE_URL means no backend",
  // which was true only while the frontend was deployed on its own. Now that
  // the API serves this page from the same origin, an empty base is the
  // normal case — the guess reported a working connection as broken.
  const [apiDown, setApiDown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    get<{ status: string }>("/api/health")
      .then(() => !cancelled && setApiDown(false))
      .catch(() => !cancelled && setApiDown(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await post<TokenResponse>("/api/auth/login", {
        email,
        password,
      });
      setToken(result.access_token);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-cu-emerald p-4 sm:p-6">
      <div className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-cu-teal-edge/20 bg-cu-surface shadow-[0_20px_56px_rgba(5,53,49,0.42)]">
        <div className="h-2 bg-gradient-to-r from-cu-teal-ink via-cu-teal to-cu-orange" />
        <div className="p-6 sm:p-9">
          <span className="inline-flex items-center rounded-xl bg-cu-emerald px-3.5 py-2.5 shadow-sm">
            <Brand size={34} />
          </span>

          <h1 className="mt-5 text-[2rem] font-bold leading-tight tracking-[-0.015em] text-cu-emerald">
            Sign in
          </h1>
          <p className="mt-2 text-cu-body leading-relaxed text-cu-body-text">
            The capacity engine behind Community Unlimited. Ask a coordinator if
            you need access.
          </p>

          {apiDown && (
            <div className="mt-5">
              <Banner tone="amber">
                <strong>Can&apos;t reach the server.</strong> It may be starting up —
                wait a moment and try again.
              </Banner>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <Banner tone="red">{error}</Banner>}
            <Field label="Email" required>
              <input
                type="email"
                className={loginInputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@communityunlimited.sg"
              />
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className={`${loginInputClass} pr-20`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="tap-target absolute inset-y-0 right-1.5 my-auto flex items-center rounded-lg px-3 text-cu-caption font-bold text-cu-teal-ink hover:bg-cu-teal-tint"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
            <Button
              type="submit"
              disabled={busy}
              className="mt-2 w-full py-3.5 text-[1.0625rem] shadow-[0_6px_18px_rgba(234,92,42,0.22)]"
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 border-t border-cu-line pt-5">
            <p className="text-cu-body text-cu-body-text">
              Registering someone instead?{" "}
              <Link
                to="/register"
                className="font-bold text-cu-teal-ink underline decoration-2 underline-offset-4 hover:text-cu-emerald"
              >
                Open the registration form
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
