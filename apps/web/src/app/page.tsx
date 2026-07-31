"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Lock, Share2, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api/client";

const features = [
  {
    icon: ShieldCheck,
    title: "Zero-knowledge",
    description:
      "Every secret is encrypted in your browser before it ever leaves your device. Our servers only see ciphertext.",
  },
  {
    icon: KeyRound,
    title: "Key-based login",
    description:
      "No password hashes to steal. Authentication is a cryptographic challenge only your private key can answer.",
  },
  {
    icon: Share2,
    title: "Secure sharing",
    description:
      "Share credentials with teammates via per-recipient encryption. Revoke access instantly.",
  },
  {
    icon: Lock,
    title: "Auto-locking vault",
    description:
      "Your unlocked vault key lives only in memory and is wiped on lock, logout, or idle timeout.",
  },
];

export default function HomePage() {
  const [mode, setMode] = useState<"loading" | "setup" | "signin">("loading");

  useEffect(() => {
    let mounted = true;
    apiClient
      .getSetupStatus()
      .then((status) => {
        if (!mounted) return;
        setMode(status.needsSetup ? "setup" : "signin");
      })
      .catch(() => {
        if (!mounted) return;
        setMode("signin");
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
          <span className="text-xl font-bold">Clickrypt</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-[#c4d4e0] hover:text-white"
          >
            Sign in
          </Link>
          {mode === "setup" && (
            <Link
              href="/onboarding"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Get started
            </Link>
          )}
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight">
          The password manager that{" "}
          <span className="text-brand-500">can&apos;t read your passwords</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-[#8ba3b8]">
          Clickrypt encrypts everything on your device with keys only you hold.
          Built for teams. Designed for zero trust.
        </p>
        {mode === "setup" && (
          <p className="mt-2 text-sm text-brand-500">
            No vault configured yet. Create one to get started.
          </p>
        )}
        <div className="mt-10 flex gap-4">
          {mode === "loading" ? (
            <span className="rounded-lg bg-[#2a4055] px-6 py-3 font-semibold text-white">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading…
            </span>
          ) : (
            <Link
              href="/onboarding"
              className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Create your vault
            </Link>
          )}
          <Link
            href="/security"
            className="rounded-lg border border-[#2a4055] px-6 py-3 font-semibold text-[#e2e8f0] hover:bg-[#1a3349]"
          >
            How it works
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6"
          >
            <feature.icon className="h-8 w-8 text-brand-500" />
            <h3 className="mt-4 font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-[#8ba3b8]">{feature.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
