import Link from "next/link";
import {
  KeyRound,
  Lock,
  Share2,
  ShieldCheck,
  ArrowLeft,
  Server,
  Eye,
  EyeOff,
} from "lucide-react";

const steps = [
  {
    icon: KeyRound,
    title: "1. Key Generation",
    description:
      "When you create an account, a PGP key pair is generated entirely in your browser. Your private key is encrypted with your master passphrase and never sent to our servers in plaintext.",
  },
  {
    icon: Lock,
    title: "2. Challenge-Based Login",
    description:
      "Authentication uses a cryptographic challenge. The server encrypts a random token with your public key — only your decrypted private key can answer it. No password hashes, no brute-force targets.",
  },
  {
    icon: ShieldCheck,
    title: "3. Client-Side Encryption",
    description:
      "Every secret you store is encrypted in your browser before it leaves your device. Our servers only see ciphertext — we cannot read your passwords, notes, or any other data.",
  },
  {
    icon: Share2,
    title: "4. Secure Sharing",
    description:
      "When you share a credential, it's re-encrypted specifically for each recipient's public key. You can revoke access instantly, and the recipient's copy becomes useless.",
  },
  {
    icon: EyeOff,
    title: "5. Zero-Knowledge Architecture",
    description:
      "We have no access to your unencrypted data. If our database is compromised, attackers only find encrypted blobs they cannot decrypt without your private key.",
  },
  {
    icon: Server,
    title: "6. Auto-Locking Vault",
    description:
      "Your decrypted private key lives only in memory and is wiped on lock, logout, or after 15 minutes of inactivity. Nothing sensitive is persisted in the browser.",
  },
];

export default function SecurityPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <Link
        href="/"
        className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <div className="mb-10 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-brand-500" />
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
          How Clickrypt Works
        </h1>
        <p className="mt-4 text-lg text-[#8ba3b8]">
          Zero-knowledge, end-to-end encryption from key generation to secure sharing.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {steps.map((step) => (
          <div
            key={step.title}
            className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6"
          >
            <step.icon className="h-8 w-8 text-brand-500" />
            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-[#8ba3b8]">{step.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-brand-500/30 bg-brand-500/5 p-8 text-center">
        <h2 className="text-xl font-bold">Ready to secure your passwords?</h2>
        <p className="mt-2 text-sm text-[#8ba3b8]">
          Create your vault in minutes — your master passphrase never leaves your device.
        </p>
        <Link
          href="/onboarding"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Get started
        </Link>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[#8ba3b8]">
        <Eye className="h-4 w-4" />
        <span>We can&apos;t read your passwords. That&apos;s the point.</span>
      </div>
    </main>
  );
}
