'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CreditCard,
  AlertTriangle,
  Lock as LockIcon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('alex.morgan@acme.com');
  const [password, setPassword] = useState('AcmeMasterPass123!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [unpaidBill, setUnpaidBill] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/subscription');
      setSubscription(res.data);
      if (res.data?.status === 'Expired' || res.data?.daysRemaining <= 0) {
        setUnpaidBill(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Demo toggle between Active and Expired/Unpaid Bill
  const handleToggleDemoExpiry = async () => {
    const nextAction = subscription?.status === 'Expired' ? 'RENEW' : 'EXPIRE_DEMO';
    try {
      const res = await api.post('/subscription', { action: nextAction });
      setSubscription(res.data.subscription);
      if (res.data.subscription.status === 'Expired') {
        setUnpaidBill(true);
        setErrorMsg('🔒 Access Blocked: Organization subscription bill is unpaid or expired. Bill payment required before signing in.');
      } else {
        setUnpaidBill(false);
        setErrorMsg('');
      }
    } catch (err) {
      alert('Failed to toggle demo bill status');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setUnpaidBill(false);

    try {
      const ok = await login(email, password);
      if (ok) {
        router.push('/vault');
      } else {
        setErrorMsg('Authentication failed. Account may be suspended or credentials invalid.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Login error occurred';
      setErrorMsg(msg);
      if (err.response?.status === 402 || err.response?.data?.unpaidBill) {
        setUnpaidBill(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1724] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sora">
      <div className="absolute top-1/3 left-10 w-96 h-96 bg-[#f39c12]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-10 w-96 h-96 bg-[#1fbbd2]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center gap-1 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center shadow-lg shadow-[#f39c12]/20">
            <Shield className="w-6 h-6 text-[#0d1724]" />
          </div>
          <span className="text-2xl font-extrabold text-white glow-gold">Clickrypt</span>
        </div>
        <p className="text-xs text-[#1fbbd2] font-semibold">Zero-Knowledge Password Manager</p>
      </div>

      {/* Login Box */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-[rgba(31,187,210,0.25)] shadow-2xl bg-[#17283b] z-10 relative">
        {/* Header Action Bar with Pay Bill Button */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/60">
          <span className="text-xs font-bold text-gray-300">Sign In Portal</span>

          <Link
            href="/checkout"
            className="px-3 py-1.5 gold-gradient-btn text-xs font-bold rounded-lg flex items-center gap-1.5 shadow"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pay Bill</span>
          </Link>
        </div>

        {/* Demo Toggle for Expiry Simulation */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleToggleDemoExpiry}
            className="w-full py-1.5 bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all"
            title="Click to simulate an unpaid bill lockout or restore active bill"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Demo: {subscription?.status === 'Expired' ? 'Restore Active Bill' : 'Simulate Unpaid Bill Lockout'}</span>
          </button>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-white mb-1">Sign In to Your Vault</h1>
          <p className="text-xs text-gray-300">Enter your credentials to decrypt your OpenPGP keyring.</p>
        </div>

        {/* UNPAID BILL LOCKOUT WARNING BANNER */}
        {unpaidBill && (
          <div className="mb-6 p-4 bg-rose-950/90 border border-rose-600 rounded-xl text-xs text-rose-200 space-y-3 animate-in fade-in shadow-xl">
            <div className="flex items-start gap-2.5">
              <LockIcon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-white text-sm">Sign-In Blocked: Unpaid Bill</p>
                <p className="text-[11px] text-rose-300/90 mt-0.5">
                  Organization subscription bill is unpaid or expired. Owner, Admins & Users are blocked from signing in until the bill is paid.
                </p>
              </div>
            </div>

            <Link
              href="/checkout"
              className="w-full py-2.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold rounded-lg flex items-center justify-center gap-2 shadow"
            >
              <CreditCard className="w-4 h-4" />
              <span>Pay Bill Now via Stripe ($6/mo)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {errorMsg && !unpaidBill && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-700/60 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="alex.morgan@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0d1724] border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:border-[#1fbbd2] outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0d1724] border border-gray-700 rounded-xl pl-10 pr-10 py-2.5 text-xs font-mono text-white focus:border-[#1fbbd2] outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 purple-gradient-btn text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 mt-4 shadow-xl text-[#0d1724]"
          >
            <span>{loading ? 'Authenticating & Verifying Bill...' : 'Sign In to Vault'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-700/60 flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Need to pay subscription bill?</span>
          <Link href="/checkout" className="text-[#f39c12] font-extrabold hover:underline flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pay Bill Page</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
