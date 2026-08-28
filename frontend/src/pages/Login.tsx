import { useState } from "react";
import { apiBase, post, setToken } from "../api/client";
import { Banner, Button, Card, Field, inputClass } from "../components/ui";

/**
 * A deployed static build with no VITE_API_BASE_URL has no backend to talk to.
 * Say so plainly rather than letting sign-in fail with a bare 404.
 */
function apiUnreachable(): boolean {
  if (apiBase()) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

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
    <div className="mx-auto mt-12 max-w-md">
      <div className="mb-6 text-center">
        <p className="font-display text-cu-h1 leading-tight text-cu-teal-ink">
          CU-OS
        </p>
        <p className="text-cu-body text-cu-body-text">
          Community Unlimited · staff sign in
        </p>
      </div>
      {apiUnreachable() && (
        <div className="mb-4">
          <Banner tone="amber">
            <strong>No API connected.</strong> This is the CU-OS interface
            deployed on its own. Sign-in and data need the FastAPI backend
            running and <code>VITE_API_BASE_URL</code> pointed at it.
          </Banner>
        </div>
      )}
      <Card>
        <form onSubmit={submit} className="space-y-4">
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
      </Card>
      <p className="mt-4 text-center text-cu-caption text-cu-body-text">
        Community members don't need an account — they register and take part
        over WhatsApp.
      </p>
    </div>
  );
}
