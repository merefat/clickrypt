'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, User, Building2, ArrowRight, CheckCircle } from 'lucide-react';

export default function ModePage() {
  return (
    <div className="min-h-screen bg-[#dfe6ed] text-[#0f172a] flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sora">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#1fbbd2]/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#f39c12]/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center gap-1 mb-10 text-center">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center shadow-lg text-[#0284c7]">
            <Shield className="w-6 h-6 text-[#0284c7]" />
          </div>
          <span className="text-2xl font-extrabold text-[#0f172a]">Clickrypt</span>
        </div>
        <h1 className="text-3xl font-extrabold text-[#0f172a]">Choose How You Want to Use Clickrypt</h1>
        <p className="text-xs text-[#64748b] max-w-md mt-1 font-medium">
          Select between individual personal vault storage or enterprise team organization management.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl z-10">
        {/* Card 1: Personal Mode */}
        <div className="glass-panel p-8 rounded-3xl border border-[#d0dbe5] bg-[#ffffff] flex flex-col justify-between hover:border-[#1fbbd2] transition-all group shadow-xl">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#e0f2fe] border border-[#1fbbd2]/40 text-[#0284c7] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xs">
              <User className="w-6 h-6 text-[#0284c7]" />
            </div>

            <h2 className="text-xl font-extrabold text-[#0f172a] mb-2">Personal Vault</h2>
            <p className="text-xs text-[#64748b] mb-6 leading-relaxed font-medium">
              Store your personal passwords, payment cards, and secure private notes with zero-knowledge OpenPGP client-side encryption.
            </p>

            <div className="space-y-2 text-xs text-[#334155] mb-8 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#0284c7]" />
                <span>Unlimited personal passwords</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#0284c7]" />
                <span>Private Secret Vault & Generator</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#0284c7]" />
                <span>Cross-device synchronization</span>
              </div>
            </div>
          </div>

          <Link
            href="/register?mode=personal"
            className="w-full py-3.5 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] text-[#0284c7] font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <span>Start Personal Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Card 2: Organization Mode */}
        <div className="glass-panel p-8 rounded-3xl border border-[#f39c12]/40 bg-[#ffffff] flex flex-col justify-between hover:border-[#f39c12] transition-all group shadow-xl relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase shadow-xs">
            Recommended
          </div>

          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#fffbeb] border border-[#f39c12]/40 text-[#d97706] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xs">
              <Building2 className="w-6 h-6 text-[#d97706]" />
            </div>

            <h2 className="text-xl font-extrabold text-[#0f172a] mb-2">Organization & Team</h2>
            <p className="text-xs text-[#64748b] mb-6 leading-relaxed font-medium">
              Manage enterprise teams, shared groups, member role permissions, and organization-wide password security controls.
            </p>

            <div className="space-y-2 text-xs text-[#334155] mb-8 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#d97706]" />
                <span>Team groups & shared folders</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#d97706]" />
                <span>E2EE OpenPGP member re-encryption</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#d97706]" />
                <span>Role control & audit security logs</span>
              </div>
            </div>
          </div>

          <Link
            href="/register?mode=organization"
            className="w-full py-3.5 gold-cyan-gradient-btn text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
          >
            <span>Start Organization ($6/user/mo)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
