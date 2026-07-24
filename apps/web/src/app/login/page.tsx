"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, AlertCircle, Loader2, KeyRound, X } from "lucide-react";
import { decryptWithPassphrase, decryptMessage } from "@clickrypt/crypto";
import { apiClient, setAccessToken, ApiError } from "@/lib/api/client";
import { useSessionStore, getSavedEmails, removeSavedEmail } from "@/stores/session";

export default function LoginPage() {
  const router = useRouter();
  const unlock = useSessionStore((s) => s.unlock);

  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [emailFocused, setEmailFocused] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [initialized, setInitialized] = useState(true);

  useEffect(() => {
    setSavedEmails(getSavedEmails());
    apiClient.getSetupStatus().then((s) => {
      setNeedsSetup(s.needsSetup);
      setInitialized(s.initialized);
      if (s.needsSetup) router.replace("/onboarding");
    }).catch(() => {});
  }, [router]);

  async function handleEmailSubmit(e?: React.FormEvent, emailArg?: string) {
    if (e) e.preventDefault();
    const emailToUse = emailArg ?? email;
    if (emailArg) setEmail(emailArg);
    setError(null);
    setLoading(true);

    try {
      await apiClient.verify(emailToUse);
      setNeedsPassphrase(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initiate login."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const challenge = await apiClient.verify(email);

      const privateKey = await decryptWithPassphrase(
        challenge.encryptedPrivateKey,
        passphrase
      );

      const { plaintext: token } = await decryptMessage(
        challenge.challenge,
        privateKey
      );

      const loginRes = await apiClient.login(email, token);

      // If MFA is required, show MFA code input instead of proceeding
      if (loginRes.mfaRequired) {
        setMfaToken((loginRes as any).mfaToken);
        setLoading(false);
        return;
      }

      // Check for empty access token (shouldn't happen if mfaRequired is false)
      if (!loginRes.accessToken) {
        throw new Error("Login failed: no access token received");
      }

      setAccessToken(loginRes.accessToken);
      unlock(privateKey, email);

      // Set userId and orgRole from enriched login response
      if (loginRes.user?.id) {
        useSessionStore.getState().setUserId(loginRes.user.id);
      }
      if (loginRes.membership?.role) {
        useSessionStore.getState().setOrgRole(loginRes.membership.role);
      } else {
        try {
          const profile = await apiClient.me();
          useSessionStore.getState().setOrgRole(profile.orgRole);
          useSessionStore.getState().setUserId(profile.id);
        } catch {}
      }

      router.push("/vault");
    } catch (err) {
      console.error("[Login] Error:", err);
      const message = err instanceof Error ? err.message : "Login failed.";
      if (message.includes("passphrase") || message.includes("Decryption failed")) {
        setError("Wrong passphrase, corrupted key, or the account no longer exists (e.g., after a database reset). If the database was reset, complete setup again.");
      } else if (message.includes("challenge") || message.includes("decrypt")) {
        setError("Challenge decryption failed. Please try again.");
      } else if (message.includes("Invalid credentials")) {
        setError("Invalid credentials. Please try again.");
      } else if (message.includes("401") || message.includes("Unauthorized")) {
        setError("Authentication failed. Please try again.");
      } else if (message.includes("fetch") || message.includes("network")) {
        setError("Network error. Please check your connection.");
      } else {
        setError(`Login failed: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!mfaToken) {
        throw new Error("MFA token missing");
      }

      const mfaRes = await apiClient.loginMfa(mfaToken, mfaCode);

      if (!mfaRes.accessToken) {
        throw new Error("MFA login failed: no access token received");
      }

      setAccessToken(mfaRes.accessToken);
      // Re-decrypt private key for unlock
      const challenge = await apiClient.verify(email);
      const privateKey = await decryptWithPassphrase(
        challenge.encryptedPrivateKey,
        passphrase
      );
      unlock(privateKey, email);

      if (mfaRes.user?.id) {
        useSessionStore.getState().setUserId(mfaRes.user.id);
      }
      if (mfaRes.membership?.role) {
        useSessionStore.getState().setOrgRole(mfaRes.membership.role);
      } else {
        try {
          const profile = await apiClient.me();
          useSessionStore.getState().setOrgRole(profile.orgRole);
          useSessionStore.getState().setUserId(profile.id);
        } catch {}
      }

      router.push("/vault");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError("MFA login endpoint not found. The API server may need to be rebuilt.");
        } else if (err.status === 401) {
          setError("Invalid or expired MFA code. Please try again.");
        } else {
          setError(err.message || "MFA verification failed.");
        }
      } else {
        setError(err instanceof Error ? err.message : "MFA verification failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
          <span className="text-xl font-bold">Clickrypt</span>
        </div>

        <h1 className="text-center text-2xl font-bold">Unlock your vault</h1>

        {!needsPassphrase ? (
          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setTimeout(() => setEmailFocused(false), 150)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>

            {emailFocused && savedEmails.length > 0 && (
              <div>
                <label className="mb-1 block text-sm text-[#8ba3b8]">Saved accounts</label>
                <div className="flex flex-wrap gap-2">
                  {savedEmails.map((savedEmail) => (
                    <div
                      key={savedEmail}
                      onClick={() => handleEmailSubmit(undefined, savedEmail)}
                      className="group flex items-center gap-1.5 rounded-full border border-[#2a4055] bg-[#1a3349] px-3 py-1.5 text-sm text-[#c4d4e0] hover:border-brand-500 cursor-pointer"
                    >
                      {savedEmail}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSavedEmail(savedEmail); setSavedEmails(getSavedEmails()); }}
                        className="text-[#8ba3b8] hover:text-[#f89c11]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="flex items-center gap-2 text-sm text-[#f89c11]">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Continue"
              )}
            </button>
          </form>
        ) : mfaToken ? (
          <form onSubmit={handleMfaSubmit} className="mt-8 space-y-4">
            <div className="rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-3 text-sm text-[#8ba3b8]">
              <KeyRound className="mb-1 h-4 w-4 text-brand-500" />
              Enter your 6-digit authentication code from your authenticator app.
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                MFA Code
              </label>
              <input
                type="text"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="123456"
              />
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-[#f89c11]">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Verify"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                setError(null);
              }}
              className="w-full text-sm text-[#8ba3b8] hover:text-[#c4d4e0]"
            >
              ← Back to passphrase
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div className="rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-3 text-sm text-[#8ba3b8]">
              <KeyRound className="mb-1 h-4 w-4 text-brand-500" />
              Enter your master passphrase to decrypt your private key and
              answer the cryptographic challenge.
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                Master passphrase
              </label>
              <input
                type="password"
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-[#f89c11] bg-[#f89c11]/10 p-3 text-sm text-[#f89c11]">
                <p className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </p>
                {(error.includes("database was reset") || error.includes("account no longer exists")) && (
                  <p className="mt-2 text-xs">
                    Need to set up again?{" "}
                    <Link href="/onboarding" className="font-medium text-[#f89c11] underline hover:text-white">
                      Complete onboarding
                    </Link>
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Unlock vault"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setNeedsPassphrase(false);
                setError(null);
                setPassphrase("");
              }}
              className="w-full text-sm text-[#8ba3b8] hover:text-[#c4d4e0]"
            >
              ← Use a different email
            </button>
          </form>
        )}

        {!needsSetup && initialized && (
        <p className="mt-6 text-center text-sm text-[#8ba3b8]">
          Invited by your admin?{" "}
          <Link
            href="/setup"
            className="text-brand-500 hover:text-brand-400"
          >
            Complete your setup
          </Link>
        </p>
        )}
      </div>
    </div>
  );
}
