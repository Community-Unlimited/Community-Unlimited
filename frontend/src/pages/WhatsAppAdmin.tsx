import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { WhatsAppAdminStatus } from "../api/types";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
  WhatsAppIcon,
} from "../components/icons";
import {
  Banner,
  EmeraldBand,
  PageContent,
  RosterHeader,
  TelemetryBar,
  TelemetryStat,
} from "../components/ui";

export default function WhatsAppAdmin() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  // Poll frequently (every 3s) if we are waiting for a QR scan or starting up
  const { data: status, isLoading, error, refetch } = useQuery<WhatsAppAdminStatus>({
    queryKey: ["whatsapp-status"],
    queryFn: () => get<WhatsAppAdminStatus>("/api/whatsapp/admin/status"),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "qr" || state === "starting" ? 3000 : 30000;
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => post<WhatsAppAdminStatus>("/api/whatsapp/admin/connect"),
    onSuccess: (data) => {
      setActionError(null);
      queryClient.setQueryData(["whatsapp-status"], data);
      refetch();
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to start connection");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => post<WhatsAppAdminStatus>("/api/whatsapp/admin/disconnect"),
    onSuccess: (data) => {
      setActionError(null);
      setConfirmDisconnect(false);
      queryClient.setQueryData(["whatsapp-status"], data);
      refetch();
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to disconnect");
    },
  });

  const isConnected = status?.connected === true && status?.state === "connected";
  const isQrState = status?.state === "qr" && !!status?.qrDataUrl;
  const isStarting = status?.state === "starting" || connectMutation.isPending;

  const stateLabel = isConnected
    ? "Connected & Active"
    : isQrState
      ? "Awaiting QR Scan"
      : isStarting
        ? "Starting Bridge…"
        : "Not Linked";

  return (
    <>
      <EmeraldBand>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#032623]/70 p-3.5 sm:p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-cu-teal-edge">
              WhatsApp Bridge · Oracle Cloud VM (ap-singapore-1)
            </p>
            <h2 className="mt-1 text-base font-bold text-white sm:text-xl">
              Official Coordinator WhatsApp Channel
            </h2>
            <p className="mt-0.5 text-xs text-cu-teal-edge/80">
              Sends volunteer session invites and collects automatic RSVPs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                isConnected
                  ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                  : isQrState || isStarting
                    ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
                    : "border-white/20 bg-white/10 text-cu-teal-edge"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  isConnected
                    ? "bg-emerald-400 animate-pulse"
                    : isQrState || isStarting
                      ? "bg-amber-400 animate-pulse"
                      : "bg-slate-400"
                }`}
              />
              {stateLabel}
            </span>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#07423d] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 disabled:opacity-50"
            >
              <RefreshIcon className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Checking…" : "Refresh Status"}
            </button>
          </div>
        </div>
      </EmeraldBand>

      <PageContent>
        <TelemetryBar
          title="Bridge Persistence & Protocol Telemetry"
          open={telemetryOpen}
          onToggle={() => setTelemetryOpen((v) => !v)}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <TelemetryStat
                label="Bridge State"
                value={status?.state ?? "unknown"}
                tone={isConnected ? "green" : isQrState ? "amber" : "teal"}
              />
              <TelemetryStat
                label="Provider"
                value={status?.provider ?? "baileys"}
                tone="teal"
              />
              <TelemetryStat
                label="Keep-Alive Rule"
                value="14 days"
                hint="Primary SIM online check"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3.5">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-cu-ink">
                  Permanent Session Persistence
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-cu-body-text">
                  Login tokens and browser profile are stored on the dedicated{" "}
                  <strong>Oracle Cloud NVMe persistent volume</strong> with 8 GB
                  swap memory. The connection stays alive across redeployments.
                </p>
              </div>
              <div className="rounded-xl border border-cu-line-soft bg-[#f8fafb] p-3.5">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-cu-ink">
                  WhatsApp 14-Day Rule
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-cu-body-text">
                  WhatsApp protocol requires the primary phone (with the physical
                  SIM card) to connect to the internet at least once every 14
                  days to keep linked sessions active.
                </p>
              </div>
            </div>
          </div>
        </TelemetryBar>

        {(error || actionError) && (
          <Banner tone="red">
            {actionError ||
              (error as Error)?.message ||
              "Could not reach WhatsApp service."}
          </Banner>
        )}

        <RosterHeader
          title="Device Connection"
          countLabel={stateLabel}
        />

        {/* 1. CONNECTED STATE */}
        {isConnected && (
          <article className="rounded-2xl border border-emerald-200 bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#0e6e68] text-white shadow-xs">
                  <CheckCircleIcon className="size-6" />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[1.0625rem] font-bold text-cu-ink">
                    {status?.displayName || "Verified WhatsApp Account"}
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm">
                    <span className="font-semibold text-cu-teal-ink">
                      +{status?.phone || "Connected"}
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-cu-muted">
                      •
                    </span>
                    <span className="text-cu-body-text">
                      Oracle Cloud VM (ap-singapore-1)
                    </span>
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Connected
              </span>
            </div>

            <div className="mt-3.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] px-3.5 py-3 text-xs text-cu-body-text">
              Automated session invitations and RSVP confirmations are actively
              routing through this verified coordinator number.
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-cu-line-soft pt-3">
              <span className="text-xs text-cu-muted">
                Session: {status?.sessionGeneration ?? "Active"}
              </span>

              {confirmDisconnect ? (
                <div className="flex items-center gap-2 rounded-xl bg-cu-red-tint px-3 py-1.5">
                  <span className="text-xs font-bold text-cu-red">
                    Disconnect?
                  </span>
                  <button
                    type="button"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="rounded-lg bg-cu-red px-3 py-1 text-xs font-bold text-white hover:brightness-110"
                  >
                    Yes, Unlink
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-cu-body-text hover:bg-cu-line-soft"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="rounded-xl border border-cu-red/30 px-3.5 py-1.5 text-xs font-bold text-cu-red transition hover:bg-cu-red-tint"
                >
                  Unlink Account
                </button>
              )}
            </div>
          </article>
        )}

        {/* 2. QR CODE PAIRING STATE */}
        {!isConnected && isQrState && (
          <article className="rounded-2xl border border-amber-300/90 bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-6">
            <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#d97706] text-white shadow-xs">
                    <WhatsAppIcon className="size-6" />
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-400 ring-2 ring-white"
                    />
                  </div>
                  <div>
                    <h2 className="text-[1.0625rem] font-bold text-cu-ink">
                      Scan QR Code to Link Official WhatsApp
                    </h2>
                    <p className="mt-0.5 text-xs text-cu-body-text sm:text-sm">
                      Point your phone&apos;s WhatsApp camera at the QR code to
                      pair your device.
                    </p>
                  </div>
                </div>

                <ol className="mt-4 space-y-2.5 rounded-xl border border-cu-line-soft bg-[#f8fafb] p-4 text-sm text-cu-ink">
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 flex-none items-center justify-center rounded-full bg-cu-teal-ink text-xs font-bold text-white">
                      1
                    </span>
                    <span>
                      Open <strong>WhatsApp</strong> on your mobile phone.
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 flex-none items-center justify-center rounded-full bg-cu-teal-ink text-xs font-bold text-white">
                      2
                    </span>
                    <span>
                      Tap <strong>Settings</strong> (iOS) or{" "}
                      <strong>Menu ⋮</strong> (Android) &gt;{" "}
                      <strong>Linked Devices</strong>.
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 flex-none items-center justify-center rounded-full bg-cu-teal-ink text-xs font-bold text-white">
                      3
                    </span>
                    <span>
                      Tap <strong>Link a Device</strong> and point your camera
                      here.
                    </span>
                  </li>
                </ol>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cu-border-strong bg-white px-4 py-2 text-xs font-bold text-cu-ink transition hover:bg-cu-line-soft"
                  >
                    <RefreshIcon />
                    Regenerate QR Code
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-cu-teal-edge bg-cu-teal-tint/50 p-5">
                <img
                  src={status?.qrDataUrl || ""}
                  alt="WhatsApp QR Code"
                  className="size-60 rounded-xl border border-white bg-white p-2 shadow-sm"
                />
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-cu-teal-ink">
                  <span className="size-2 rounded-full bg-cu-green animate-pulse" />
                  Waiting for scan… (Auto-refreshes)
                </p>
              </div>
            </div>
          </article>
        )}

        {/* 3. DISCONNECTED / NOT PAIRED STATE */}
        {!isConnected && !isQrState && (
          <article className="rounded-2xl border border-amber-300/90 bg-cu-surface p-4 shadow-[0_1px_3px_rgba(31,42,46,0.06)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#d97706] text-white shadow-xs">
                  <AlertTriangleIcon className="size-5" />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-400 ring-2 ring-white"
                  />
                </div>
                <div>
                  <h2 className="text-[1.0625rem] font-bold text-cu-ink">
                    No WhatsApp Device Linked
                  </h2>
                  <p className="mt-0.5 text-xs text-cu-body-text sm:text-sm">
                    Link the coordinator&apos;s WhatsApp phone to send real-time
                    event invitations and capture RSVPs.
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Action needed
              </span>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-[#fffbeb] px-4 py-3">
              <p className="text-xs font-medium text-cu-ink">
                Start the WhatsApp bridge to generate a QR code for device
                pairing.
              </p>
              <button
                type="button"
                onClick={() => connectMutation.mutate()}
                disabled={isStarting}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#d97706] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#b45309] disabled:opacity-50 sm:text-sm"
              >
                <WhatsAppIcon />
                {isStarting ? "Starting Bridge…" : "Link WhatsApp Account"}
              </button>
            </div>
          </article>
        )}
      </PageContent>
    </>
  );
}
