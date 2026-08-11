'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { User, Lock, Key, ShieldCheck, Download, Crown, Check, Smartphone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || 'Alex Morgan');
  const [email, setEmail] = useState(user?.email || 'alex.morgan@acme.com');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-white">Profile Settings</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Manage your personal information, security, and preferences.
              </p>
            </div>

            {/* Gold Owner Crown Badge (0% Purple) */}
            <div className="flex items-center gap-1.5 bg-[#17283b] border border-[#f39c12]/50 px-3 py-1.5 rounded-full text-xs text-[#f39c12] font-bold shadow">
              <Crown className="w-4 h-4 text-[#f39c12]" />
              <span>Owner</span>
            </div>
          </div>

          {/* Personal Information Card */}
          <div className="glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-6">
            <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-gray-700 pb-3">
              <User className="w-4 h-4 text-[#1fbbd2]" />
              <span>Personal Information</span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="flex items-center gap-4">
                {/* Gold-Cyan Avatar (0% Purple) */}
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold text-lg shadow-lg">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 bg-[#0d1724] hover:bg-gray-800 border border-gray-700 rounded-xl text-xs font-bold text-white transition-all"
                  >
                    Upload Avatar
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1">JPG, PNG or GIF. Max 2MB</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1fbbd2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1fbbd2]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {savedSuccess && (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1 self-center">
                    <Check className="w-4 h-4" /> Saved!
                  </span>
                )}
                <button
                  type="submit"
                  className="gold-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          {/* Security Options Card */}
          <div className="glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-6">
            <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-gray-700 pb-3">
              <ShieldCheck className="w-4 h-4 text-[#f39c12]" />
              <span>Security</span>
            </div>

            <div className="space-y-6">
              {/* Change Password section */}
              <div className="flex items-center justify-between p-4 bg-[#0d1724] rounded-xl border border-gray-700">
                <div>
                  <h4 className="text-xs font-bold text-white">Change Master Password</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Ensure your master password is strong and unique. Re-encrypts your local PGP private key.
                  </p>
                  {/* Cyan Strength Bar (0% Purple) */}
                  <div className="w-36 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-2">
                    <div className="w-4/5 h-full bg-[#1fbbd2] glow-cyan" />
                  </div>
                </div>

                <button
                  onClick={() => alert('Change password modal')}
                  className="px-4 py-2 bg-[#17283b] hover:bg-[#1e2638] border border-[#f39c12]/40 rounded-xl text-xs font-bold text-[#f39c12] flex items-center gap-2 transition-all shadow"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Change Password</span>
                </button>
              </div>

              {/* Passkey section */}
              <div className="flex items-center justify-between p-4 bg-[#0d1724] rounded-xl border border-gray-700">
                <div>
                  <h4 className="text-xs font-bold text-white">Passkey</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Use a passkey for passwordless and phishing-resistant sign-in.
                  </p>
                </div>

                <button className="px-4 py-2 bg-[#17283b] hover:bg-[#1e2638] border border-gray-700 rounded-xl text-xs font-bold text-gray-300 transition-all">
                  Manage Passkeys
                </button>
              </div>

              {/* Two-Factor Authentication section */}
              <div className="flex items-center justify-between p-4 bg-[#0d1724] rounded-xl border border-gray-700">
                <div>
                  <h4 className="text-xs font-bold text-white">Two-Factor Authentication</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Add an extra layer of security to your account.
                  </p>
                </div>

                <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Enabled
                </span>
              </div>

              {/* Backup Key section */}
              <div className="flex items-center justify-between p-4 bg-[#0d1724] rounded-xl border border-gray-700">
                <div>
                  <h4 className="text-xs font-bold text-white">OpenPGP Backup Key</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Download your OpenPGP emergency backup key pair to recover access to your account.
                  </p>
                </div>

                <button
                  onClick={() => alert('Downloading OpenPGP emergency key backup...')}
                  className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-[#0d1724] shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Backup Key</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
