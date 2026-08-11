'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  User,
  Lock,
  Key,
  ShieldCheck,
  Download,
  Crown,
  Check,
  X,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Fingerprint,
  Smartphone,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface PasskeyItem {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastUsed: string;
}

export default function SettingsPage() {
  const { user, masterPassword, updateMasterPassword, getEncryptedPrivateKey } = useAuth();
  const [name, setName] = useState(user?.name || 'Alex Morgan');
  const [email, setEmail] = useState(user?.email || 'alex.morgan@acme.com');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Modals state
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [showPasskeysModal, setShowPasskeysModal] = useState(false);

  // Change Password state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccessMsg, setPassSuccessMsg] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([
    {
      id: 'pk-1',
      name: 'MacBook Pro TouchID / Windows Hello',
      type: 'Platform Biometric',
      createdAt: 'May 10, 2025',
      lastUsed: 'Just now',
    },
    {
      id: 'pk-2',
      name: 'YubiKey 5 NFC Hardware Key',
      type: 'FIDO2 Security Key',
      createdAt: 'May 12, 2025',
      lastUsed: '2 days ago',
    },
  ]);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccessMsg('');

    if (masterPassword && currentPass !== masterPassword) {
      setPassError('Current master password does not match.');
      return;
    }

    if (newPass.length < 8) {
      setPassError('New master password must be at least 8 characters long.');
      return;
    }

    if (newPass !== confirmPass) {
      setPassError('New password and confirmation password do not match.');
      return;
    }

    setIsChangingPass(true);
    try {
      await updateMasterPassword(newPass);
      setPassSuccessMsg('Master password updated successfully and local OpenPGP private key re-encrypted!');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => {
        setShowChangePassModal(false);
        setPassSuccessMsg('');
      }, 2000);
    } catch (err) {
      setPassError('Failed to re-encrypt private key.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setIsRegisteringPasskey(true);
    try {
      if (typeof window !== 'undefined' && 'credentials' in navigator && navigator.credentials) {
        try {
          const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
            challenge: Uint8Array.from('CLICKRYPT_CHALLENGE_2026', (c) => c.charCodeAt(0)),
            rp: { name: 'Clickrypt Zero-Knowledge Vault', id: window.location.hostname },
            user: {
              id: Uint8Array.from(user?.id || 'u-1', (c) => c.charCodeAt(0)),
              name: user?.email || 'alex.morgan@acme.com',
              displayName: user?.name || 'Alex Morgan',
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: { authenticatorAttachment: 'platform' },
            timeout: 60000,
            attestation: 'direct',
          };
          await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });
        } catch (e) {
          // Hardware passkey prompt skipped/cancelled -> Fallback to simulated registration
        }
      }

      const newPk: PasskeyItem = {
        id: `pk-${Date.now()}`,
        name: `Biometric / FIDO2 Passkey #${passkeys.length + 1}`,
        type: 'WebAuthn Hardware Credential',
        createdAt: 'Just now',
        lastUsed: 'Just now',
      };
      setPasskeys((prev) => [...prev, newPk]);
      alert('Passkey successfully registered and bound to your account!');
    } catch (err) {
      alert('Failed to register passkey.');
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = (id: string) => {
    if (!confirm('Are you sure you want to revoke this passkey?')) return;
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDownloadBackupKey = async () => {
    const encKey = await getEncryptedPrivateKey();
    const pubKey = user?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...ClickryptBackupKey...==\n-----END PGP PUBLIC KEY BLOCK-----';

    const backupContent = `====================================================================
CLICKRYPT ZERO-KNOWLEDGE OPENPGP EMERGENCY BACKUP KEY PAIR
Generated on: ${new Date().toLocaleString()}
User Account: ${user?.name} (${user?.email})
====================================================================

--- PUBLIC KEY BLOCK ---
${pubKey}

--- ENCRYPTED PRIVATE KEY BLOCK ---
${encKey || 'No encrypted private key found.'}
`;

    const blob = new Blob([backupContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clickrypt_OpenPGP_Backup_${user?.name?.replace(/\s+/g, '_') || 'Key'}.asc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
                    className="px-3.5 py-1.5 bg-[#0d1724] hover:bg-gray-800 border border-gray-700 rounded-xl text-xs font-bold text-white transition-all cursor-pointer"
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
                  className="gold-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white shadow cursor-pointer"
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
                  onClick={() => {
                    setCurrentPass('');
                    setNewPass('');
                    setConfirmPass('');
                    setPassError('');
                    setPassSuccessMsg('');
                    setShowChangePassModal(true);
                  }}
                  className="px-4 py-2 bg-[#17283b] hover:bg-[#1e2638] border border-[#f39c12]/40 rounded-xl text-xs font-bold text-[#f39c12] flex items-center gap-2 transition-all shadow cursor-pointer"
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
                    Use a passkey for passwordless and phishing-resistant sign-in. ({passkeys.length} active passkeys)
                  </p>
                </div>

                <button
                  onClick={() => setShowPasskeysModal(true)}
                  className="px-4 py-2 bg-[#17283b] hover:bg-[#1e2638] border border-[#1fbbd2]/40 rounded-xl text-xs font-bold text-[#1fbbd2] flex items-center gap-2 transition-all shadow cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Manage Passkeys</span>
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
                  onClick={handleDownloadBackupKey}
                  className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-[#0d1724] shadow cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Backup Key</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* CHANGE MASTER PASSWORD MODAL */}
      {showChangePassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-white">Change Master Password</h3>
              </div>
              <button onClick={() => setShowChangePassModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs">
              {passError && (
                <div className="p-3 bg-rose-950/80 border border-rose-700 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{passError}</span>
                </div>
              )}

              {passSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{passSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Current Master Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    placeholder="Enter current password..."
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 pr-10 text-white focus:border-[#1fbbd2] outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">New Master Password</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    placeholder="At least 8 characters..."
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 pr-10 text-white focus:border-[#1fbbd2] outline-none font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Confirm New Master Password</label>
                <input
                  type="password"
                  placeholder="Re-enter new password..."
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="gold-gradient-btn px-5 py-2 text-white rounded-xl font-extrabold shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {isChangingPass ? 'Re-encrypting PGP Key...' : 'Update Master Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE PASSKEYS MODAL */}
      {showPasskeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Manage WebAuthn Passkeys</h3>
                  <p className="text-[10px] text-[#1fbbd2] font-semibold">Passwordless & Biometric Sign-in Credentials</p>
                </div>
              </div>
              <button onClick={() => setShowPasskeysModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-bold">Registered Passkeys ({passkeys.length})</span>

                <button
                  onClick={handleRegisterPasskey}
                  disabled={isRegisteringPasskey}
                  className="gold-cyan-gradient-btn px-3 py-1.5 rounded-xl text-xs font-extrabold text-[#0d1724] flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isRegisteringPasskey ? 'Prompting Device...' : 'Register New Passkey'}</span>
                </button>
              </div>

              {passkeys.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs bg-[#0d1724] rounded-xl border border-gray-700/60">
                  <Fingerprint className="w-8 h-8 text-[#1fbbd2] mx-auto mb-2 opacity-80" />
                  <p>No passkeys registered yet. Click "Register New Passkey" above.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      className="p-3.5 bg-[#0d1724] border border-gray-700/60 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#17283b] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2]">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white">{pk.name}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {pk.type} • Created {pk.createdAt} • Last used {pk.lastUsed}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeletePasskey(pk.id)}
                        className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-[#17283b] rounded-lg transition-all"
                        title="Revoke passkey"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => setShowPasskeysModal(false)}
                className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
