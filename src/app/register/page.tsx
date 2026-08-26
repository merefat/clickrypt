'use client';

import React, { useState, useEffect, useId, Suspense } from 'react';
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
import {
  ENABLE_PAY_BILL,
  isAllowedOrgEmailDomain,
  matchesOrganizationDomain,
  normalizeOrganizationDomain,
} from '@/lib/config';

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
  const formId = 'reg-form';
  const [errorMsg, setErrorMsg] = useState('');
  const [isConflict, setIsConflict] = useState(false);
  const [organizationDomain, setOrganizationDomain] = useState('');

  const [paymentDone, setPaymentDone] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const selectedMode = mode === 'organization' ? 'organization' : 'personal';
      localStorage.setItem('clickrypt_app_mode', selectedMode);
      const paidFlag = sessionStorage.getItem('clickrypt_org_paid');
      if (searchParams.get('paid') === '1' || paidFlag === '1') {
        setPaymentDone(true);
        sessionStorage.removeItem('clickrypt_org_paid');
      }
    }
    if (invitedEmail) {
      setEmail(invitedEmail);
      setIsInvited(true);
    }
  }, [invitedEmail, mode, searchParams]);

  const strength = evaluatePasswordStrength(password);

  const handleAutoGenerate = () => {
    const generated = generatePassword({ type: 'password', length: 16 });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (ENABLE_PAY_BILL && isOrgMode && !paymentDone) {
      return;
    }

    if (isOrgMode && !isInvited) {
      const normalized = normalizeOrganizationDomain(organizationDomain);
      if (!normalized) {
        setErrorMsg('Organization domain is required.');
        return;
      }
      if (!isAllowedOrgEmailDomain(email)) {
        setErrorMsg('Consumer email providers cannot be used for organization accounts.');
        return;
      }
      if (!matchesOrganizationDomain(email, normalized)) {
        setErrorMsg('Your email domain must exactly match the organization domain.');
        return;
      }
    }

    if (!isOrgMode && !isExternalShare && isAllowedOrgEmailDomain(email)) {
      setErrorMsg('Personal accounts require a consumer email address. Use a personal email or choose Organization.');
      return;
    }

    setErrorMsg('');
    setIsConflict(false);
    setLoading(true);

    try {
      const assignedRole = isExternalShare ? 'External' : (invitedRole as any) || 'User';
      const res = await register(
        fullName || 'Guest User',
        email,
        password,
        assignedRole,
        isInvited ? undefined : organizationDomain
      );

      if (res.requiresVerification) {
        router.push(`/verify-organization?email=${encodeURIComponent(res.email || email)}`);
        return;
      }

      if (externalShareId) {
        try {
          await api.post('/auth/claim-external-share', { email, externalShareId });
        } catch (e) {}
      }
      if (assignedRole === 'External') {
        router.push('/shared');
      } else {
        router.push('/vault');
      }
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.error || 'Registration failed';
      const status = err?.status || err?.response?.status;
      setErrorMsg(msg);
      setIsConflict(status === 409 || msg.toLowerCase().includes('already exists'));
      if (status !== 409) {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePayBill = () => {
    const search = new URLSearchParams();
    search.set('flow', 'enroll');
    router.push(`/checkout?${search.toString()}`);
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

          {ENABLE_PAY_BILL && isOrgMode && (
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
            {ENABLE_PAY_BILL && isOrgMode ? 'Organization Setup & Credit Card Enrollment' : 'Complete Profile Setup'}
          </h1>
          <p className="text-xs text-[#64748b] font-medium">
            {ENABLE_PAY_BILL && isOrgMode
              ? 'Complete Stripe credit card payment to enroll and activate your team vault.'
              : 'Set up your master password and OpenPGP key pair.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4 text-xs font-sora">
          {/* Hidden decoy inputs to trick browser autofill */}
          <input type="text" className="hidden" name={`decoy-user-${formId}`} tabIndex={-1} readOnly autoComplete="off" />
          <input type="password" className="hidden" name={`decoy-pass-${formId}`} tabIndex={-1} readOnly autoComplete="off" />

          {ENABLE_PAY_BILL && isOrgMode && !paymentDone ? (
            <div className="glass-panel p-6 rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] space-y-4 shadow-xs text-center">
              <div className="inline-flex items-center gap-2 text-[#d97706]">
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-extrabold uppercase tracking-wider">Stripe Payment Gate</span>
              </div>
              <p className="text-[#64748b] text-xs leading-relaxed">
                Organization accounts require a paid subscription. Pay the bill on the secure checkout page, then return here to create your profile.
              </p>
              <button
                type="button"
                onClick={handlePayBill}
                className="w-full py-3.5 gold-cyan-gradient-btn text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-all cursor-pointer"
              >
                <span>Pay Bill</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs leading-relaxed space-y-2">
                  <p className="font-bold">{errorMsg}</p>
                  {isConflict && (
                    <Link
                      href={`/login?email=${encodeURIComponent(email)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0f172a] text-white rounded-lg font-extrabold hover:bg-[#1fbbd2] transition-colors"
                    >
                      <span>Sign In instead</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name={`fullname-${formId}`}
                    placeholder=""
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
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
                    name={`email-${formId}`}
                    placeholder=""
                    value={email}
                    readOnly={isInvited}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
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

              {isOrgMode && !isInvited && (
                <div>
                  <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
                    Organization Domain
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      name={`org-domain-${formId}`}
                      placeholder="acme.com"
                      value={organizationDomain}
                      onChange={(e) => setOrganizationDomain(e.target.value)}
                      autoComplete="off"
                      data-lpignore="true"
                      className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0f172a] font-bold outline-none shadow-xs transition-all focus:border-[#1fbbd2]"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-1">
                    Your email must exactly match this domain.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider">
                  Master Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name={`password-${formId}`}
                    placeholder="Enter a strong master password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    data-lpignore="true"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 gold-cyan-gradient-btn text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-2 mt-4 shadow-md hover:opacity-95 transition-all cursor-pointer"
              >
                <span>
                  {loading
                    ? 'Generating PGP Keys...'
                    : isOrgMode
                    ? 'Create Organization Account'
                    : 'Save & Complete Setup'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
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
