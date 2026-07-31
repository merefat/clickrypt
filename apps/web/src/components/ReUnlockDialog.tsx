"use client";

import { useState, useEffect } from "react";
import { decryptWithPassphrase } from "@clickrypt/crypto";
import { apiClient, ApiError, setAccessToken } from "@/lib/api/client";
import { useSessionStore, getStoredEmail, clearStoredSession } from "@/stores/session";
import { Dialog } from "./ui/Dialog";
import { Field } from "./ui/Field";
import { ErrorMsg } from "./ui/ErrorMsg";
import { inputClass, primaryBtnClass, secondaryBtnClass } from "./ui/buttonClasses";

interface ReUnlockDialogProps {
  onClose: () => void;
  onUnlocked: () => void;
}

export function ReUnlockDialog({ onClose, onUnlocked }: ReUnlockDialogProps) {
  const [email, setEmail] = useState<string | null>(getStoredEmail());
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const unlock = useSessionStore((s) => s.unlock);

  // If email is missing from sessionStorage, fetch it from /users/me
  // (the access token was silently refreshed by useSessionRestore)
  useEffect(() => {
    if (email) return;
    let cancelled = false;
    apiClient
      .me()
      .then((profile) => {
        if (cancelled) return;
        if (profile.email) {
          setEmail(profile.email);
          useSessionStore.setState({ email: profile.email });
        }
        if (profile.orgRole) {
          useSessionStore.getState().setOrgRole(profile.orgRole);
        }
        if (profile.id) {
          useSessionStore.getState().setUserId(profile.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("No cached email found. Please log in again.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const challenge = await apiClient.verify(email);
      const privateKey = await decryptWithPassphrase(challenge.encryptedPrivateKey, passphrase);
      unlock(privateKey, email);
      try {
        const profile = await apiClient.me();
        if (profile.orgRole) useSessionStore.getState().setOrgRole(profile.orgRole);
        if (profile.id) useSessionStore.getState().setUserId(profile.id);
      } catch {}
      onUnlocked();
    } catch (err) {
      console.error("[ReUnlockDialog] failed:", err);
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        clearStoredSession();
        setAccessToken(null);
        setError("Your session has expired. Redirecting to login…");
        setTimeout(() => onClose(), 1500);
      } else {
        setError("Wrong passphrase or corrupted key.");
      }
    } finally { setLoading(false); }
  }

  return (
    <Dialog title="Unlock your vault" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[#8ba3b8]">Your session is locked. Enter your master passphrase to continue.</p>
        <Field label="Email"><input type="email" value={email || ""} readOnly className={`${inputClass} opacity-60`} /></Field>
        <Field label="Master passphrase" required><input type="password" required value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus className={inputClass} /></Field>
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={loading} className={primaryBtnClass}>{loading ? "Unlocking…" : "Unlock"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Log in again</button></div>
      </form>
    </Dialog>
  );
}
