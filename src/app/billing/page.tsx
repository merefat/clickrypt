'use client';

import React from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { CreditCard, CheckCircle, ShieldCheck, ArrowRight, Download, Building2 } from 'lucide-react';

export default function BillingPage() {
  const invoices = [
    { id: 'INV-2024-00045', date: 'May 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
    { id: 'INV-2024-00044', date: 'Apr 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
    { id: 'INV-2024-00043', date: 'Mar 18, 2024', plan: 'Organization (Self-hosted)', amount: '$2,388.00', status: 'Paid' },
  ];

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto max-w-6xl">
          {/* Header Title */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-purple-400" />
                Billing & Payment
              </h1>
              <p className="text-xs text-gray-400">Manage your plan, payments, and invoices.</p>
            </div>

            <Link
              href="/checkout"
              className="purple-gradient-btn px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Stripe Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Left: Current Plan & Credit Card Payment Banner */}
            <div className="lg:col-span-2 space-y-6">
              {/* Current Plan Card (Screenshot pAh24.jpg) */}
              <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
                  <Building2 className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-bold text-white">Current Plan</h2>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      Organization <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-semibold">Self-hosted</span>
                    </h3>
                    <p className="text-xs text-gray-400">For teams and businesses managing their own PassVault server.</p>
                  </div>
                  <span className="flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-full text-xs font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" /> Active
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Users</span>
                    <span className="font-bold text-white text-sm">25 / 100</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Self-hosted Server</span>
                    <span className="font-bold text-white text-sm">On-premise</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Renewal Date</span>
                    <span className="font-bold text-white text-sm">May 18, 2025</span>
                  </div>
                </div>
              </div>

              {/* Credit Card Payment Banner linking to Stripe Checkout */}
              <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-purple-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Pay with Credit Card</h3>
                      <p className="text-xs text-gray-400">Secure payment powered by Stripe Payments.</p>
                    </div>
                  </div>

                  <Link
                    href="/checkout"
                    className="purple-gradient-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <span>Proceed to Stripe Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Right: Order Summary */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white mb-4">Order Summary</h3>
                <div className="space-y-3 text-xs border-b border-gray-800 pb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Organization Plan (Self-hosted)</span>
                    <span className="font-bold text-white">$2,148.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">25 Users Annual Subscription</span>
                    <span className="font-bold text-white">$2,148.00</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount</span>
                    <span>-$0.00</span>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center mb-6">
                  <span className="text-sm font-bold text-white">Total Due Today</span>
                  <span className="text-2xl font-extrabold text-purple-400">$2,388.00</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>30-Day Money-Back Guarantee. Cancel anytime with 1-click.</span>
              </div>
            </div>
          </div>

          {/* Invoice History Table */}
          <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90">
            <h3 className="text-sm font-bold text-white mb-4">Invoice History</h3>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b0f17] text-gray-400 uppercase border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Plan</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-4 font-mono text-purple-300">{inv.id}</td>
                    <td className="py-3 px-4 text-gray-400">{inv.date}</td>
                    <td className="py-3 px-4 text-white font-medium">{inv.plan}</td>
                    <td className="py-3 px-4 font-bold text-white">{inv.amount}</td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-semibold">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="px-2.5 py-1 bg-[#0b0f17] border border-gray-700 text-gray-300 rounded hover:text-white text-[10px]">
                        PDF Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
