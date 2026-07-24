"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Lock, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
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

type Step = "loading" | "invalid" | "form" | "generating" | "downloading" | "done";

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    orgName: string;
  } | null>(null);

  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKeyArmored: string;
    privateKeyArmored: string;
    fingerprint: string;
  } | null>(null);
  const [generatedEncryptedKey, setGeneratedEncryptedKey] = useState<EncryptedBlob | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getInvitePreview(token)
      .then((preview) => {
        setInvite(preview);
        setStep("form");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invalid or expired invite.");
        setStep("invalid");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
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
        email: invite.email,
      });

      const encryptedPrivateKey = await encryptWithPassphrase(
        keys.privateKeyArmored,
        passphrase
      );

      const kit = createRecoveryKit({
        email: invite.email,
        fingerprint: keys.fingerprint,
        encryptedPrivateKey,
      });

      setGeneratedKeys(keys);
      setGeneratedEncryptedKey(encryptedPrivateKey);
      setRecoveryKit(kit);
      setStep("downloading");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key generation failed.");
      setStep("form");
    }
  }

  function handleDownload() {
    if (!recoveryKit || !invite) return;
    const blob = new Blob([recoveryKit], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clickrypt-recovery-kit-${invite.email}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  async function handleComplete() {
    if (!recoveryKit || !generatedKeys || !generatedEncryptedKey || !invite) return;
    setError(null);

    try {
      await apiClient.acceptInvite(token, {
        firstName,
        lastName,
        armoredPublicKey: generatedKeys.publicKeyArmored,
        encryptedPrivateKey: generatedEncryptedKey as unknown as Record<string, unknown>,
      });

      // Auto-login after accepting the invite
      const challenge = await apiClient.verify(invite.email);
      const privateKey = await decryptWithPassphrase(
        challenge.encryptedPrivateKey,
        passphrase
      );
      const { plaintext: loginToken } = await decryptMessage(
        challenge.challenge,
        privateKey
      );
      const loginRes = await apiClient.login(invite.email, loginToken);
      setAccessToken(loginRes.accessToken);
      useSessionStore.getState().unlock(privateKey, invite.email);

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
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
      setStep("form");
    }
  }

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-[#f89c11]" />
          <h2 className="mt-4 text-xl font-bold">Invalid Invitation</h2>
          <p className="mt-2 text-sm text-[#8ba3b8]">
            {error ?? "This invitation link is invalid, expired, or has already been used."}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-2 font-semibold text-white hover:bg-brand-700"
          >
            Go to Login
          </Link>
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
            disabled={!downloaded}
            className="mt-4 w-full rounded-lg border border-[#2a4055] px-4 py-3 font-semibold text-[#e2e8f0] enabled:hover:bg-[#213548] disabled:cursor-not-allowed disabled:opacity-50"
          >
            I&apos;ve saved it — continue
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
          <p className="mt-4 text-[#c4d4e0]">Welcome aboard! Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
          <span className="text-xl font-bold">Clickrypt</span>
        </div>

        <h1 className="text-center text-2xl font-bold">Join {invite?.orgName}</h1>
        <p className="mt-2 text-center text-sm text-[#8ba3b8]">
          You&apos;ve been invited as <span className="font-semibold text-[#c4d4e0]">{invite?.role}</span> with the email{" "}
          <span className="font-semibold text-[#c4d4e0]">{invite?.email}</span>.
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
            Generate keys & join
          </button>
        </form>
      </div>
    </div>
  );
}
