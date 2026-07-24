"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Key,
  Check,
  Copy,
  AlertTriangle,
} from "lucide-react";
import QRCode from "qrcode";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";

export default function MfaSettingsPage() {
  const router = useRouter();
  const { unlocked } = useSessionStore();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrollData, setEnrollData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
      return;
    }
    apiClient
      .getMfaStatus()
      .then((r) => setEnabled(r.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [unlocked, router]);

  useEffect(() => {
    if (enrollData?.otpauthUri) {
      QRCode.toDataURL(enrollData.otpauthUri, {
        width: 256,
        margin: 2,
        color: { dark: "#17293c", light: "#ffffff" },
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [enrollData]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleEnroll() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiClient.enrollTotp();
      setEnrollData(data);
    } catch {
      setError("Failed to start MFA enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.verifyTotp(code.trim());
      if (res.enabled) {
        setEnabled(true);
        setEnrollData(null);
        setCode("");
        showToast("MFA enabled successfully!");
      }
    } catch {
      setError("Invalid code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!confirm("Disable MFA? This reduces your account security.")) return;
    setBusy(true);
    try {
      await apiClient.disableMfa();
      setEnabled(false);
      showToast("MFA disabled.");
    } catch {
      setError("Failed to disable MFA.");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (enrollData) {
      navigator.clipboard.writeText(enrollData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
      <button
        onClick={() => router.push("/vault")}
        className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Vault
      </button>

      <div className="mb-8 flex items-center gap-3">
        <Shield className="h-6 w-6 text-brand-500" />
        <h1 className="text-2xl font-bold">Multi-Factor Authentication</h1>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {toast && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#1ebbd4] bg-[#1ebbd4]/20 px-4 py-2 text-sm text-[#1ebbd4]">
          <Check className="h-4 w-4 flex-shrink-0" /> {toast}
        </div>
      )}

      {enabled ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1ebbd4]/20">
                <ShieldCheck className="h-8 w-8 text-[#1ebbd4]" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold text-[#1ebbd4]">MFA is enabled</p>
                <p className="text-sm text-[#8ba3b8]">
                  Your account is protected with TOTP authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4 text-brand-500" /> Authenticator App
            </h2>
            <p className="text-sm text-[#8ba3b8]">
              You will need your authenticator app (Google Authenticator, Authy, 1Password, etc.)
              to generate a code each time you log in.
            </p>
          </div>

          <div className="rounded-xl border border-[#f89c11]/30 bg-[#f89c11]/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-[#f89c11]" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[#f89c11]">Disabling MFA</p>
                <p className="mt-1 text-sm text-[#8ba3b8]">
                  Disabling MFA reduces your account security. You will no longer need a code
                  from your authenticator app to log in.
                </p>
                <button
                  onClick={handleDisable}
                  disabled={busy}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#f89c11] px-4 py-2 text-sm text-[#f89c11] hover:bg-[#f89c11]/20 disabled:opacity-50"
                >
                  <ShieldOff className="h-4 w-4" /> Disable MFA
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : enrollData ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
              <h2 className="font-semibold">Scan QR Code</h2>
            </div>
            <p className="mb-4 text-sm text-[#8ba3b8]">
              Open your authenticator app and scan this QR code to add your Clickrypt account.
            </p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="TOTP QR Code" width={256} height={256} />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center">
                  <p className="text-sm text-gray-400">Generating QR…</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
              <h2 className="font-semibold">Or Enter Manually</h2>
            </div>
            <p className="mb-3 text-sm text-[#8ba3b8]">
              If you can&apos;t scan the QR code, enter this secret in your app:
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-[#213548]/50 p-3">
              <code className="flex-1 break-all font-mono text-sm text-[#c4d4e0]">{enrollData.secret}</code>
              <button
                onClick={copySecret}
                className="rounded-lg border border-[#2a4055] p-2 text-[#8ba3b8] hover:bg-[#213548] hover:text-[#e2e8f0]"
                title="Copy secret"
              >
                {copiedSecret ? <Check className="h-4 w-4 text-[#1ebbd4]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">3</span>
              <h2 className="font-semibold">Verify &amp; Enable</h2>
            </div>
            <p className="mb-3 text-sm text-[#8ba3b8]">
              Enter the 6-digit code from your authenticator app to verify and enable MFA.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className="w-32 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-center text-lg font-mono tracking-widest focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={handleVerify}
                disabled={busy || code.length !== 6}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify & Enable"}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => { setEnrollData(null); setCode(""); setError(null); }}
              className="rounded-lg border border-[#2a4055] px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#213548]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#213548]">
                <ShieldOff className="h-8 w-8 text-[#8ba3b8]" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold">MFA is not enabled</p>
                <p className="text-sm text-[#8ba3b8]">
                  Add an extra layer of security with TOTP authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Key className="h-4 w-4 text-brand-500" /> How it works
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white mt-0.5">1</span>
                <p className="text-sm text-[#8ba3b8]">Scan a QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white mt-0.5">2</span>
                <p className="text-sm text-[#8ba3b8]">Enter the 6-digit code generated by your app to verify</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white mt-0.5">3</span>
                <p className="text-sm text-[#8ba3b8]">Each time you log in, you&apos;ll need both your passphrase and a fresh code</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleEnroll}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Shield className="h-4 w-4" />
            {busy ? "Starting…" : "Enable MFA"}
          </button>
        </div>
      )}
    </div>
  );
}
