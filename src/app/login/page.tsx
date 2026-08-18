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
  Lock as LockIcon,
  Globe,
  KeyRound
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [unpaidBill, setUnpaidBill] = useState(false);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [isExternalFlow, setIsExternalFlow] = useState(false);

  useEffect(() => {
    fetchSubscription();

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('externalShareId') || searchParams.get('role') === 'External') {
      setIsExternalFlow(true);
    }

    const ssoSuccess = searchParams.get('ssoSuccess');
    const token = searchParams.get('token');
    const userIdParam = searchParams.get('userId');

    if (ssoSuccess && token && userIdParam) {
      handleSsoCallbackLogin(token, userIdParam);
    }
  }, []);

  const handleSsoCallbackLogin = async (token: string, userId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/sso/keys/sso-key-1/${userId}/${token}`);
      if (res.data.success) {
        await login(email, password);
        router.push('/vault');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'SSO authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateSso = async (provider: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.post(`/sso/${provider}/login`, { email, userId: 'u-1' });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || `Failed to initiate ${provider} SSO login`);
    } finally {
      setLoading(false);
    }
  };

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
        try {
          const meRes = await api.get('/auth/me');
          if (meRes.data?.user?.role === 'External') {
            router.push('/shared');
            return;
          }
        } catch (e) {}
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
    <div className="min-h-screen bg-white text-[#091528] flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sora">
      <div className="absolute top-1/3 left-10 w-96 h-96 bg-[#f39c12]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-10 w-96 h-96 bg-[#1fbbd2]/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center justify-center mb-8">
        <img src="/logo.png" alt="Clickrypt Logo" className="h-36 w-auto object-contain drop-shadow-xl" />
      </div>

      {/* Login Box */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl !bg-[#f5f8fb] z-10 relative">
        {/* Header Action Bar with Pay Bill Button */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60">
          <span className="text-xs font-bold text-[#091528]">Sign In Portal</span>

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
            className="w-full py-1.5 bg-[#f39c12]/10 hover:bg-[#f39c12]/20 border border-[#f39c12] text-[#f39c12] text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all"
            title="Click to simulate an unpaid bill lockout or restore active bill"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Demo: {subscription?.status === 'Expired' ? 'Restore Active Bill' : 'Simulate Unpaid Bill Lockout'}</span>
          </button>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-[#091528] mb-1">Sign In to Your Vault</h1>
          <p className="text-xs text-[#091528]">Enter your credentials to decrypt your OpenPGP keyring.</p>
        </div>

        {/* UNPAID BILL LOCKOUT WARNING BANNER */}
        {unpaidBill && (
          <div className="mb-6 p-4 bg-rose-100 border border-rose-300 rounded-xl text-xs text-rose-800 space-y-3 animate-in fade-in shadow-xl">
            <div className="flex items-start gap-2.5">
              <LockIcon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-rose-900 text-sm">Sign-In Blocked: Unpaid Bill</p>
                <p className="text-[11px] text-rose-700/90 mt-0.5">
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
          <div className="mb-4 p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs text-rose-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#091528] uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder=""
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#091528] focus:border-[#1fbbd2] outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#091528] uppercase tracking-wider mb-1">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-10 py-2.5 text-xs font-mono text-[#091528] focus:border-[#1fbbd2] outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#1fbbd2]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 gold-cyan-gradient-btn text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 mt-4 shadow-xl"
          >
            <span>{loading ? 'Authenticating & Verifying Bill...' : 'Sign In to Vault'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Forgot Passphrase / Account Recovery Link */}
        <div className="mt-4 text-center">
          <Link
            href="/recover"
            className="text-xs text-gray-500 hover:text-[#1fbbd2] transition-colors flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#f39c12]" />
            <span>Forgot Master Password? Recover Account</span>
          </Link>
        </div>

        {/* Single Sign-On (SSO) Buttons Section - Hidden for External Users */}
        {!isExternalFlow && (
          <div className="mt-6 pt-5 border-t border-gray-300/60 space-y-3">
            <div className="text-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Or Sign In via Corporate SSO
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleInitiateSso('google')}
                className="py-2.5 px-3 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-bold text-[#091528] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[#f39c12]" />
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleInitiateSso('azure')}
                className="py-2.5 px-3 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-bold text-[#091528] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[#1fbbd2]" />
                <span>Azure AD</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-300/60 flex items-center justify-between text-[11px]">
          <span className="text-gray-500">Need to pay subscription bill?</span>
          <Link href="/checkout" className="text-[#f39c12] font-extrabold hover:underline flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pay Bill Page</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
