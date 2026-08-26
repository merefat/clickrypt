'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { KeyRound, ShieldAlert, CheckCircle2, ArrowRight, RefreshCw, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { generateKeyPair, decryptSecret, encryptSecret, evaluatePasswordStrength } from '@/lib/crypto';
import api from '@/lib/api';

export default function AccountRecoveryPage() {
  const [step, setStep] = useState<'request' | 'pending' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Generated Temp Keypair
  const [tempKeys, setTempKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [requestId, setRequestId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [userId, setUserId] = useState('');

  // Reset phase
  const [reEncryptedKeyPayload, setReEncryptedKeyPayload] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [completed, setCompleted] = useState(false);

  const passwordRules = evaluatePasswordStrength(newPassword);

  const handleStartRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Generate temp OpenPGP keypair client-side
      const generated = await generateKeyPair(email, 'temp_recovery_pass');
      setTempKeys(generated);

      // 2. Submit recovery request
      const res = await api.post('/account-recovery/requests', {
        email,
        armoredKey: generated.publicKey,
      });

      if (res.data.requestId) {
        setRequestId(res.data.requestId);
        setTokenId(res.data.tokenId);
        setUserId(res.data.userId);
        setStep('pending');
      } else {
        setStep('pending');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate recovery request');
    } finally {
      setLoading(false);
    }
  };

  const handlePollStatus = async () => {
    if (!requestId || !userId || !tokenId) return;
    setLoading(true);
    setError('');

    try {
      const res = await api.get(`/account-recovery/requests/${requestId}/${userId}/${tokenId}`);
      if (res.data.status === 'approved' && res.data.data) {
        setReEncryptedKeyPayload(res.data.data);
        setStep('reset');
      } else if (res.data.status === 'rejected') {
        setError('Your recovery request was rejected by an administrator.');
      } else {
        alert('Status: Pending Admin Review. Please wait for an administrator to review your request.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error checking recovery request status');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (passwordRules.score < 40) {
      setError('Please choose a stronger password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Decrypt escrowed private key using local temp key
      const recoveredPrivateKey = await decryptSecret(reEncryptedKeyPayload, tempKeys!.privateKey, 'temp_recovery_pass');

      // 2. Re-encrypt private key under user's NEW master password
      const { privateKey: newEncryptedPrivateKey } = await generateKeyPair(email, newPassword);

      // 3. Complete recovery via API
      await api.post('/account-recovery/complete', {
        requestId,
        userId,
        tokenId,
        newEncryptedPrivateKey,
      });

      setCompleted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error completing account recovery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dfe6ed] text-[#0f172a] flex items-center justify-center p-6 font-sora select-none">
      <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-3xl border border-[#d0dbe5] shadow-2xl bg-[#ffffff]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white p-1 border border-[#cbd5e1] flex items-center justify-center shadow-xs">
            <img src="/logo.png" alt="Clickrypt Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#0f172a]">Clic<span className="text-[#f39c12]">K</span>rypt Recovery</h1>
            <p className="text-xs text-[#64748b] font-medium">Zero-Knowledge Escrow Key Recovery</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-extrabold">{error}</span>
          </div>
        )}

        {completed ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-extrabold text-[#0f172a] mb-2">Account Restored Successfully!</h2>
            <p className="text-xs text-[#64748b] mb-6 font-medium">
              Your OpenPGP private key has been re-encrypted under your new Master Password. You can now log in.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 gold-cyan-gradient-btn text-white font-extrabold rounded-xl hover:opacity-95 transition-all shadow-md text-sm cursor-pointer"
            >
              <span>Proceed to Login</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : step === 'request' ? (
          <form onSubmit={handleStartRecovery} className="space-y-5">
            <p className="text-xs text-[#64748b] leading-relaxed font-medium">
              If you have lost your Master Password or device, enter your account email. A temporary OpenPGP recovery keypair will be generated locally in your browser to request administrator approval.
            </p>

            <div>
              <label className="block text-xs font-extrabold text-[#334155] mb-2">Account Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.morgan@company.com"
                className="w-full px-4 py-3 bg-[#ffffff] border border-[#cbd5e1] rounded-xl text-[#0f172a] text-sm font-bold focus:outline-none focus:border-[#1fbbd2] shadow-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 gold-cyan-gradient-btn text-white font-extrabold rounded-xl hover:opacity-95 transition-all shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating Temp Keypair...</span>
                </>
              ) : (
                <>
                  <span>Submit Recovery Request</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="text-xs text-[#64748b] hover:text-[#0f172a] font-extrabold transition-colors">
                Back to Login
              </Link>
            </div>
          </form>
        ) : step === 'pending' ? (
          <div className="space-y-6 text-center py-4">
            <ShieldAlert className="w-12 h-12 text-[#d97706] mx-auto animate-pulse" />
            <div>
              <h2 className="text-lg font-extrabold text-[#0f172a] mb-1">Request Pending Admin Approval</h2>
              <p className="text-xs text-[#64748b] leading-relaxed max-w-sm mx-auto font-medium">
                Your recovery request has been submitted. An administrator must review and approve your request using the Organization Recovery Key.
              </p>
            </div>

            <div className="p-4 bg-[#f8fafc] rounded-2xl border border-[#cbd5e1] text-left text-xs space-y-1.5 shadow-xs">
              <div className="text-[#64748b] font-medium">Request ID: <span className="font-mono text-[#0f172a] font-bold">{requestId || 'Pending'}</span></div>
              <div className="text-[#64748b] font-medium">Target User: <span className="text-[#0f172a] font-bold">{email}</span></div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handlePollStatus}
                disabled={loading}
                className="flex-1 py-3 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-[#0284c7] text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Check Approval Status</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCompleteRecovery} className="space-y-5">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-extrabold">Request Approved! Choose a new Master Password below.</span>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-[#334155] mb-2">New Master Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#ffffff] border border-[#cbd5e1] rounded-xl text-[#0f172a] text-sm font-mono font-bold focus:outline-none focus:border-[#1fbbd2] shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#64748b] hover:text-[#0f172a]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength bar */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-[#e2e8f0] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordRules.score >= 85
                          ? 'bg-emerald-500'
                          : passwordRules.score >= 65
                          ? 'bg-[#1fbbd2]'
                          : passwordRules.score >= 40
                          ? 'bg-[#f39c12]'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${passwordRules.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#64748b] font-extrabold">
                    <span>Strength: {passwordRules.tier}</span>
                    <span>{passwordRules.score}%</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-extrabold text-[#334155] mb-2">Confirm New Master Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#ffffff] border border-[#cbd5e1] rounded-xl text-[#0f172a] text-sm font-mono font-bold focus:outline-none focus:border-[#1fbbd2] shadow-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 gold-cyan-gradient-btn text-white font-extrabold rounded-xl hover:opacity-95 transition-all shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Re-Encrypting Account Keys...</span>
                </>
              ) : (
                <>
                  <span>Complete Recovery & Reset Password</span>
                  <Lock className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
