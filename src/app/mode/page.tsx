'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, User, Building2, ArrowRight, CheckCircle } from 'lucide-react';

export default function ModePage() {
  return (
    <div className="min-h-screen bg-[#0d1724] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sora">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#f39c12]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#1fbbd2]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center gap-1 mb-10 text-center">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center shadow-lg shadow-[#f39c12]/20">
            <Shield className="w-6 h-6 text-[#0d1724]" />
          </div>
          <span className="text-2xl font-extrabold text-white glow-gold">Clickrypt</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Choose How You Want to Use Clickrypt</h1>
        <p className="text-xs text-[#1fbbd2] max-w-md mt-1">
          Select between individual personal vault storage or enterprise team organization management.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl z-10">
        {/* Card 1: Personal Mode */}
        <div className="glass-panel p-8 rounded-3xl border border-[rgba(31,187,210,0.25)] bg-[#17283b] flex flex-col justify-between hover:border-[#1fbbd2]/60 transition-all group shadow-2xl">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#0d1724] border border-[#1fbbd2]/40 text-[#1fbbd2] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
              <User className="w-6 h-6" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Personal Vault</h2>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Store your personal passwords, payment cards, and secure private notes with zero-knowledge OpenPGP client-side encryption.
            </p>

            <div className="space-y-2 text-xs text-gray-300 mb-8">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#1fbbd2]" />
                <span>Unlimited personal passwords</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#1fbbd2]" />
                <span>Private Secret Vault & Generator</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#1fbbd2]" />
                <span>Cross-device synchronization</span>
              </div>
            </div>
          </div>

          <Link
            href="/register?mode=personal"
            className="w-full py-3.5 bg-[#0d1724] hover:bg-gray-800 border border-[#1fbbd2]/40 text-[#1fbbd2] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <span>Start Personal Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Card 2: Organization Mode */}
        <div className="glass-panel-gold p-8 rounded-3xl border border-[rgba(243,156,18,0.4)] bg-[#17283b] flex flex-col justify-between hover:border-[#f39c12]/80 transition-all group shadow-2xl relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-[#f39c12]/20 text-[#f39c12] border border-[#f39c12]/50 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase">
            Recommended
          </div>

          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#0d1724] border border-[#f39c12]/50 text-[#f39c12] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
              <Building2 className="w-6 h-6" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Organization & Team</h2>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Manage enterprise teams, shared groups, member role permissions, and organization-wide password security controls.
            </p>

            <div className="space-y-2 text-xs text-gray-300 mb-8">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#f39c12]" />
                <span>Team groups & shared folders</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#f39c12]" />
                <span>E2EE OpenPGP member re-encryption</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#f39c12]" />
                <span>Role control & audit security logs</span>
              </div>
            </div>
          </div>

          <Link
            href="/register?mode=organization"
            className="w-full py-3.5 gold-cyan-gradient-btn text-[#0d1724] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xl transition-all"
          >
            <span>Start Organization ($6/user/mo)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
