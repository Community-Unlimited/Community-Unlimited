/**
 * Settings — the one real thing here is who you're signed in as. Programme
 * configuration (calendar rules, WhatsApp provider, targets) lives in `.env`
 * and seed data, not a settings screen, so this page doesn't pretend
 * otherwise with controls that don't do anything yet.
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import type { CurrentUser } from "../api/types";
import { Banner, Card, SectionTitle, Spinner } from "../components/ui";

export default function Settings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => get<CurrentUser>("/api/auth/me"),
  });

  return (
    <>
      <div>
        <h1 className="text-cu-h1 font-bold leading-[1.15] tracking-[-0.015em] text-cu-emerald">
          Settings
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[1.0625rem] text-cu-body-text">
          Account details for this sign-in. Programme-wide configuration
          isn't editable from the UI yet.
        </p>
      </div>

      {error && <Banner tone="red">{(error as Error).message}</Banner>}

      <Card className="max-w-xl">
        <SectionTitle>Signed in as</SectionTitle>
        {isLoading ? (
          <Spinner label="Loading account" />
        ) : data ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-cu-body">
            <dt className="font-semibold text-cu-body-text">Name</dt>
            <dd className="text-cu-ink">{data.full_name}</dd>
            <dt className="font-semibold text-cu-body-text">Email</dt>
            <dd className="text-cu-ink">{data.email}</dd>
            <dt className="font-semibold text-cu-body-text">Role</dt>
            <dd className="capitalize text-cu-ink">{data.role}</dd>
          </dl>
        ) : null}
      </Card>
    </>
  );
}
