'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  CreditCard,
  Building2,
  ArrowRight,
  RefreshCw,
  Fingerprint,
  MailCheck,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { evaluatePasswordStrength } from '@/lib/crypto';
import { generatePassword } from '@/lib/generator';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();

  const mode = searchParams.get('mode'); // 'organization' or 'personal'
  const isOrgMode = mode === 'organization';
  const inviteToken = searchParams.get('inviteToken');
  const invitedEmail = searchParams.get('email');
  const invitedRole = searchParams.get('role');
  const externalShareId = searchParams.get('externalShareId');
  const isExternalShare = !!externalShareId || invitedRole === 'External';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isInvited, setIsInvited] = useState(false);

  // Stripe Inline Credit Card Payment State for Organization Mode
  const [seats, setSeats] = useState(25);
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [paymentDone, setPaymentDone] = useState(false);

  const annualTotal = seats * 6 * 12;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const selectedMode = mode === 'organization' ? 'organization' : 'personal';
      localStorage.setItem('clickrypt_app_mode', selectedMode);
    }
    if (invitedEmail) {
      setEmail(invitedEmail);
      setIsInvited(true);
    }
  }, [invitedEmail, mode]);

  const strength = evaluatePasswordStrength(password);

  const handleAutoGenerate = () => {
    const generated = generatePassword({ type: 'password', length: 16 });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enforce Stripe Pay-to-Enroll Gate for Organization Mode
    if (isOrgMode && !paymentDone) {
      if (!cardNumber || !expiry || !cvc) {
        alert('Payment required to enroll Organization account. Please enter valid card details.');
        return;
      }

      setLoading(true);
      try {
        const checkoutRes = await api.post('/checkout', {
          seats,
          planName: 'Organization Plan',
          cardHolder: cardHolder || fullName,
          amount: annualTotal,
        });

        if (!checkoutRes.data?.success) {
          alert('Stripe payment verification failed');
          setLoading(false);
          return;
        }

        // Mark subscription active
        await api.post('/subscription', { action: 'PAY', seats });
        setPaymentDone(true);
      } catch (err) {
        alert('Stripe payment failed. Payment is required to enroll.');
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      const assignedRole = isExternalShare ? 'External' : (invitedRole as any) || 'User';
      const ok = await register(fullName || 'Guest User', email, password, assignedRole);
      if (ok) {
        if (assignedRole === 'External') {
          router.push('/shared');
        } else {
          router.push('/vault');
        }
      } else {
        alert('Registration failed');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dfe6ed] text-[#0f172a] flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sora">
      <div className="absolute top-1/3 left-10 w-96 h-96 bg-[#1fbbd2]/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center justify-center mb-6">
        <img src="/logo.png" alt="Clickrypt Logo" className="h-32 w-auto object-contain drop-shadow-md" />
      </div>

      {/* Profile Setup & Pay-to-Enroll Box */}
      <div className="w-full max-w-xl glass-panel p-8 rounded-3xl border border-[#d0dbe5] shadow-2xl bg-[#ffffff] z-10">
        <div className="text-center mb-6">
          {isExternalShare && (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-[#d97706] border border-amber-300 px-3 py-1 rounded-full text-xs font-extrabold mb-3 shadow-xs">
              <Globe className="w-3.5 h-3.5 text-[#d97706]" />
              <span>External Password Share Access (Register to Access Shared Secret)</span>
            </div>
          )}

          {isOrgMode && (
            <div className="inline-flex items-center gap-1.5 bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 px-3 py-1 rounded-full text-xs font-extrabold mb-3 shadow-xs">
              <Building2 className="w-3.5 h-3.5 text-[#d97706]" />
              <span>Organization Enrollment (Stripe Payment Gate)</span>
            </div>
          )}

          {isInvited && (
            <div className="inline-flex items-center gap-1.5 bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/40 px-3 py-1 rounded-full text-xs font-extrabold mb-3 shadow-xs">
              <MailCheck className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Invited Member Account ({invitedRole || 'User'})</span>
            </div>
          )}

          <h1 className="text-2xl font-extrabold text-[#0f172a] mb-1">
            {isOrgMode ? 'Organization Setup & Credit Card Enrollment' : 'Complete Profile Setup'}
          </h1>
          <p className="text-xs text-[#64748b] font-medium">
            {isOrgMode
              ? 'Complete Stripe credit card payment to enroll and activate your team vault.'
              : 'Set up your master password and OpenPGP key pair.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sora">
          <div>
            <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder=""
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0f172a] font-bold outline-none shadow-xs transition-all focus:border-[#1fbbd2]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
              Email Address {isInvited && '(Invited & Locked)'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder=""
                value={email}
                readOnly={isInvited}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`w-full border rounded-xl pl-10 pr-10 py-2.5 text-xs font-bold outline-none shadow-xs ${
                  isInvited
                    ? 'bg-[#f8fafc] border-[#cbd5e1] text-[#0284c7]'
                    : 'bg-[#ffffff] border-[#cbd5e1] text-[#0f172a] focus:border-[#1fbbd2]'
                }`}
                required
              />
              {email.trim().length > 0 && email.includes('@') && (
                <CheckCircle className="w-4 h-4 text-emerald-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter a strong master password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-10 py-2.5 text-xs font-mono font-bold text-[#0f172a] placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none shadow-xs transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAutoGenerate}
            className="w-full py-2.5 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] text-[#0284c7] text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Auto-generate strong password
          </button>

          {/* Embedded Stripe Credit Card Section for Organization Mode */}
          {isOrgMode && (
            <div className="glass-panel p-5 rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] space-y-3 mt-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#d97706]" />
                  <span className="text-xs font-extrabold text-[#0f172a]">Stripe Payment Gate ($6/user/mo)</span>
                </div>
                <span className="text-xs font-extrabold text-[#0284c7]">${annualTotal.toLocaleString()}.00 / yr</span>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-[#334155] mb-1">Cardholder Name</label>
                <input
                  type="text"
                  placeholder="Alex Morgan"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2 text-xs font-bold text-[#0f172a] shadow-xs"
                  required={isOrgMode}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-extrabold text-[#334155] mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2 text-xs font-mono font-bold text-[#0f172a] shadow-xs"
                    required={isOrgMode}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-[#334155] mb-1">Expiry & CVC</label>
                  <input
                    type="text"
                    placeholder="12/28"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2 text-xs font-mono font-bold text-[#0f172a] shadow-xs"
                    required={isOrgMode}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 gold-cyan-gradient-btn text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-2 mt-4 shadow-md hover:opacity-95 transition-all cursor-pointer"
          >
            <span>
              {loading
                ? 'Processing Stripe & Generating PGP Keys...'
                : isOrgMode
                ? `Pay $${annualTotal.toLocaleString()}.00 & Enroll Organization`
                : 'Save & Complete Setup'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#dfe6ed] flex items-center justify-center text-[#0f172a] text-xs font-bold font-sora">Loading onboarding...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
