import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import type { WhatsAppAdminStatus } from "../api/types";
import { Card, SectionTitle } from "../components/ui";

export default function WhatsAppAdmin() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <SectionTitle
        hint="Manage the WhatsApp account used to send official volunteer invites and capture RSVPs."
        rule
        aside={
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="tap-target rounded-xl border border-cu-border bg-white px-4 py-2 text-cu-body font-semibold text-cu-emerald hover:bg-cu-surface disabled:opacity-50"
          >
            {isLoading ? "Checking..." : "↻ Refresh Status"}
          </button>
        }
      >
        WhatsApp Connection
      </SectionTitle>

      {(error || actionError) && (
        <div className="mb-6 rounded-2xl border border-cu-red/30 bg-cu-red-tint p-4 text-cu-body font-semibold text-cu-red">
          {actionError || (error as Error)?.message || "Could not reach WhatsApp service."}
        </div>
      )}

      {/* ------------------------------------------------------------------
          1. CONNECTED STATE
      -------------------------------------------------------------------- */}
      {isConnected && (
        <Card className="border-cu-green/30 bg-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-14 flex-none items-center justify-center rounded-2xl bg-cu-green-tint text-2xl text-cu-green">
                ✓
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cu-green/30 bg-cu-green-tint px-3 py-1 text-cu-caption font-bold text-cu-green">
                    <span className="size-2 rounded-full bg-cu-green animate-pulse" />
                    Connected & Active
                  </span>
                  <span className="text-cu-caption font-medium text-cu-body-text/70">
                    Oracle Cloud VM (ap-singapore-1)
                  </span>
                </div>
                <h3 className="mt-2 text-cu-h2 font-bold text-cu-emerald">
                  {status?.displayName || "Verified WhatsApp Account"}
                </h3>
                <p className="mt-1 text-cu-body text-cu-body-text">
                  Phone Number:{" "}
                  <strong className="font-semibold text-cu-emerald">
                    +{status?.phone || "Connected"}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {confirmDisconnect ? (
                <div className="flex items-center gap-2 rounded-xl bg-cu-red-tint p-2">
                  <span className="text-cu-caption font-bold text-cu-red">Disconnect?</span>
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="rounded-lg bg-cu-red px-3 py-1.5 text-cu-caption font-bold text-white hover:bg-cu-red/90"
                  >
                    Yes, Unlink
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded-lg bg-white px-3 py-1.5 text-cu-caption font-semibold text-cu-body-text hover:bg-cu-surface"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="rounded-xl border border-cu-red/30 px-4 py-2.5 text-cu-body font-semibold text-cu-red hover:bg-cu-red-tint"
                >
                  Unlink Account
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------
          2. QR CODE PAIRING STATE
      -------------------------------------------------------------------- */}
      {!isConnected && isQrState && (
        <Card className="border-cu-teal/40 bg-white">
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cu-teal/40 bg-cu-teal-tint px-3 py-1 text-cu-caption font-bold text-cu-teal-ink">
                <span className="size-2 rounded-full bg-cu-teal-ink animate-ping" />
                Scan QR Code to Link
              </span>
              <h3 className="mt-3 text-cu-h2 font-bold text-cu-emerald">
                Connect Official WhatsApp
              </h3>
              <p className="mt-2 text-cu-body text-cu-body-text">
                Point your phone's WhatsApp camera at the QR code to pair your device.
              </p>

              <ol className="mt-6 space-y-3.5 text-cu-body text-cu-emerald">
                <li className="flex items-center gap-3">
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-cu-teal font-bold text-cu-emerald text-sm">
                    1
                  </span>
                  Open <strong>WhatsApp</strong> on your mobile phone.
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-cu-teal font-bold text-cu-emerald text-sm">
                    2
                  </span>
                  Tap <strong>Settings</strong> (iOS) or <strong>Menu ⋮</strong> (Android) &gt; <strong>Linked Devices</strong>.
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-cu-teal font-bold text-cu-emerald text-sm">
                    3
                  </span>
                  Tap <strong>Link a Device</strong> and point your camera here.
                </li>
              </ol>

              <div className="mt-8 flex items-center gap-3">
                <button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  className="rounded-xl border border-cu-border bg-white px-4 py-2 text-cu-body font-semibold text-cu-emerald hover:bg-cu-surface"
                >
                  Regenerate QR Code
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-cu-teal/30 bg-cu-sage p-6 shadow-sm">
              <img
                src={status?.qrDataUrl || ""}
                alt="WhatsApp QR Code"
                className="size-64 rounded-xl border border-white bg-white p-2 shadow"
              />
              <p className="mt-3 text-cu-caption font-semibold text-cu-body-text flex items-center gap-2">
                <span className="size-2 rounded-full bg-cu-green animate-pulse" />
                Waiting for scan... (Auto-refreshes)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------
          3. DISCONNECTED / NOT PAIRED STATE
      -------------------------------------------------------------------- */}
      {!isConnected && !isQrState && (
        <Card className="bg-white">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-cu-amber-tint text-3xl text-cu-amber">
              📱
            </div>
            <h3 className="mt-4 text-cu-h2 font-bold text-cu-emerald">
              No WhatsApp Device Linked
            </h3>
            <p className="mt-2 max-w-md text-cu-body text-cu-body-text">
              Link the coordinator's WhatsApp phone to send real-time event invitations and capture RSVPs for Community Unlimited.
            </p>

            <button
              onClick={() => connectMutation.mutate()}
              disabled={isStarting}
              className="tap-target mt-6 inline-flex items-center gap-2 rounded-xl bg-cu-teal px-6 py-3 text-cu-body font-bold text-cu-emerald shadow hover:brightness-105 disabled:opacity-50"
            >
              {isStarting ? "Starting Bridge..." : "Link WhatsApp Account"}
            </button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------
          4. ARCHITECTURE & PERSISTENCE INFO
      -------------------------------------------------------------------- */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card tone="surface">
          <h4 className="text-cu-body font-bold text-cu-emerald">
            Permanent Session Persistence
          </h4>
          <p className="mt-1 text-cu-caption text-cu-body-text">
            Your login tokens and browser profile are stored on your dedicated <strong>Oracle Cloud NVMe persistent volume</strong> with 8 GB of swap memory. The connection remains alive 24/7 across server redeployments without asking you to re-scan.
          </p>
        </Card>

        <Card tone="surface">
          <h4 className="text-cu-body font-bold text-cu-emerald">
            WhatsApp 14-Day Rule
          </h4>
          <p className="mt-1 text-cu-caption text-cu-body-text">
            WhatsApp protocol requires the primary phone (with the physical SIM card) to connect to the internet at least once every 14 days. As long as the phone connects periodically, this server stays logged in indefinitely.
          </p>
        </Card>
      </div>
    </div>
  );
}
