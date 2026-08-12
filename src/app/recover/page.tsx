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

      // 2. Generate fresh new permanent OpenPGP keypair with new Master Password
      const freshKeys = await generateKeyPair(email, newPassword);

      // 3. Complete recovery via API
      await api.post('/account-recovery/complete', {
        userId,
        requestId,
        tokenId,
        newPublicKey: freshKeys.publicKey,
        newEncryptedPrivateKey: freshKeys.privateKey,
      });

      setCompleted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to complete account recovery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1724] text-white flex items-center justify-center p-6 font-sora select-none">
      <div className="w-full max-w-lg glass-panel p-8 rounded-3xl border border-[rgba(31,187,210,0.3)] shadow-2xl bg-[#17283b]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white p-1 border border-[#cbd5e1] flex items-center justify-center shadow-lg">
            <img src="/logo.png" alt="Clickrypt Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Clic<span className="text-[#f39c12]">K</span>rypt Recovery</h1>
            <p className="text-xs text-gray-400">Zero-Knowledge Escrow Key Recovery</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {completed ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-bold text-white mb-2">Account Restored Successfully!</h2>
            <p className="text-xs text-gray-300 mb-6">
              Your OpenPGP private key has been re-encrypted under your new Master Password. You can now log in.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] text-[#0d1724] font-extrabold rounded-xl hover:opacity-90 transition-all shadow-lg text-sm"
            >
              <span>Proceed to Login</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : step === 'request' ? (
          <form onSubmit={handleStartRecovery} className="space-y-5">
            <p className="text-xs text-gray-300 leading-relaxed">
              If you have lost your Master Password or device, enter your account email. A temporary OpenPGP recovery keypair will be generated locally in your browser to request administrator approval.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-2">Account Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.morgan@company.com"
                className="w-full px-4 py-3 bg-[#0d1724] border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#1fbbd2]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] text-[#0d1724] font-extrabold rounded-xl hover:opacity-90 transition-all shadow-lg text-sm flex items-center justify-center gap-2"
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
              <Link href="/login" className="text-xs text-gray-400 hover:text-white transition-colors">
                Back to Login
              </Link>
            </div>
          </form>
        ) : step === 'pending' ? (
          <div className="space-y-6 text-center py-4">
            <ShieldAlert className="w-12 h-12 text-[#f39c12] mx-auto animate-pulse" />
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Request Pending Admin Approval</h2>
              <p className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
                Your recovery request has been submitted. An administrator must review and approve your request using the Organization Recovery Key.
              </p>
            </div>

            <div className="p-4 bg-[#0d1724] rounded-2xl border border-gray-700/60 text-left text-xs space-y-1.5">
              <div className="text-gray-400">Request ID: <span className="font-mono text-white">{requestId || 'Pending'}</span></div>
              <div className="text-gray-400">Target User: <span className="text-white">{email}</span></div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handlePollStatus}
                disabled={loading}
                className="flex-1 py-3 bg-[#17283b] hover:bg-[#1e2638] border border-[#1fbbd2]/40 rounded-xl text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Check Approval Status</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCompleteRecovery} className="space-y-5">
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Request Approved! Choose a new Master Password below.</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-2">New Master Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0d1724] border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#1fbbd2]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength bar */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordRules.score >= 85
                          ? 'bg-emerald-400'
                          : passwordRules.score >= 65
                          ? 'bg-[#1fbbd2]'
                          : passwordRules.score >= 40
                          ? 'bg-[#f39c12]'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${passwordRules.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Strength: {passwordRules.tier}</span>
                    <span>{passwordRules.score}%</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-2">Confirm New Master Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#0d1724] border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#1fbbd2]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] text-[#0d1724] font-extrabold rounded-xl hover:opacity-90 transition-all shadow-lg text-sm flex items-center justify-center gap-2"
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
