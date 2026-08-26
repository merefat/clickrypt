'use client';

import React from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { CreditCard, CheckCircle, ShieldCheck, ArrowRight, Download, Building2 } from 'lucide-react';
import { ENABLE_PAY_BILL } from '@/lib/config';

export default function BillingPage() {
  const invoices = [
    { id: 'INV-2024-00045', date: 'May 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
    { id: 'INV-2024-00044', date: 'Apr 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
    { id: 'INV-2024-00043', date: 'Mar 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto max-w-6xl space-y-6">
          {/* Header Title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-sm">
                <CreditCard className="w-5 h-5 text-[#d97706]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Billing & Payment</h1>
                <p className="text-xs text-[#64748b] mt-0.5">Manage your plan, payments, and invoices.</p>
              </div>
            </div>

            {ENABLE_PAY_BILL && (
              <Link
                href="/checkout"
                className="gold-gradient-btn px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Stripe Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Current Plan & Credit Card Payment Banner */}
            <div className="lg:col-span-2 space-y-6">
              {/* Current Plan Card */}
              <div className="glass-panel p-6 rounded-2xl border border-[#d0dbe5] bg-[#ffffff] shadow-xl">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#cbd5e1]">
                  <Building2 className="w-4 h-4 text-[#0284c7]" />
                  <h2 className="text-sm font-extrabold text-[#0f172a]">Current Plan</h2>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                      Organization <span className="text-[10px] bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/40 px-2 py-0.5 rounded font-extrabold">Self-hosted</span>
                    </h3>
                    <p className="text-xs text-[#64748b] mt-0.5">For teams and businesses managing their own PassVault server.</p>
                  </div>
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-xs font-extrabold shadow-xs">
                    <CheckCircle className="w-3.5 h-3.5" /> Active
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#cbd5e1] text-xs">
                  <div>
                    <span className="text-[#64748b] block text-[10px] font-bold">Users</span>
                    <span className="font-extrabold text-[#0f172a] text-sm">25 / 100</span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block text-[10px] font-bold">Self-hosted Server</span>
                    <span className="font-extrabold text-[#0f172a] text-sm">On-premise</span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block text-[10px] font-bold">Renewal Date</span>
                    <span className="font-extrabold text-[#0f172a] text-sm">May 18, 2025</span>
                  </div>
                </div>
              </div>

              {/* Credit Card Payment Banner linking to Stripe Checkout */}
              {ENABLE_PAY_BILL && (
                <div className="glass-panel p-6 rounded-2xl border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-xs">
                        <CreditCard className="w-5 h-5 text-[#d97706]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-[#0f172a]">Pay with Credit Card</h3>
                        <p className="text-xs text-[#64748b]">Secure payment powered by Stripe Payments.</p>
                      </div>
                    </div>

                    <Link
                      href="/checkout"
                      className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 text-white shadow-md cursor-pointer"
                    >
                      <span>Proceed to Stripe Checkout</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Payment Security Overview */}
            <div className="glass-panel p-6 rounded-2xl border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
              <div className="flex items-center gap-2 pb-3 border-b border-[#cbd5e1]">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-extrabold text-[#0f172a]">Payment Security</h2>
              </div>

              <p className="text-xs text-[#64748b] leading-relaxed">
                All transactions are encrypted with zero-knowledge keys and processed via PCI-DSS Level 1 certified gateways.
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Stripe 256-bit SSL Encryption</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Zero Credit Card Data Saved</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Instant Automatic Renewal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoices History Table */}
          <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden bg-[#ffffff] shadow-xl">
            <div className="p-4 border-b border-[#cbd5e1] flex items-center justify-between text-xs font-extrabold text-[#0284c7]">
              <span>Billing History & Invoices</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                  <tr>
                    <th className="py-3.5 px-6">Invoice ID</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Plan</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                      <td className="py-4 px-6 font-bold text-[#0f172a]">{inv.id}</td>
                      <td className="py-4 px-4 text-[#64748b]">{inv.date}</td>
                      <td className="py-4 px-4 text-[#334155] font-medium">{inv.plan}</td>
                      <td className="py-4 px-4 font-bold text-[#0f172a]">{inv.amount}</td>
                      <td className="py-4 px-4">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button className="text-[#0284c7] hover:underline font-extrabold text-xs inline-flex items-center gap-1 cursor-pointer">
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
