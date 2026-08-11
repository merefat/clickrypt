'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Settings,
  User,
  Shield,
  Key,
  Download,
  Bell,
  Monitor,
  CheckCircle,
  Lock,
  LogOut,
  Upload
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || 'Alex Rodriguez');
  const [email, setEmail] = useState(user?.email || 'alex.rodriguez@myworkplace.com');
  const [alerts, setAlerts] = useState(true);
  const [activity, setActivity] = useState(true);
  const [updates, setUpdates] = useState(true);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Profile settings saved successfully!');
  };

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto max-w-5xl">
          {/* Header Title */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                <Settings className="w-8 h-8 text-purple-400" />
                Profile Settings
              </h1>
              <p className="text-xs text-gray-400">Manage your personal information, security, and preferences.</p>
            </div>
            <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-3 py-1 rounded-full font-semibold">
              👑 Owner
            </span>
          </div>

          <div className="space-y-6">
            {/* Card 1: Personal Information (Screenshot hatty.jpg) */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
                <User className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Personal Information</h2>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-6 mb-4">
                  <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xl text-white shadow-lg">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-[#1e2638] hover:bg-gray-700 text-xs font-semibold text-white rounded-lg border border-gray-700 flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Avatar
                    </button>
                    <p className="text-[10px] text-gray-500 mt-1">JPG, PNG or GIF. Max 2MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="purple-gradient-btn px-4 py-2 rounded-lg text-xs font-bold">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>

            {/* Card 2: Security Settings (Screenshot hatty.jpg) */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
                <Shield className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Security</h2>
              </div>

              {/* Change Password */}
              <div className="flex items-center justify-between py-2 border-b border-gray-800/60">
                <div>
                  <p className="text-xs font-bold text-white">Change Password</p>
                  <p className="text-[11px] text-gray-400">Ensure your password is strong and unique.</p>
                  <div className="w-48 bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div className="bg-purple-500 h-full w-[85%]" />
                  </div>
                </div>
                <button className="px-3 py-1.5 bg-purple-950 text-purple-300 border border-purple-800 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Change Password
                </button>
              </div>

              {/* Passkey */}
              <div className="flex items-center justify-between py-2 border-b border-gray-800/60">
                <div>
                  <p className="text-xs font-bold text-white">Passkey</p>
                  <p className="text-[11px] text-gray-400">Use a passkey for passwordless and phishing-resistant sign-in.</p>
                </div>
                <button className="px-3 py-1.5 bg-[#1e2638] border border-gray-700 text-white rounded-lg text-xs font-semibold">
                  Manage Passkeys
                </button>
              </div>

              {/* Two-Factor Authentication */}
              <div className="flex items-center justify-between py-2 border-b border-gray-800/60">
                <div>
                  <p className="text-xs font-bold text-white">Two-Factor Authentication</p>
                  <p className="text-[11px] text-gray-400">Add an extra layer of security to your account.</p>
                </div>
                <span className="flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-semibold">
                  <CheckCircle className="w-3.5 h-3.5" /> Enabled
                </span>
              </div>

              {/* Backup Key */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-bold text-white">Backup Key</p>
                  <p className="text-[11px] text-gray-400">Download your backup key to recover access to your account.</p>
                </div>
                <button className="purple-gradient-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download Backup Key
                </button>
              </div>
            </div>

            {/* Card 3: Notification Preferences (Screenshot hatty.jpg) */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
                <Bell className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Notification Preferences</h2>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-bold text-white">Security Alerts</p>
                  <p className="text-[11px] text-gray-400">Important alerts about your account and security.</p>
                </div>
                <input
                  type="checkbox"
                  checked={alerts}
                  onChange={(e) => setAlerts(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-bold text-white">Account Activity</p>
                  <p className="text-[11px] text-gray-400">Notifications about sign-ins and account changes.</p>
                </div>
                <input
                  type="checkbox"
                  checked={activity}
                  onChange={(e) => setActivity(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Card 4: Session Management (Screenshot hatty.jpg) */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
                <Monitor className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Session Management</h2>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 glow-green" />
                  <div>
                    <p className="text-xs font-bold text-white">Current Session (Active)</p>
                    <p className="text-[11px] text-gray-400">Signed in on Chrome • Windows • 2 minutes ago</p>
                  </div>
                </div>
                <button className="px-3 py-1.5 bg-rose-950 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <LogOut className="w-3.5 h-3.5" /> Sign Out All Other Sessions
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
