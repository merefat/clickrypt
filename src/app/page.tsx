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
    <div className="min-h-screen bg-[#091528] text-white flex flex-col justify-between p-6 relative overflow-hidden select-none">
      {/* Glow Effects */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#1fbbd2]/15 rounded-full blur-[150px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1fbbd2] to-[#f39c12] flex items-center justify-center shadow-lg shadow-[#1fbbd2]/40">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white glow-cyan">Clickrypt</span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-xs font-semibold text-[#1fbbd2] hover:text-white transition-colors">
            Already have a vault? <span className="underline">Sign in</span>
          </Link>
          <Link
            href="/mode"
            className="gold-cyan-gradient-btn px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
          >
            <span>Create your Vault</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section (Screenshot ND6Pk.jpg) */}
      <main className="max-w-6xl w-full mx-auto my-auto py-12 z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Create your <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#1fbbd2] to-[#f39c12] glow-cyan">
              secure Vault
            </span>
          </h1>
          <p className="text-lg text-gray-300 mb-8 font-medium">
            Your passwords. Your keys. Total privacy.
          </p>

          <div className="flex items-center gap-4 mb-10">
            <Link
              href="/mode"
              className="gold-cyan-gradient-btn px-7 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <span>Create your Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Metallic Glowing 3D Vault Illustration Icon */}
        <div className="relative flex justify-center">
          <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-3xl bg-gradient-to-tr from-[#091528] to-[#0d1724] border-2 border-[#1fbbd2]/40 shadow-2xl flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-[#1fbbd2]/10 backdrop-blur-sm group-hover:bg-[#1fbbd2]/20 transition-all" />
            <div className="w-36 h-36 rounded-full bg-[#091528] border-4 border-[#1fbbd2] flex items-center justify-center shadow-inner relative z-10">
              <Lock className="w-16 h-16 text-[#1fbbd2] glow-cyan" />
            </div>
          </div>
        </div>
      </main>

      {/* Features Cards Bar (Screenshot ND6Pk.jpg) */}
      <section className="max-w-6xl w-full mx-auto py-8 z-10">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-12">
          {[
            { title: 'Zero-Knowledge Encryption', desc: 'We never see your data. Ever.', icon: Shield },
            { title: 'Passkeys & MFA', desc: 'Modern auth, strong by default.', icon: Fingerprint },
            { title: 'Leak Detection', desc: 'Real-time alerts if your data is at risk.', icon: AlertTriangle },
            { title: 'Auto-fill & TOTP', desc: 'Seamless logins with built-in 2FA.', icon: Key },
            { title: 'Secure Sharing', desc: 'Share safely with granular controls.', icon: Share2 },
          ].map((f) => (
            <div key={f.title} className="glass-panel p-3.5 rounded-xl border border-[#1fbbd2] text-left">
              <f.icon className="w-5 h-5 text-[#1fbbd2] mb-2" />
              <h3 className="text-xs font-bold text-white mb-0.5">{f.title}</h3>
              <p className="text-[10px] text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing Cards Section (Screenshot ND6Pk.jpg) */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Simple plans for individuals & teams</h2>
          <p className="text-xs text-gray-400">Privacy-first plans. No hidden fees. Cancel anytime.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Solo Plan */}
          <div className="glass-panel p-6 rounded-2xl border border-[#1fbbd2] bg-[#091528]/80 text-left flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Home className="w-5 h-5 text-[#1fbbd2]" />
                <h3 className="font-bold text-white text-base">Self-hosted / Solo</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">For personal use or self-hosting.</p>
              <div className="text-3xl font-extrabold text-white mb-4">
                $0 <span className="text-xs font-normal text-gray-400">/forever</span>
              </div>
              <ul className="space-y-2 text-xs text-gray-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Unlimited passwords
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Passkeys & MFA
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Auto-fill & TOTP
                </li>
              </ul>
            </div>
            <Link
              href="/register?mode=self-hosted"
              className="w-full py-2.5 text-center text-xs font-bold rounded-xl gold-cyan-gradient-btn flex items-center justify-center gap-1.5"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Organization Plan */}
          <div className="glass-panel p-6 rounded-2xl border-2 border-[#f39c12]/60 bg-[#091528]/90 text-left flex flex-col justify-between relative shadow-xl">
            <div className="absolute -top-3 right-4 bg-[#f39c12] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" /> MOST POPULAR
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-[#1fbbd2]" />
                <h3 className="font-bold text-white text-base">Organization</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">For teams and businesses.</p>
              <div className="text-3xl font-extrabold text-white mb-4">
                $6 <span className="text-xs font-normal text-gray-400">/user /month</span>
              </div>
              <ul className="space-y-2 text-xs text-gray-300 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Everything in Solo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Advanced leak detection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1fbbd2]" /> Secure sharing & admin controls
                </li>
              </ul>
            </div>
            <Link
              href="/register?mode=organization"
              className="w-full py-2.5 text-center text-xs font-semibold rounded-xl gold-cyan-gradient-btn flex items-center justify-center gap-1.5"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto border-t border-[#1fbbd2]/20 pt-6 text-center text-xs text-[#1fbbd2]/60 z-10">
        © 2026 Clickrypt, Inc. All rights reserved. End-to-end encrypted zero-knowledge password vault.
      </footer>
    </div>
  );
}
