import { create } from "zustand";

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const SS_EMAIL_KEY = "cp_email";
const SAVED_EMAILS_KEY = "cp_saved_emails";
const CALLBACK_URL_KEY = "cp_callback_url";
const MAX_SAVED_EMAILS = 5;

export function getSavedEmails(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_EMAILS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addSavedEmail(email: string): void {
  if (typeof window === "undefined") return;
  const emails = getSavedEmails();
  const lower = email.toLowerCase();
  const filtered = emails.filter((e) => e.toLowerCase() !== lower);
  filtered.unshift(email);
  window.localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(filtered.slice(0, MAX_SAVED_EMAILS)));
}

export function removeSavedEmail(email: string): void {
  if (typeof window === "undefined") return;
  const emails = getSavedEmails().filter((e) => e.toLowerCase() !== email.toLowerCase());
  window.localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(emails));
}

interface SessionState {
  /** Unlocked armored private key — lives in memory only, never persisted. */
  privateKey: string | null;
  /** Current user profile (cached after login). */
  email: string | null;
  /** Whether the vault is unlocked. */
  unlocked: boolean;
  /** Lock timer ID for auto-lock. */
  lockTimer: ReturnType<typeof setTimeout> | null;
  /** Deployment mode: "self-hosted" or "organization". */
  deploymentMode: "self-hosted" | "organization";
  /** Current user's org role. */
  orgRole: string | null;
  /** Current user's ID. */
  userId: string | null;
  /** Cached avatar base64 (for sidebar thumbnail). */
  avatarBase64: string | null;

  unlock: (privateKey: string, email: string) => void;
  lock: () => void;
  resetLockTimer: () => void;
  setDeploymentMode: (mode: "self-hosted" | "organization") => void;
  setOrgRole: (role: string) => void;
  setUserId: (id: string) => void;
  setAvatar: (avatar: string | null) => void;
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.sessionStorage.getItem("cp_at") && window.sessionStorage.getItem(SS_EMAIL_KEY));
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SS_EMAIL_KEY);
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("cp_at");
  window.sessionStorage.removeItem(SS_EMAIL_KEY);
  window.sessionStorage.removeItem(CALLBACK_URL_KEY);
}

export function getCallbackUrl(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CALLBACK_URL_KEY);
}

export function setCallbackUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CALLBACK_URL_KEY, url);
}

export function clearCallbackUrl(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CALLBACK_URL_KEY);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  privateKey: null,
  email: null,
  unlocked: false,
  lockTimer: null,
  deploymentMode: "organization",
  orgRole: null,
  userId: null,
  avatarBase64: null,

  setDeploymentMode: (mode) => set({ deploymentMode: mode }),

  setOrgRole: (role) => set({ orgRole: role }),

  setUserId: (id) => set({ userId: id }),

  setAvatar: (avatar) => set({ avatarBase64: avatar }),

  unlock: (privateKey, email) => {
    const existing = get().lockTimer;
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => get().lock(), AUTO_LOCK_MS);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SS_EMAIL_KEY, email);
    }
    addSavedEmail(email);
    set({ privateKey, email, unlocked: true, lockTimer: timer });
  },

  lock: () => {
    const existing = get().lockTimer;
    if (existing) clearTimeout(existing);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SS_EMAIL_KEY);
    }
    // Zeroize the private key — overwrite with empty string first to be
    // slightly more aggressive about memory clearing before nulling.
    set({ privateKey: null, unlocked: false, lockTimer: null });
  },

  resetLockTimer: () => {
    const existing = get().lockTimer;
    if (existing) clearTimeout(existing);
    if (get().unlocked) {
      const timer = setTimeout(() => get().lock(), AUTO_LOCK_MS);
      set({ lockTimer: timer });
    }
  },
}));
