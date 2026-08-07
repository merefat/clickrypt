"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  getAccessToken,
  setAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";
import {
  useSessionStore,
  hasStoredSession,
  setCallbackUrl,
} from "@/stores/session";

export type SessionRestoreStatus =
  | "loading"
  | "ready"
  | "locked"
  | "unauthenticated";

export interface SessionRestoreResult {
  status: SessionRestoreStatus;
  showReUnlock: boolean;
}

/**
 * On mount, attempt to silently restore the auth session so the user
 * isn't bounced to the full /login page on reload.
 *
 * - If the vault is already unlocked → "ready".
 * - If we have a valid access token (or can silently refresh via the
 *   httpOnly refresh cookie) → "locked" (show passphrase re-unlock dialog).
 * - If no valid session → "unauthenticated" (redirect to /login).
 */
export function useSessionRestore(): SessionRestoreResult {
  const router = useRouter();
  const unlocked = useSessionStore((s) => s.unlocked);
  const [status, setStatus] = useState<SessionRestoreStatus>("loading");
  const [showReUnlock, setShowReUnlock] = useState(false);

  useEffect(() => {
    if (unlocked) {
      setStatus("ready");
      setShowReUnlock(false);
      return;
    }

    let cancelled = false;

    async function restore() {
      // Save current URL for redirect after unlock
      setCallbackUrl(window.location.pathname + window.location.search);

      // Check setup status and validate the access token in parallel —
      // they are independent calls, so this saves a network round trip.
      const existingToken = getAccessToken();
      const [setupStatus, tokenValid] = await Promise.all([
        // If setup status check fails, continue with session restore
        apiClient.getSetupStatus().catch(() => null),
        // Lightweight authenticated call to see if the token is still valid
        existingToken
          ? apiClient.me().then(() => true).catch(() => false)
          : Promise.resolve(false),
      ]);
      if (cancelled) return;

      if (setupStatus?.needsSetup) {
        setAccessToken(null);
        setStatus("unauthenticated");
        router.push("/onboarding");
        return;
      }

      // Try to validate / restore the access token
      let hasValidToken = tokenValid;

      if (!hasValidToken) {
        // Attempt silent refresh via httpOnly cookie
        try {
          const refreshed = await refreshAccessToken();
          if (cancelled) return;
          hasValidToken = refreshed;
        } catch {
          hasValidToken = false;
        }
      }

      if (cancelled) return;

      if (hasValidToken) {
        // Session is valid but vault is locked (private key not in memory).
        // Show the re-unlock dialog instead of redirecting to login.
        setStatus("locked");
        setShowReUnlock(true);
      } else {
        // No valid session — go to full login page
        setStatus("unauthenticated");
        router.push("/login");
      }
    }

    restore();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, router]);

  return { status, showReUnlock };
}
