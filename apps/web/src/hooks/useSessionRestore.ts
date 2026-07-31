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

      // Check if setup is needed first
      try {
        const setupStatus = await apiClient.getSetupStatus();
        if (cancelled) return;
        if (setupStatus.needsSetup) {
          setAccessToken(null);
          setStatus("unauthenticated");
          router.push("/onboarding");
          return;
        }
      } catch {
        // If setup status check fails, continue with session restore
      }

      // Try to validate / restore the access token
      let hasValidToken = false;

      const existingToken = getAccessToken();
      if (existingToken) {
        // Try a lightweight authenticated call to see if the token is still valid
        try {
          await apiClient.me();
          if (cancelled) return;
          hasValidToken = true;
        } catch {
          // Token might be expired — try silent refresh
        }
      }

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
