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

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="grid min-h-screen place-items-center bg-cu-emerald p-6">
      <div className="w-full max-w-[420px] rounded-2xl bg-cu-panel p-6 shadow-[0_18px_50px_rgba(5,53,49,.35)] sm:p-9">
        <span className="inline-flex items-center rounded-xl bg-cu-emerald px-3.5 py-2.5">
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
              <strong>Can't reach the server.</strong> It may be starting up —
              wait a moment and try again.
            </Banner>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Banner tone="red">{error}</Banner>}
          <Field label="Email" required>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </Field>
          <Field label="Password" required>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-cu-body text-cu-body-text">
          Registering someone instead?{" "}
          <Link
            to="/register"
            className="font-bold text-cu-teal-ink underline"
          >
            Open the registration form
          </Link>
        </p>
      </div>
    </div>
  );
}
