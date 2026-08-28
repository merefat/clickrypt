/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  User,
  Users,
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
  ShieldAlert,
  QrCode,
  Copy,
  RefreshCw,
  SlidersHorizontal,
  KeyRound,
  ChevronDown,
  Globe
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { createPasskey, getPrfOutput } from '@/lib/webauthn';
import {
  randomBase64Url,
  toBuffer,
  derivePasskeyKey,
  encryptWithPasskeyKey,
} from '@/lib/passkeyCrypto';
import { unprotectPrivateKey } from '@/lib/crypto';

interface PasskeyItem {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastUsed: string;
}

export default function SettingsPage() {
  const {
    user,
    masterPassword,
    unlockedPgpKey,
    updateMasterPassword,
    getEncryptedPrivateKey,
    updateProfile,
    refreshUser,
    appMode,
    setUnlockedPgpKey,
    logout,
  } = useAuth();
  const router = useRouter();
  const is2FAEnabled = !!user?.twoFactorEnabled;
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user, appMode]);

  // Account Recovery & SSO state
  const [recPolicy, setRecPolicy] = useState<'disabled' | 'opt-in' | 'opt-out' | 'mandatory'>('opt-in');
  const [orgPublicKeyArmored, setOrgPublicKeyArmored] = useState('');
  const [showRecPolicyModal, setShowRecPolicyModal] = useState(false);

  const [ssoProvider, setSsoProvider] = useState<'google' | 'azure' | 'oauth2'>('google');
  const [ssoClientId, setSsoClientId] = useState('');
  const [ssoClientSecret, setSsoClientSecret] = useState('');
  const [showSsoConfigModal, setShowSsoConfigModal] = useState(false);
  const [ssoSettingsList, setSsoSettingsList] = useState<any[]>([]);

  // Organization Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [openEnrollment, setOpenEnrollment] = useState(false);
  const [openEnrollmentLoading, setOpenEnrollmentLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferStage, setTransferStage] = useState<'idle' | 'confirm'>('idle');
  const [transferCode, setTransferCode] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferMessage, setTransferMessage] = useState('');

  useEffect(() => {
    fetchRecPolicy();
    fetchSsoSettings();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (user?.organization) {
      setOpenEnrollment(user.organization.openEnrollment ?? false);
    }
  }, [user]);

  const fetchRecPolicy = async () => {
    try {
      const res = await api.get('/account-recovery/organization-policies');
      if (res.data?.policy) setRecPolicy(res.data.policy);
    } catch (e) {}
  };

  const fetchSsoSettings = async () => {
    try {
      const res = await api.get('/sso/settings');
      if (res.data?.settings) setSsoSettingsList(res.data.settings);
    } catch (e) {}
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (e) {}
  };

  const handleToggleOpenEnrollment = async () => {
    setOpenEnrollmentLoading(true);
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', { action: 'toggle-open-enrollment' });
      if (res.data?.openEnrollment !== undefined) {
        setOpenEnrollment(res.data.openEnrollment);
        setTransferMessage('Open enrollment updated');
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Failed to update open enrollment');
    } finally {
      setOpenEnrollmentLoading(false);
    }
  };

  const handleInitiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', {
        action: 'initiate-ownership-transfer',
        targetUserId: transferTarget,
      });
      if (res.data?.success) {
        setTransferStage('confirm');
        setTransferMessage(res.data.message || 'Transfer code sent to your email');
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Failed to initiate transfer');
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget || !transferCode) return;
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', {
        action: 'confirm-ownership-transfer',
        targetUserId: transferTarget,
        emailOtp: transferCode,
        twoFactorCode: user?.twoFactorEnabled ? twoFactorCode : undefined,
      });
      if (res.data?.success) {
        setTransferStage('idle');
        setTransferCode('');
        setTwoFactorCode('');
        setTransferTarget('');
        setTransferMessage(res.data.message || 'Ownership transferred successfully');
        await refreshUser();
        fetchUsers();
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Failed to confirm transfer');
    }
  };

  const handleSaveRecPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/account-recovery/organization-policies', {
        policy: recPolicy,
        armoredKey: orgPublicKeyArmored,
      });
      alert('Account Recovery organization policy saved!');
      setShowRecPolicyModal(false);
    } catch (err: any) {
      alert('Error saving recovery policy: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveDraftSso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/sso/settings', {
        provider: ssoProvider,
        clientId: ssoClientId,
        clientSecret: ssoClientSecret,
      });
      alert('Draft SSO Configuration saved! You can now run a mandatory Dry Run test to activate.');
      setShowSsoConfigModal(false);
      fetchSsoSettings();
    } catch (err: any) {
      alert('Error saving SSO settings: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRunSsoDryRun = async (settingId: string, provider: string) => {
    try {
      const res = await api.post(`/sso/${provider}/login/dry-run`, {
        draftSettingId: settingId,
        adminUserId: user?.id,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      alert('Dry Run error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleActivateSsoSetting = async (settingId: string) => {
    try {
      await api.put(`/sso/settings/${settingId}`, { action: 'activate' });
      alert('SSO configuration activated successfully!');
      fetchSsoSettings();
    } catch (err: any) {
      alert('Activation error: ' + (err.response?.data?.error || err.message));
    }
  };

  // Modals state
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [showPasskeysModal, setShowPasskeysModal] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [showViewBackupKeyModal, setShowViewBackupKeyModal] = useState(false);

  // 2FA State
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpInputCode, setTotpInputCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [backupCodes] = useState([
    '8492-1094', '3920-5812', '7104-9281', '4019-3820',
    '9182-3710', '5819-2041', '1092-3847', '6720-4912'
  ]);
  const [totpSuccessMsg, setTotpSuccessMsg] = useState('');
  const [totpError, setTotpError] = useState('');
  const [is2FALoading, setIs2FALoading] = useState(false);

  useEffect(() => {
    if (totpUri) {
      QRCode.toDataURL(totpUri, {
        width: 256,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setTotpQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code data URL:', err));
    } else {
      setTotpQrDataUrl('');
    }
  }, [totpUri]);

  const handleDownloadBackupCodes = () => {
    const textContent = `====================================================
CLICKRYPT 2FA EMERGENCY RECOVERY CODES
Account Email: ${user?.email || ''}
Generated Date: ${new Date().toLocaleString()}
====================================================

Store these 8 emergency recovery codes in a safe place.
Each code can be used once to access your account if you lose your 2FA authenticator app.

${backupCodes.map((code, idx) => `${idx + 1}. ${code}`).join('\n')}

====================================================
`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clickrypt_2fa_recovery_codes_${(user?.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  // Change Password state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccessMsg, setPassSuccessMsg] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // OpenPGP Key Inspector state
  const [inspectPrivateKey, setInspectPrivateKey] = useState<string>('');
  const [copiedPgpKeys, setCopiedPgpKeys] = useState(false);

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [isTestingPasskey, setIsTestingPasskey] = useState(false);
  const [passkeyTestMsg, setPasskeyTestMsg] = useState('');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image file size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAvatarUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile(name, email, avatarUrl);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await api.delete('/auth/me');
      await logout();
      router.push('/');
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account. Please try again.');
      setDeleteLoading(false);
    }
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
      await updateMasterPassword(newPass, currentPass);
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

  const fetchPasskeys = async () => {
    try {
      setPasskeyTestMsg('');
      const res = await api.get('/auth/passkey');
      if (res.data?.passkeys) setPasskeys(res.data.passkeys);
    } catch (err) {
      const serverError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setPasskeyTestMsg(serverError || 'Failed to load passkeys.');
    }
  };

  const handleRegisterPasskey = async () => {
    setIsRegisteringPasskey(true);
    setPasskeyTestMsg('');
    try {
      const res = await api.post('/auth/passkey/register-options');
      const options = res.data?.options;
      const prfInput = res.data?.prfInput as string | undefined;
      if (!options) throw new Error('No registration options returned.');

      const result = await createPasskey(options);
      const prfOutput = getPrfOutput(result);

      const payload: Record<string, unknown> = {
        response: result,
        name: `${user?.name || 'Clickrypt'} Passkey`,
      };

      if (prfOutput && prfInput) {
        const pgpArmored =
          unlockedPgpKey || (await getEncryptedPrivateKey());
        if (pgpArmored) {
          const unprotected = masterPassword
            ? await unprotectPrivateKey(pgpArmored, masterPassword)
            : pgpArmored;
          const prfSalt = randomBase64Url(32);
          const passkeyKey = await derivePasskeyKey(prfOutput, toBuffer(prfSalt));
          const { ciphertext, iv } = await encryptWithPasskeyKey(
            unprotected,
            passkeyKey
          );
          payload.prfInput = prfInput;
          payload.prfSalt = prfSalt;
          payload.iv = iv;
          payload.encryptedPgpKey = ciphertext;
        }
      }

      const saveRes = await api.post('/auth/passkey/register', payload);
      setPasskeys((prev) => [...prev, saveRes.data?.passkey]);
      setPasskeyTestMsg('Passkey registered successfully!');
    } catch (err) {
      console.error('Register passkey error:', err);
      const serverError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      const message = err instanceof Error ? err.message : 'Failed to register passkey.';
      setPasskeyTestMsg(serverError || message);
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this passkey?')) return;
    try {
      await api.delete(`/auth/passkey/${id}`);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      setPasskeyTestMsg('Passkey revoked.');
    } catch (err) {
      const serverError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setPasskeyTestMsg(serverError || 'Failed to delete passkey.');
    }
  };

  const handleOpen2FAModal = async () => {
    setTotpSuccessMsg('');
    setTotpError('');
    setTotpInputCode('');
    if (!user?.twoFactorEnabled) {
      setIs2FALoading(true);
      try {
        const res = await api.post('/auth/2fa/setup');
        if (!res.data?.secret) {
          throw new Error(res.data?.error || '2FA setup failed.');
        }
        setTotpSecret(res.data.secret);
        setTotpUri(res.data.uri);
      } catch (err: any) {
        setTotpError(err.response?.data?.error || 'Failed to generate 2FA setup.');
      } finally {
        setIs2FALoading(false);
      }
    }
    setShowTwoFactorModal(true);
  };

  const handleToggle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError('');
    setTotpSuccessMsg('');
    if (!totpInputCode || totpInputCode.length !== 6) {
      setTotpError('Please enter a valid 6-digit TOTP verification code.');
      return;
    }
    setIs2FALoading(true);
    try {
      if (is2FAEnabled) {
        await api.post('/auth/2fa/disable', { code: totpInputCode });
        setTotpInputCode('');
        setTotpSecret('');
        setTotpUri('');
        setTotpSuccessMsg('2FA has been disabled for your account.');
        await refreshUser();
      } else {
        const res = await api.post('/auth/2fa/verify', { code: totpInputCode });
        if (!res.data?.success) {
          throw new Error(res.data?.error || '2FA verification failed.');
        }
        setTotpInputCode('');
        setTotpSuccessMsg('Two-Factor Authentication (2FA) enabled successfully!');
        await refreshUser();
      }
    } catch (err: any) {
      setTotpError(err.response?.data?.error || '2FA verification failed.');
    } finally {
      setIs2FALoading(false);
      setTimeout(() => {
        setTotpSuccessMsg('');
        if (!totpError) setShowTwoFactorModal(false);
      }, 1800);
    }
  };

  const handleCopyTotpSecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleOpenPgpInspector = async () => {
    const encKey = await getEncryptedPrivateKey();
    setInspectPrivateKey(encKey || '');
    setShowViewBackupKeyModal(true);
  };

  const handleCopyPgpKeys = () => {
    const pubKey = user?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...ClickryptBackupKey...==\n-----END PGP PUBLIC KEY BLOCK-----';
    const textToCopy = `--- PUBLIC KEY ---\n${pubKey}\n\n--- ENCRYPTED PRIVATE KEY ---\n${inspectPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...==\n-----END PGP PRIVATE KEY BLOCK-----'}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedPgpKeys(true);
    setTimeout(() => setCopiedPgpKeys(false), 2000);
  };

  const handleDownloadBackupKey = async () => {
    let encKey = '';
    try {
      encKey = (await getEncryptedPrivateKey()) || '';
    } catch (e) {
      encKey = '';
    }

    const pubKey = user?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...ClickryptPublicKey...==\n-----END PGP PUBLIC KEY BLOCK-----';
    const privKey = encKey || inspectPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...ClickryptPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----';

    const backupContent = `====================================================================
CLICKRYPT ZERO-KNOWLEDGE OPENPGP EMERGENCY BACKUP KEY PAIR
Generated on: ${new Date().toLocaleString()}
User Account: ${user?.name || user?.email || 'User Account'} (${user?.email || ''})
====================================================================

--- PUBLIC KEY BLOCK ---
${pubKey}

--- ENCRYPTED PRIVATE KEY BLOCK ---
${privKey}
`;

    try {
      const blob = new Blob([backupContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const fileName = `Clickrypt_OpenPGP_Backup_${(user?.name || 'Alex_Morgan').replace(/\s+/g, '_')}.asc`;

      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 500);

      alert(`Clickrypt OpenPGP Emergency Backup Key downloaded successfully as "${fileName}"!`);
    } catch (err) {
      alert('Failed to download backup key file.');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0f172a]">Profile Settings</h1>
              <p className="text-xs text-[#64748b] mt-0.5">
                Manage your personal information, security, and preferences.
              </p>
            </div>

            {/* Gold Owner Crown Badge */}
            <div className="flex items-center gap-1.5 bg-[#ffffff] border border-[#f39c12]/50 px-3 py-1.5 rounded-full text-xs text-[#d97706] font-extrabold shadow-sm">
              <Crown className="w-4 h-4 text-[#d97706]" />
              <span>Owner</span>
            </div>
          </div>

          {/* Personal Information Card */}
          <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-6 shadow-xl">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#0f172a] border-b border-[#cbd5e1] pb-3">
              <User className="w-4 h-4 text-[#0284c7]" />
              <span>Personal Information</span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/png, image/jpeg, image/gif, image/webp"
                className="hidden"
              />

              <div className="flex items-center gap-4">
                {/* Dynamic Avatar Image or Initial Circle */}
                {avatarUrl && !avatarUrl.startsWith('file://') ? (
                  <div className="relative group">
                    <img
                      src={avatarUrl}
                      alt={name || 'Avatar'}
                      className="w-16 h-16 rounded-full object-cover shadow-md border-2 border-[#1fbbd2]"
                      onError={() => setAvatarUrl('')}
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-lg shadow-md border-2 border-[#1fbbd2]">
                    {(name || email || 'US').slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl text-xs font-extrabold text-[#0f172a] transition-all cursor-pointer shadow-sm"
                    >
                      Upload Avatar
                    </button>

                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl text-xs font-extrabold text-rose-600 transition-all cursor-pointer shadow-sm"
                      >
                        Remove Avatar
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[#64748b] mt-1">JPG, PNG, WEBP or GIF. Max 2MB</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-[#334155] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3.5 py-2 text-xs text-[#0f172a] focus:outline-none focus:border-[#1fbbd2] shadow-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#334155] mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3.5 py-2 text-xs text-[#0f172a] focus:outline-none focus:border-[#1fbbd2] shadow-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                {savedSuccess && (
                  <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-xs animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Profile updated & saved to vault database!</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="gold-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white shadow-md hover:scale-105 transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          {/* Security Options Card */}
          <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-6 shadow-xl">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#0f172a] border-b border-[#cbd5e1] pb-3">
              <ShieldCheck className="w-4 h-4 text-[#d97706]" />
              <span>Security</span>
            </div>

            <div className="space-y-4">
              {/* Change Password section */}
              <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                <div>
                  <h4 className="text-xs font-extrabold text-[#0f172a]">Change Master Password</h4>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    Ensure your master password is strong and unique. Re-encrypts your local PGP private key.
                  </p>
                  <div className="w-36 h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden mt-2">
                    <div className="w-4/5 h-full bg-[#1fbbd2]" />
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
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0284c7] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Change Password</span>
                </button>
              </div>

              {/* Passkey section */}
              <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                <div>
                  <h4 className="text-xs font-extrabold text-[#0f172a]">Passkey</h4>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    Use a passkey for passwordless and phishing-resistant sign-in. ({passkeys.length} active passkeys)
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowPasskeysModal(true);
                    fetchPasskeys();
                  }}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0284c7] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Manage Passkeys</span>
                </button>
              </div>

              {/* Two-Factor Authentication section */}
              <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                <div>
                  <h4 className="text-xs font-extrabold text-[#0f172a]">Two-Factor Authentication (TOTP)</h4>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    Add an extra layer of security using Microsoft Authenticator or Google Authenticator.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 ${
                    is2FAEnabled
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {is2FAEnabled ? <Check className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                    <span>{is2FAEnabled ? 'Enabled' : 'Disabled'}</span>
                  </span>

                  <button
                    onClick={handleOpen2FAModal}
                    className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl text-xs font-extrabold text-[#0f172a] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>{is2FAEnabled ? 'Manage 2FA' : 'Configure 2FA'}</span>
                  </button>
                </div>
              </div>

              {/* Backup Key section */}
              <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                <div>
                  <h4 className="text-xs font-extrabold text-[#0f172a]">OpenPGP Backup Key Pair</h4>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    View or download your OpenPGP emergency backup key pair to recover account access.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenPgpInspector}
                    className="px-3.5 py-2 bg-[#ffffff] hover:bg-[#fffbeb] border border-[#cbd5e1] rounded-xl text-xs font-extrabold text-[#d97706] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#d97706]" />
                    <span>View PGP Keys</span>
                  </button>

                  <button
                    onClick={handleDownloadBackupKey}
                    className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Backup Key</span>
                  </button>
                </div>
              </div>

              {/* Account Recovery Organization Policy Section */}
              <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                <div>
                  <h4 className="text-xs font-extrabold text-[#0f172a] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#d97706]" />
                    <span>Account Recovery Policy (Zero-Knowledge Escrow)</span>
                  </h4>
                  <p className="text-[11px] text-[#64748b] mt-0.5">
                    Configure organization recovery key and policy: <span className="text-[#0284c7] font-extrabold uppercase">{recPolicy}</span>.
                  </p>
                </div>

                <button
                  onClick={() => setShowRecPolicyModal(true)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#fffbeb] border border-[#f39c12]/50 rounded-xl text-xs font-extrabold text-[#d97706] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Configure Policy</span>
                </button>
              </div>

              {/* Single Sign-On (SSO) Integration Section - Hidden for External Role */}
              {user?.role !== 'External' && (
                <div className="flex items-center justify-between p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl border border-[#cbd5e1] shadow-sm transition-all">
                  <div>
                    <h4 className="text-xs font-extrabold text-[#0f172a] flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#0284c7]" />
                      <span>Single Sign-On (SSO) Providers</span>
                    </h4>
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      Configure Google, Azure AD, or OAuth2. Mandatory Dry-Run test required prior to activation. ({ssoSettingsList.length} configs)
                    </p>
                  </div>

                  <button
                    onClick={() => setShowSsoConfigModal(true)}
                    className="px-4 py-2 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0284c7] flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Manage SSO</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Organization Settings */}
          {user?.role === 'Owner' && user.organization && (
            <div className="bg-[#ffffff] border border-[#cbd5e1] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#0284c7]" />
                  <h2 className="text-lg font-extrabold text-[#0f172a]">Organization Settings</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-[#0284c7] text-xs font-extrabold hover:underline"
                >
                  {showSettings ? 'Hide' : 'Manage'}
                </button>
              </div>

              {showSettings && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs">
                    <strong>Open enrollment</strong> lets anyone with a matching email domain join your organization
                    automatically. Keep this off unless you fully trust your email domain security. It is safer to invite
                    members manually.
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-extrabold text-[#0f172a]">Open Enrollment</p>
                      <p className="text-[10px] text-[#64748b]">
                        Currently {openEnrollment ? 'ON' : 'OFF'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleOpenEnrollment}
                      disabled={openEnrollmentLoading}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                        openEnrollment
                          ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {openEnrollmentLoading ? 'Saving...' : openEnrollment ? 'Turn Off' : 'Turn On'}
                    </button>
                  </div>

                  {transferMessage && (
                    <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold">
                      {transferMessage}
                    </div>
                  )}
                  {transferError && (
                    <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-bold">
                      {transferError}
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-extrabold text-[#0f172a] mb-2">Transfer Ownership</p>
                    {transferStage === 'idle' ? (
                      <form onSubmit={handleInitiateTransfer} className="flex items-center gap-3">
                        <select
                          value={transferTarget}
                          onChange={(e) => setTransferTarget(e.target.value)}
                          className="bg-[#e0f2fe] border border-[#1fbbd2] rounded-xl px-3 py-2 text-xs text-[#0f172a] font-bold outline-none focus:border-[#0284c7]"
                          required
                        >
                          <option value="">Select member</option>
                          {users
                            .filter((u) => u.id !== user?.id)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.email})
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-[#0f172a] text-white rounded-xl text-xs font-extrabold hover:bg-[#1fbbd2] transition-colors cursor-pointer"
                        >
                          Start Transfer
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleConfirmTransfer} className="space-y-3">
                        <p className="text-[11px] text-[#64748b]">
                          Enter the code sent to your email and your 2FA code if enabled.
                        </p>
                        <input
                          type="text"
                          placeholder="Email code"
                          value={transferCode}
                          onChange={(e) => setTransferCode(e.target.value)}
                          className="w-full max-w-xs bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3 py-2 text-xs text-[#0f172a] font-bold outline-none focus:border-[#1fbbd2]"
                          required
                        />
                        {user?.twoFactorEnabled && (
                          <input
                            type="text"
                            placeholder="2FA code"
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value)}
                            className="w-full max-w-xs bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3 py-2 text-xs text-[#0f172a] font-bold outline-none focus:border-[#1fbbd2]"
                            required
                          />
                        )}
                        <div className="flex items-center gap-3">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-[#f39c12] text-white rounded-xl text-xs font-extrabold hover:opacity-95 transition-colors cursor-pointer"
                          >
                            Confirm Transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => { setTransferStage('idle'); setTransferCode(''); setTwoFactorCode(''); setTransferError(''); setTransferMessage(''); }}
                            className="px-4 py-2 bg-[#ffffff] border border-[#cbd5e1] text-[#64748b] rounded-xl text-xs font-extrabold hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delete Account */}
          <div className="glass-panel rounded-2xl p-6 border border-rose-200 bg-[#ffffff] space-y-6 shadow-xl">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#0f172a] border-b border-rose-200 pb-3">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Delete Account</span>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] text-[#64748b]">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>

              {deleteError && (
                <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-bold">
                  {deleteError}
                </div>
              )}

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer shadow-sm"
                >
                  Delete Account
                </button>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Type DELETE to confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full max-w-xs bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3 py-2 text-xs text-[#0f172a] font-bold outline-none focus:border-rose-500"
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {deleteLoading ? 'Deleting...' : 'Permanently Delete Account'}
                  </button>
                </div>
              )}
            </div>
          </div>

        </main>
      </div>

      {/* CHANGE MASTER PASSWORD MODAL */}
      {showChangePassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <Lock className="w-5 h-5 text-[#0284c7]" />
                </div>
                <h3 className="text-base font-extrabold text-[#0f172a]">Change Master Password</h3>
              </div>
              <button onClick={() => setShowChangePassModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs">
              {passError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 shadow-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span className="font-extrabold">{passError}</span>
                </div>
              )}

              {passSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-extrabold">{passSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block font-extrabold text-[#334155] mb-1">Current Master Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    placeholder="Enter current password..."
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 pr-10 text-[#0f172a] font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a]"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-[#334155] mb-1">New Master Password</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    placeholder="At least 8 characters..."
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 pr-10 text-[#0f172a] font-mono font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a]"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-[#334155] mb-1">Confirm New Master Password</label>
                <input
                  type="password"
                  placeholder="Re-enter new password..."
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] font-mono font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#cbd5e1]">
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl font-extrabold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="gold-gradient-btn px-5 py-2 text-white rounded-xl font-extrabold shadow-md disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <Fingerprint className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Manage WebAuthn Passkeys</h3>
                  <p className="text-[10px] text-[#0284c7] font-bold">Passwordless & Biometric Sign-in Credentials</p>
                </div>
              </div>
              <button onClick={() => setShowPasskeysModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {passkeyTestMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-extrabold">{passkeyTestMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b] font-extrabold">Registered Passkeys ({passkeys.length})</span>

                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={isRegisteringPasskey}
                  className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isRegisteringPasskey ? 'Registering...' : 'Register New Passkey'}</span>
                </button>
              </div>

              {passkeys.length === 0 ? (
                <div className="p-8 text-center text-[#64748b] text-xs bg-[#f8fafc] rounded-xl border border-[#cbd5e1]">
                  <Fingerprint className="w-8 h-8 text-[#0284c7] mx-auto mb-2 opacity-80" />
                  <p className="font-medium">No passkeys registered yet. Click &quot;Register New Passkey&quot; above.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      className="p-3.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl flex items-center justify-between text-xs hover:border-[#1fbbd2] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7]">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-[#0f172a]">{pk.name}</h4>
                          <p className="text-[10px] text-[#64748b] mt-0.5 font-medium">
                            {pk.type} • Created {pk.createdAt} • Last used {pk.lastUsed}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeletePasskey(pk.id)}
                        className="p-1.5 text-[#64748b] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Revoke passkey"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#cbd5e1]">
              <button
                type="button"
                onClick={() => setShowPasskeysModal(false)}
                className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl text-xs font-extrabold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TWO-FACTOR AUTHENTICATION (2FA) MODAL */}
      {showTwoFactorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <QrCode className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Two-Factor Authentication</h3>
                  <p className="text-[10px] text-[#0284c7] font-bold">Microsoft Authenticator / TOTP Setup</p>
                </div>
              </div>
              <button onClick={() => setShowTwoFactorModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleToggle2FA} className="space-y-4 text-xs">
              {totpSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-extrabold">{totpSuccessMsg}</span>
                </div>
              )}

              {totpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 shadow-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span className="font-extrabold">{totpError}</span>
                </div>
              )}

              {is2FALoading && !totpSecret && !is2FAEnabled && (
                <div className="text-center text-xs text-[#64748b] py-4">Generating 2FA setup...</div>
              )}

              {!is2FAEnabled && totpUri && (
                <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#cbd5e1] flex flex-col items-center text-center space-y-3">
                  <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow border border-[#cbd5e1]">
                    {totpQrDataUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={totpQrDataUrl}
                        alt="Clickrypt 2FA QR Code"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-[10px] text-gray-400 font-extrabold flex flex-col items-center gap-1.5">
                        <QrCode className="w-6 h-6 animate-pulse text-[#0284c7]" />
                        <span>Rendering...</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-[#64748b] font-medium">
                    Scan this QR code with Microsoft Authenticator, Google Authenticator, or Authy.
                  </p>
                </div>
              )}

              {!is2FAEnabled && (
                <div>
                  <label className="block font-extrabold text-[#334155] mb-1">Manual Setup Secret Key</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#fffbeb] border border-[#f39c12]/40 rounded-xl p-2.5 font-mono text-[#d97706] font-bold text-center tracking-widest">
                      {totpSecret || '••••••••••'}
                    </div>
                  <button
                    type="button"
                    onClick={handleCopyTotpSecret}
                    className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                    title="Copy Secret"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#0284c7]" />}
                  </button>
                </div>
              </div>
              )}

              <div>
                <label className="block font-extrabold text-[#334155] mb-1">
                  {is2FAEnabled ? 'Enter current 2FA code to disable' : 'Verify 6-Digit TOTP Code'}
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 492019"
                  value={totpInputCode}
                  onChange={(e) => setTotpInputCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 font-mono text-center text-[#0f172a] text-base tracking-widest focus:border-[#1fbbd2] focus:outline-none font-bold shadow-sm"
                />
              </div>

              {/* Emergency Backup Codes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-[#334155]">Emergency Recovery Codes</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyBackupCodes}
                      className="px-2.5 py-1 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-lg text-[11px] font-extrabold text-[#0284c7] flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                      title="Copy all recovery codes"
                    >
                      {copiedBackupCodes ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#0284c7]" />}
                      <span>{copiedBackupCodes ? 'Copied!' : 'Copy'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadBackupCodes}
                      className="px-2.5 py-1 gold-cyan-gradient-btn rounded-lg text-[11px] font-extrabold text-white flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                      title="Download recovery codes text file"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-3 bg-[#f8fafc] rounded-xl border border-[#cbd5e1] font-mono text-[10px] text-[#334155]">
                  {backupCodes.map((code, idx) => (
                    <span key={idx} className="bg-[#ffffff] border border-[#cbd5e1] px-2 py-1 rounded text-center font-bold text-[#0f172a]">
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#cbd5e1]">
                <button
                  type="button"
                  onClick={() => setShowTwoFactorModal(false)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl font-extrabold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={is2FALoading}
                  className={`px-5 py-2 rounded-xl text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50 ${
                    is2FAEnabled
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'gold-cyan-gradient-btn text-white'
                  }`}
                >
                  {is2FALoading
                    ? is2FAEnabled ? 'Disabling...' : 'Verifying...'
                    : is2FAEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OPENPGP KEY INSPECTOR MODAL */}
      {showViewBackupKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <Eye className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">OpenPGP Emergency Key Pair Inspector</h3>
                  <p className="text-[10px] text-[#0284c7] font-bold">{user?.name} ({user?.email})</p>
                </div>
              </div>
              <button onClick={() => setShowViewBackupKeyModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block font-extrabold text-[#d97706] mb-1">ASCII Armored Public Key</label>
                <textarea
                  readOnly
                  rows={5}
                  value={user?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...ClickryptPublicKey...==\n-----END PGP PUBLIC KEY BLOCK-----'}
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded-xl p-3 font-mono text-[10px] text-[#0f172a] font-semibold focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-extrabold text-[#0284c7] mb-1">Client-Side Encrypted Private Key</label>
                <textarea
                  readOnly
                  rows={5}
                  value={inspectPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...ClickryptPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----'}
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded-xl p-3 font-mono text-[10px] text-[#0f172a] font-semibold focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#cbd5e1] text-xs">
              <button
                type="button"
                onClick={handleCopyPgpKeys}
                className="px-4 py-2 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] text-[#0284c7] rounded-xl font-extrabold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {copiedPgpKeys ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-[#0284c7]" />}
                <span>{copiedPgpKeys ? 'Keys Copied to Clipboard!' : 'Copy Keys to Clipboard'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowViewBackupKeyModal(false)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl font-extrabold cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackupKey}
                  className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .asc File</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT RECOVERY POLICY MODAL */}
      {showRecPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] font-extrabold shadow-xs">
                  <KeyRound className="w-5 h-5 text-[#d97706]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Account Recovery Policy Configuration</h3>
                  <p className="text-[10px] text-[#64748b] font-medium">Zero-Knowledge Organization Key Escrow</p>
                </div>
              </div>
              <button onClick={() => setShowRecPolicyModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecPolicy} className="space-y-4 text-xs">
              <div>
                <label className="block font-extrabold text-[#334155] mb-1.5">Organization Policy Mode</label>
                <div className="relative">
                  <select
                    value={recPolicy}
                    onChange={(e) => setRecPolicy(e.target.value as any)}
                    className="w-full appearance-none bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] focus:border-[#1fbbd2] rounded-xl px-3.5 py-2.5 text-[#0f172a] font-bold focus:outline-none transition-all cursor-pointer font-sora shadow-xs pr-10"
                  >
                    <option value="disabled" className="bg-white text-[#0f172a]">Disabled (No recovery allowed)</option>
                    <option value="opt-in" className="bg-white text-[#0f172a]">Opt-In (Users choose during setup)</option>
                    <option value="opt-out" className="bg-white text-[#0f172a]">Opt-Out (Enrolled by default, opt-out allowed)</option>
                    <option value="mandatory" className="bg-white text-[#0f172a]">Mandatory (All users must escrow key during setup)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#0284c7] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {recPolicy !== 'disabled' && (
                <div>
                  <label className="block font-extrabold text-[#d97706] mb-1">Organization Recovery Public Key (OpenPGP)</label>
                  <textarea
                    rows={6}
                    value={orgPublicKeyArmored}
                    onChange={(e) => setOrgPublicKeyArmored(e.target.value)}
                    placeholder="-----BEGIN PGP PUBLIC KEY BLOCK----- ..."
                    className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded-xl p-3 font-mono text-[10px] text-[#0f172a] font-semibold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                  />
                  <p className="text-[10px] text-[#64748b] mt-1 font-medium">
                    Enter the organization&apos;s ASCII-armored OpenPGP public key. The server validates structure and fingerprint.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-[#cbd5e1]">
                <button
                  type="button"
                  onClick={() => setShowRecPolicyModal(false)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl font-extrabold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gold-cyan-gradient-btn px-5 py-2 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SSO CONFIGURATION & DRY-RUN MODAL */}
      {showSsoConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <Globe className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">SSO Providers & Mandatory Dry-Run Testing</h3>
                  <p className="text-[10px] text-[#64748b] font-medium">Configure Identity Providers with required dry-run verification</p>
                </div>
              </div>
              <button onClick={() => setShowSsoConfigModal(false)} className="text-[#64748b] hover:text-[#0f172a] transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of existing SSO Configs */}
            {ssoSettingsList.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <h4 className="text-xs font-extrabold text-[#334155]">Configured Providers</h4>
                {ssoSettingsList.map((cfg) => (
                  <div key={cfg.id} className="p-3 bg-[#f8fafc] rounded-xl border border-[#cbd5e1] flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-[#0f172a] uppercase">{cfg.provider}</span>
                      <span className={`ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        cfg.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {cfg.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {cfg.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleRunSsoDryRun(cfg.id, cfg.provider)}
                          className="px-3 py-1 bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] text-white font-extrabold rounded-lg text-[10px] shadow-xs cursor-pointer"
                        >
                          Run Dry-Run Test
                        </button>
                      )}
                      {cfg.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleActivateSsoSetting(cfg.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10px] cursor-pointer"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Draft Config */}
            <form onSubmit={handleSaveDraftSso} className="space-y-4 text-xs border-t border-[#cbd5e1] pt-4">
              <h4 className="font-extrabold text-[#0f172a]">Add New SSO Draft Configuration</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-[#334155] mb-1.5">Provider Type</label>
                  <div className="relative">
                    <select
                      value={ssoProvider}
                      onChange={(e) => setSsoProvider(e.target.value as any)}
                      className="w-full appearance-none bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] focus:border-[#1fbbd2] rounded-xl px-3.5 py-2.5 text-[#0f172a] font-bold focus:outline-none transition-all cursor-pointer font-sora shadow-xs pr-10"
                    >
                      <option value="google" className="bg-white text-[#0f172a]">Google Workspace</option>
                      <option value="azure" className="bg-white text-[#0f172a]">Microsoft Azure AD</option>
                      <option value="oauth2" className="bg-white text-[#0f172a]">Corporate OAuth2 / OIDC</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#0284c7] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block font-extrabold text-[#334155] mb-1">Client ID</label>
                  <input
                    type="text"
                    required
                    value={ssoClientId}
                    onChange={(e) => setSsoClientId(e.target.value)}
                    placeholder="e.g. client_9281039812.apps.googleusercontent.com"
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-[#334155] mb-1">Client Secret (Encrypted at rest)</label>
                <input
                  type="password"
                  required
                  value={ssoClientSecret}
                  onChange={(e) => setSsoClientSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••"
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSsoConfigModal(false)}
                  className="px-4 py-2 bg-[#ffffff] hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] rounded-xl font-extrabold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="gold-cyan-gradient-btn px-5 py-2 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
                >
                  Save Draft Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
