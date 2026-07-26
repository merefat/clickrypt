"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import {
  generateKeyPair,
  encryptWithPassphrase,
  createRecoveryKit,
  type EncryptedBlob,
} from "@clickrypt/crypto";
import { apiClient } from "@/lib/api/client";

type Step = "email" | "form" | "generating" | "downloading" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [recoveryKit, setRecoveryKit] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKeyArmored: string;
    privateKeyArmored: string;
    fingerprint: string;
  } | null>(null);
  const [generatedEncryptedKey, setGeneratedEncryptedKey] = useState<EncryptedBlob | null>(null);
  const [completing, setCompleting] = useState(false);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("form");
  }

  async function handleGenerate(e: React.FormEvent) {
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
      await apiClient.completeSetup({
        email,
        firstName,
        lastName,
        armoredPublicKey: generatedKeys.publicKeyArmored,
        encryptedPrivateKey: generatedEncryptedKey as unknown as Record<string, unknown>,
      });

      setStep("done");
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Setup failed."
      );
      setStep("form");
    } finally {
      setCompleting(false);
    }
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
            {completing ? "Completing…" : "I&apos;ve saved it — complete setup"}
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
          <p className="mt-4 text-[#c4d4e0]">Setup complete! Redirecting to login…</p>
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
            <span className="text-xl font-bold">Clickrypt</span>
          </div>

          <h1 className="text-center text-2xl font-bold">Complete your setup</h1>
          <p className="mt-2 text-center text-sm text-[#8ba3b8]">
            Enter your email to begin setting up your account.
          </p>

          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
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
              Continue
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#8ba3b8]">
            Already set up?{" "}
            <Link href="/login" className="text-brand-500 hover:text-[#1ebbd4]">
              Sign in
            </Link>
          </p>
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

        <h1 className="text-center text-2xl font-bold">Set up your vault</h1>
        <p className="mt-2 text-center text-sm text-[#8ba3b8]">
          Your master passphrase encrypts your private key. We can never see it.
        </p>

        <form onSubmit={handleGenerate} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">First name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#c4d4e0]">Last name</label>
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
            <label className="mb-1 block text-sm text-[#c4d4e0]">Master passphrase</label>
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
            <label className="mb-1 block text-sm text-[#c4d4e0]">Confirm passphrase</label>
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
            Generate keys & complete setup
          </button>
        </form>
      </div>
    </div>
  );
}
