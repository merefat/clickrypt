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
  ShieldCheck
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

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('alex.morgan@acme.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isInvited, setIsInvited] = useState(false);

  // Stripe Inline Credit Card Payment State for Organization Mode
  const [seats, setSeats] = useState(25);
  const [cardHolder, setCardHolder] = useState('Alex Morgan');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12 / 28');
  const [cvc, setCvc] = useState('123');
  const [paymentDone, setPaymentDone] = useState(false);

  const annualTotal = seats * 6 * 12;

  useEffect(() => {
    if (invitedEmail) {
      setEmail(invitedEmail);
      setIsInvited(true);
    }
  }, [invitedEmail]);

  const strength = evaluatePasswordStrength(password);

  const handleAutoGenerate = () => {
    const generated = generatePassword({ type: 'passphrase' });
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
      const ok = await register(fullName || 'Alex Morgan', email, password);
      if (ok) {
        router.push('/vault');
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
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
      <div className="absolute top-1/3 left-10 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center gap-1 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white glow-purple">Clickrypt</span>
        </div>
        <p className="text-xs text-gray-400">Zero-Knowledge OpenPGP Password Manager</p>
      </div>

      {/* Profile Setup & Pay-to-Enroll Box */}
      <div className="w-full max-w-xl glass-panel p-8 rounded-2xl border border-[rgba(124,58,237,0.25)] shadow-2xl bg-[#151b28]/95 z-10">
        <div className="text-center mb-6">
          {isOrgMode && (
            <div className="inline-flex items-center gap-1.5 bg-purple-950/80 text-purple-300 border border-purple-800 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <Building2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Organization Enrollment (Stripe Payment Gate)</span>
            </div>
          )}

          {isInvited && (
            <div className="inline-flex items-center gap-1.5 bg-purple-950/80 text-purple-300 border border-purple-800 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <MailCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Invited Member Account ({invitedRole || 'User'})</span>
            </div>
          )}

          <h1 className="text-2xl font-extrabold text-white mb-1">
            {isOrgMode ? 'Organization Setup & Credit Card Enrollment' : 'Complete Profile Setup'}
          </h1>
          <p className="text-xs text-gray-400">
            {isOrgMode
              ? 'Complete Stripe credit card payment to enroll and activate your team vault.'
              : 'Set up your master password and OpenPGP key pair.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-xs text-white focus:border-purple-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Email Address {isInvited && '(Invited & Locked)'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="alex.morgan@acme.com"
                value={email}
                readOnly={isInvited}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full border rounded-lg pl-10 pr-10 py-2.5 text-xs text-white outline-none ${
                  isInvited
                    ? 'bg-[#151b28] border-purple-800 text-purple-300 font-semibold'
                    : 'bg-[#0b0f17] border-gray-700 focus:border-purple-500'
                }`}
                required
              />
              <CheckCircle className="w-4 h-4 text-emerald-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter a strong master password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg pl-10 pr-10 py-2.5 text-xs font-mono text-white focus:border-purple-500 outline-none"
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
            type="button"
            onClick={handleAutoGenerate}
            className="w-full py-2 bg-[#0b0f17] hover:bg-[#1a202c] border border-purple-900/50 text-purple-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Auto-generate strong passphrase
          </button>

          {/* Embedded Stripe Credit Card Section for Organization Mode */}
          {isOrgMode && (
            <div className="glass-panel p-5 rounded-xl border border-purple-600/40 bg-[#0b0f17]/90 space-y-3 mt-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white">Stripe Payment Gate ($6/user/mo)</span>
                </div>
                <span className="text-xs font-bold text-purple-300">${annualTotal.toLocaleString()}.00 / yr</span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-300 mb-1">Cardholder Name</label>
                <input
                  type="text"
                  placeholder="Alex Morgan"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2 text-xs text-white"
                  required={isOrgMode}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-300 mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2 text-xs font-mono text-white"
                    required={isOrgMode}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-300 mb-1">Expiry & CVC</label>
                  <input
                    type="text"
                    placeholder="12/28"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2 text-xs font-mono text-white"
                    required={isOrgMode}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 purple-gradient-btn text-xs font-bold rounded-xl flex items-center justify-center gap-2 mt-4 shadow-xl"
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
    <Suspense fallback={<div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-white text-xs">Loading onboarding...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
