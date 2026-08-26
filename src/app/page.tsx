'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Lock,
  ArrowRight,
  Fingerprint,
  AlertTriangle,
  Key,
  Share2,
  CheckCircle,
  Building2,
  Home,
  Star
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#dfe6ed] text-[#0f172a] flex flex-col justify-between p-6 relative overflow-hidden select-none font-sora">
      {/* Background Soft Glow Effects */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#0284c7]/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3.5 px-6 z-10 bg-[#ffffff]/80 backdrop-blur-md rounded-2xl border border-[#cbd5e1] shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Clickrypt Logo" className="h-12 w-auto object-contain drop-shadow-sm" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/login" className="text-xs font-bold text-[#0284c7] hover:text-[#0369a1] transition-colors">
            Already have a vault? <span className="underline">Sign in</span>
          </Link>
          <Link
            href="/mode"
            className="gold-cyan-gradient-btn px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm"
          >
            <span>Create your Vault</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl w-full mx-auto my-auto py-10 z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-[#0f172a] mb-4 leading-tight">
            Create your <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0284c7] to-[#d97706]">
              secure Vault
            </span>
          </h1>
          <p className="text-lg text-[#334155] mb-8 font-semibold">
            Your passwords. Your keys. Total privacy.
          </p>

          <div className="flex items-center gap-4 mb-10">
            <Link
              href="/mode"
              className="gold-cyan-gradient-btn px-7 py-3.5 rounded-xl text-sm font-extrabold flex items-center gap-2 shadow-md hover:scale-[1.02] transition-transform"
            >
              <span>Create your Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Glowing Light 3D Vault Card Illustration */}
        <div className="relative flex justify-center">
          <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-3xl bg-[#ffffff] border-2 border-[#cbd5e1] shadow-2xl flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-[#e0f2fe]/40 backdrop-blur-xs group-hover:bg-[#e0f2fe]/70 transition-all" />
            <div className="w-36 h-36 rounded-full bg-[#f1f5f9] border-4 border-[#0284c7] flex items-center justify-center shadow-md relative z-10">
              <Lock className="w-16 h-16 text-[#0284c7]" />
            </div>
          </div>
        </div>
      </main>

      {/* Features Cards Bar */}
      <section className="max-w-6xl w-full mx-auto py-6 z-10">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 mb-12">
          {[
            { title: 'Zero-Knowledge Encryption', desc: 'We never see your data. Ever.', icon: Shield },
            { title: 'Passkeys & MFA', desc: 'Modern auth, strong by default.', icon: Fingerprint },
            { title: 'Leak Detection', desc: 'Real-time alerts if your data is at risk.', icon: AlertTriangle },
            { title: 'Auto-fill & TOTP', desc: 'Seamless logins with built-in 2FA.', icon: Key },
            { title: 'Secure Sharing', desc: 'Share safely with granular controls.', icon: Share2 },
          ].map((f) => (
            <div key={f.title} className="bg-[#ffffff] p-4 rounded-2xl border border-[#cbd5e1] shadow-sm text-left hover:shadow-md transition-shadow">
              <f.icon className="w-5 h-5 text-[#0284c7] mb-2" />
              <h3 className="text-xs font-extrabold text-[#0f172a] mb-1">{f.title}</h3>
              <p className="text-[11px] text-[#64748b] leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing Cards Section */}
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0f172a] mb-1">Simple plans for individuals & teams</h2>
          <p className="text-xs text-[#475569] font-medium">Privacy-first plans. No hidden fees. Cancel anytime.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Solo Plan */}
          <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#cbd5e1] text-left flex flex-col justify-between shadow-md hover:shadow-lg transition-shadow">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Home className="w-5 h-5 text-[#0284c7]" />
                <h3 className="font-extrabold text-[#0f172a] text-base">Self-hosted / Solo</h3>
              </div>
              <p className="text-xs text-[#64748b] mb-4">For personal use or self-hosting.</p>
              <div className="text-3xl font-black text-[#0f172a] mb-4">
                $0 <span className="text-xs font-semibold text-[#64748b]">/forever</span>
              </div>
              <ul className="space-y-2.5 text-xs text-[#334155] font-semibold mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Unlimited passwords
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Passkeys & MFA
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Auto-fill & TOTP
                </li>
              </ul>
            </div>
            <Link
              href="/register?mode=self-hosted"
              className="w-full py-2.5 text-center text-xs font-extrabold rounded-xl gold-cyan-gradient-btn flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Organization Plan */}
          <div className="bg-[#ffffff] p-6 rounded-2xl border-2 border-[#f39c12] text-left flex flex-col justify-between relative shadow-xl hover:shadow-2xl transition-shadow">
            <div className="absolute -top-3 right-4 bg-[#f39c12] text-white text-[10px] font-extrabold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Star className="w-3 h-3 fill-current" /> MOST POPULAR
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-[#0284c7]" />
                <h3 className="font-extrabold text-[#0f172a] text-base">Organization</h3>
              </div>
              <p className="text-xs text-[#64748b] mb-4">For teams and businesses.</p>
              <div className="text-3xl font-black text-[#0f172a] mb-4">
                $6 <span className="text-xs font-semibold text-[#64748b]">/user /month</span>
              </div>
              <ul className="space-y-2.5 text-xs text-[#334155] font-semibold mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Everything in Solo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Advanced leak detection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#0284c7]" /> Secure sharing & admin controls
                </li>
              </ul>
            </div>
            <Link
              href="/register?mode=organization"
              className="w-full py-2.5 text-center text-xs font-extrabold rounded-xl gold-cyan-gradient-btn flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto border-t border-[#cbd5e1] pt-6 text-center text-xs font-semibold text-[#64748b] z-10">
        © 2026 Clickrypt, Inc. All rights reserved. End-to-end encrypted zero-knowledge password vault.
      </footer>
    </div>
  );
}
