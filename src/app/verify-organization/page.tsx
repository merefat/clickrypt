'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Mail, ArrowRight, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const param = searchParams.get('email');
    if (param) setEmail(param);
  }, [searchParams]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !code) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/auth/verify-organization', { email, code });
      if (res.data?.success) {
        setMessage('Organization verified! Redirecting to sign in...');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setError(res.data?.error || 'Verification failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/auth/resend-verification', { email });
      setMessage(res.data?.message || 'A new verification code has been sent to your email.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dfe6ed] text-[#0f172a] flex flex-col items-center justify-center p-6 font-sora">
      <div className="w-full max-w-md glass-panel p-6 sm:p-8 rounded-3xl border border-[#d0dbe5] shadow-2xl bg-[#ffffff]">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#e0f2fe] flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-[#0284c7]" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0f172a]">Verify Organization</h1>
          <p className="text-xs text-[#64748b] mt-1">
            Enter the verification code sent to {email || 'your email'}.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-bold mb-4">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold mb-4">
            {message}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0f172a] font-bold outline-none shadow-xs focus:border-[#1fbbd2]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              placeholder="000000"
              className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-4 py-2.5 text-xs text-[#0f172a] font-bold outline-none shadow-xs focus:border-[#1fbbd2] text-center tracking-widest"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 gold-cyan-gradient-btn text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-all cursor-pointer"
          >
            <span>{loading ? 'Verifying...' : 'Verify Organization'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="w-full mt-4 py-2.5 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] text-[#0284c7] text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          <span>{resending ? 'Sending...' : 'Resend Code'}</span>
        </button>
      </div>
    </div>
  );
}

export default function VerifyOrganizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#dfe6ed] flex items-center justify-center text-[#0f172a] text-xs font-bold font-sora">Loading...</div>}>
      <VerifyForm />
    </Suspense>
  );
}
