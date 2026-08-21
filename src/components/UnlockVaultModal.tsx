/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, Loader2 } from 'lucide-react';

interface UnlockVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<boolean>;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export default function UnlockVaultModal({ isOpen, onClose, onSubmit, title, description, confirmLabel }: UnlockVaultModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ok = await onSubmit(password);
      if (ok) {
        setPassword('');
        onClose();
      } else {
        setError('Incorrect master password.');
      }
    } catch {
      setError('Could not unlock the vault. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#d0dbe5] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e0f2fe] flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#0284c7]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#0f172a]">{title || 'Unlock Vault'}</h2>
              <p className="text-[11px] text-[#64748b]">{description || 'Enter your master password to decrypt this vault.'}</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-[#64748b] hover:text-[#0f172a] focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-[#334155] mb-1.5">Master Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your master password"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cbd5e1] text-xs font-extrabold text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1fbbd2]/50 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#cbd5e1] text-xs font-extrabold text-[#334155] hover:bg-[#f1f5f9] focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#0284c7] text-white text-xs font-extrabold hover:bg-[#0369a1] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmLabel || 'Unlock & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
