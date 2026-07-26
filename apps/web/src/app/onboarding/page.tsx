"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff, User, Building2, Server, RefreshCw } from "lucide-react";
import {
  generateKeyPair,
  encryptWithPassphrase,
  decryptWithPassphrase,
  decryptMessage,
  createRecoveryKit,
  type EncryptedBlob,
} from "@clickrypt/crypto";
import { apiClient, setAccessToken } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";

type Step = "mode" | "form" | "generating" | "downloading" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mode");
  const [error, setError] = useState<string | null>(null);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKeyArmored: string;
    privateKeyArmored: string;
    fingerprint: string;
  } | null>(null);
  const [generatedEncryptedKey, setGeneratedEncryptedKey] = useState<EncryptedBlob | null>(null);

  // Mode selection
  const [mode, setMode] = useState<"SELF_HOSTED" | "ORGANIZATION">("ORGANIZATION");
  const [orgName, setOrgName] = useState("");

  // Account fields
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);

  const checkSetupStatus = useCallback(() => {
    setChecking(true);
    setStatusError(null);
    apiClient
      .getSetupStatus()
      .then((status) => {
        if (!status.needsSetup) {
          router.replace("/login");
        } else {
          setChecking(false);
        }
      })
      .catch((err) => {
        console.error("[Onboarding] getSetupStatus failed", err);
        setChecking(false);
        setStatusError(
          "Could not verify setup status. If this installation is already initialized, sign in at /login. Otherwise, restart the API and refresh."
        );
      });
  }, [router]);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  useEffect(() => {
    if (!statusError) return;
    if (retryCount >= 3) return;
    const timer = setTimeout(() => {
      setRetryCount((c) => c + 1);
      checkSetupStatus();
    }, 3000 * (retryCount + 1));
    return () => clearTimeout(timer);
  }, [statusError, retryCount, checkSetupStatus]);

  async function handleModeContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgName.trim()) {
      setError("Please enter an organization name.");
      return;
    }
    setConfiguring(true);
    try {
      await apiClient.configureSystem({ mode, orgName });
      setStep("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mode.");
    } finally {
      setConfiguring(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passphrase.length < 12) {
      setError("Passphrase must be at least 12 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }

    setStep("generating");

    try {
      const keys = await generateKeyPair({
        name: `${firstName} ${lastName}`,
        email,
      });

      const encryptedPrivateKey = await encryptWithPassphrase(
        keys.privateKeyArmored,
        passphrase
      );

      const kit = createRecoveryKit({
        email,
        fingerprint: keys.fingerprint,
        encryptedPrivateKey,
      });

      setGeneratedKeys(keys);
      setGeneratedEncryptedKey(encryptedPrivateKey);
      setRecoveryKit(kit);
      setStep("downloading");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Key generation failed."
      );
      setStep("form");
    }
  }

  function handleDownload() {
    if (!recoveryKit) return;
    const blob = new Blob([recoveryKit], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clickrypt-recovery-kit-${email}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  async function handleComplete() {
    if (!recoveryKit || !generatedKeys || !generatedEncryptedKey) return;
    if (completing) return;
    setError(null);
    setCompleting(true);

    try {
      await apiClient.setupInitialize({
        email,
        firstName,
        lastName,
        armoredPublicKey: generatedKeys.publicKeyArmored,
        encryptedPrivateKey: generatedEncryptedKey as unknown as Record<string, unknown>,
      });

      // Auto-login after onboarding
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
      setAccessToken(loginRes.accessToken);
      useSessionStore.getState().unlock(privateKey, email);

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

      setStep("done");
      setTimeout(() => router.push("/vault"), 500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Setup failed."
      );
      setStep("downloading");
    } finally {
      setCompleting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-[#f89c11]" />
          <p className="mt-4 text-[#f89c11]">{statusError}</p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => {
                setRetryCount(0);
                checkSetupStatus();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <a
              href="/login"
              className="text-sm text-[#8ba3b8] underline hover:text-white"
            >
              Go to login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (step === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />
          <p className="mt-4 text-[#8ba3b8]">Generating your encryption keys…</p>
        </div>
      </div>
    );
  }

  if (step === "downloading") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-8">
          <h2 className="text-xl font-bold">Save your Recovery Kit</h2>
          <p className="mt-2 text-sm text-[#8ba3b8]">
            Your recovery kit contains your encrypted private key. Without it
            and your passphrase, your account is unrecoverable — even by us.
            Store it somewhere safe.
          </p>

          <button
            onClick={handleDownload}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700"
          >
            <Lock className="h-4 w-4" />
            Download Recovery Kit
          </button>

          {downloaded && (
            <p className="mt-3 flex items-center gap-2 text-sm text-[#1ebbd4]">
              <CheckCircle2 className="h-4 w-4" />
              Recovery kit downloaded. You can continue.
            </p>
          )}

          <button
            onClick={handleComplete}
            disabled={!downloaded || completing}
            className="mt-4 w-full rounded-lg border border-[#2a4055] px-4 py-3 font-semibold text-[#e2e8f0] enabled:hover:bg-[#213548] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completing ? "Completing…" : "I&apos;ve saved it — continue"}
          </button>

          {error && (
            <p className="mt-4 flex items-center gap-2 text-sm text-[#f89c11]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-[#1ebbd4]" />
          <p className="mt-4 text-[#c4d4e0]">Setup complete! Redirecting…</p>
        </div>
      </div>
    );
  }

  // Step: mode selection
  if (step === "mode") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
            <span className="text-xl font-bold">Clickrypt</span>
          </div>

          <h1 className="text-center text-2xl font-bold">Welcome to Clickrypt</h1>
          <p className="mt-2 text-center text-sm text-[#8ba3b8]">
            Choose your deployment mode to get started.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => setMode("SELF_HOSTED")}
              className={`rounded-xl border p-6 text-left transition-colors ${
                mode === "SELF_HOSTED"
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-[#2a4055] bg-[#1a3349]/50 hover:border-[#3a556d]"
              }`}
            >
              <Server className="h-8 w-8 text-brand-500" />
              <h3 className="mt-3 text-lg font-semibold">Self-Hosted</h3>
              <p className="mt-1 text-sm text-[#8ba3b8]">
                Single-user mode. You are the only account — no invites, no member management.
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Full encryption & zero-knowledge security
                </li>
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  No invites or member management
                </li>
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Lightweight setup, ideal for personal use
                </li>
              </ul>
            </button>

            <button
              onClick={() => setMode("ORGANIZATION")}
              className={`rounded-xl border p-6 text-left transition-colors ${
                mode === "ORGANIZATION"
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-[#2a4055] bg-[#1a3349]/50 hover:border-[#3a556d]"
              }`}
            >
              <Building2 className="h-8 w-8 text-brand-500" />
              <h3 className="mt-3 text-lg font-semibold">Organization</h3>
              <p className="mt-1 text-sm text-[#8ba3b8]">
                Multi-user mode. Invite members, assign roles, and manage your team.
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Multi-user team vault with role-based access
                </li>
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Invite members and manage permissions
                </li>
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Secure resource sharing between users
                </li>
                <li className="flex items-center gap-2 text-xs text-[#8ba3b8]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
                  Audit logs and admin controls
                </li>
              </ul>
            </button>
          </div>

          <form onSubmit={handleModeContinue} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                {mode === "SELF_HOSTED" ? "Vault name" : "Organization name"}
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={mode === "SELF_HOSTED" ? "My Vault" : "Acme Inc."}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
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
              disabled={configuring}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {configuring ? "Saving…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step: account creation form
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
          <span className="text-xl font-bold">Clickrypt</span>
        </div>

        <h1 className="text-center text-2xl font-bold">Create your account</h1>
        <p className="mt-2 text-center text-sm text-[#8ba3b8]">
          {mode === "SELF_HOSTED" ? "Self-Hosted" : "Organization"} · {orgName}
        </p>
        <p className="mt-1 text-center text-sm text-[#8ba3b8]">
          You will be the <span className="font-semibold text-[#c4d4e0]">Owner</span> of this {mode === "SELF_HOSTED" ? "vault" : "organization"}.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                First name
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">
                Last name
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#c4d4e0]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#c4d4e0]">
              Master passphrase
            </label>
            <div className="relative">
              <input
                type={showPassphrase ? "text" : "password"}
                required
                minLength={12}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="At least 12 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba3b8] hover:text-[#c4d4e0]"
              >
                {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#c4d4e0]">
              Confirm passphrase
            </label>
            <div className="relative">
              <input
                type={showConfirmPassphrase ? "text" : "password"}
                required
                minLength={12}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassphrase(!showConfirmPassphrase)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba3b8] hover:text-[#c4d4e0]"
              >
                {showConfirmPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-[#f89c11]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Generate keys & create account
          </button>
        </form>

        <button
          onClick={() => setStep("mode")}
          className="mt-4 w-full text-center text-sm text-[#8ba3b8] hover:text-[#c4d4e0]"
        >
          ← Back to mode selection
        </button>
      </div>
    </div>
  );
}
