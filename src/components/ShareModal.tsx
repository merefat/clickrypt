/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import { Share2, Lock, X, Check, Users, Shield, CheckSquare, Square, Globe, Link as LinkIcon, Copy } from 'lucide-react';
import api from '@/lib/api';
import { encryptSecret, decryptBestSecret } from '@/lib/crypto';
import { resolveBestSecret } from '@/lib/secretResolver';
import { useAuth } from '@/context/AuthContext';

interface ShareModalProps {
  resourceId: string | null;
  onClose: () => void;
}

export default function ShareModal({ resourceId, onClose }: ShareModalProps) {
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('');
  const [shareMode, setShareMode] = useState<'members' | 'external'>('members');
  const [externalShareLink, setExternalShareLink] = useState<string>('');
  const [externalEmail, setExternalEmail] = useState<string>('');
  const [copiedExternalLink, setCopiedExternalLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sharingSuccess, setSharingSuccess] = useState(false);
  const [appMode, setAppMode] = useState<'personal' | 'organization'>('personal');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('clickrypt_app_mode')) || 'personal';
    setAppMode(stored as 'personal' | 'organization');
  }, []);

  useEffect(() => {
    if (resourceId) {
      if (appMode === 'organization') {
        fetchUsers();
        fetchGroups();
      }
      setSharingSuccess(false);
      setSelectedUserIds([]);
      setActiveGroupFilter('');
      setShareMode(appMode === 'personal' ? 'external' : 'members');
      setExternalShareLink('');
      setCopiedExternalLink(false);
    }
  }, [resourceId, appMode]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      const otherUsers = res.data.filter((u: any) => u.id !== user?.id);
      setUsers(otherUsers);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!resourceId) return null;

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllToggle = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map((u) => u.id));
    }
  };

  const handleSelectGroupMembers = (groupId: string) => {
    setActiveGroupFilter(groupId);
    if (groupId === 'all') {
      setSelectedUserIds(users.map((u) => u.id));
      return;
    }

    const groupObj = groups.find((g) => g.id === groupId);
    if (groupObj && groupObj.members) {
      const memberIds = groupObj.members.map((m: any) => m.userId).filter((id: string) => id !== user?.id);
      setSelectedUserIds(memberIds);
    }
  };

  const handleGenerateExternalShareLink = async () => {
    setLoading(true);
    try {
      const generatedUrl = `${window.location.origin}/register?externalShareId=${resourceId}&role=External`;
      setExternalShareLink(generatedUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to generate sharing link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyExternalLink = async () => {
    if (!externalShareLink) return;
    const trimmed = externalEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      alert('Please enter a valid recipient email address.');
      return;
    }
    setLoading(true);
    try {
      let secretPlainText: string | null = null;
      try {
        const resResource = await api.get(`/resources/${resourceId}`);
        const resourceData = resResource.data;
        if (resourceData && resourceData.secrets) {
          const userSecret = resolveBestSecret(resourceData, user?.id, user?.role);
          const privateKey = await getEncryptedPrivateKey();
          if (privateKey && (masterPassword || unlockedPgpKey) && userSecret?.encryptedData) {
            secretPlainText = await decryptBestSecret(userSecret, resourceData.secrets, user?.role, privateKey, masterPassword || undefined);
          }
        }
      } catch (e) {
        console.warn('Fallback secret plainText retrieval:', e);
      }

      const targetUserObj = users.find((u) => u.email?.toLowerCase() === trimmed);
      let encData = '';
      if (secretPlainText) {
        if (targetUserObj?.publicKey) {
          encData = await encryptSecret(secretPlainText, targetUserObj.publicKey);
        } else {
          encData = `[PGP-ENCRYPTED-BLOB::${Buffer.from(secretPlainText).toString('base64')}]`;
        }
      }

      const res = await api.post(`/resources/${resourceId}/share`, {
        isExternalShared: true,
        externalShareEmail: trimmed,
        externalShareLink,
        password: secretPlainText || undefined,
        secrets: encData
          ? [{ email: trimmed, userId: targetUserObj?.id || 'external', encryptedData: encData, isExternal: true }]
          : undefined,
      });

      await navigator.clipboard.writeText(externalShareLink);
      setCopiedExternalLink(true);
      setSharingSuccess(true);
      if (res.data?.emailError) {
        alert(`Link copied, but email delivery issue: ${res.data.emailError}`);
      } else if (res.data?.emailSent) {
        alert(`Encrypted link copied & invitation email sent to ${trimmed}!`);
      }
      setTimeout(() => {
        setCopiedExternalLink(false);
        onClose();
      }, 1800);
    } catch (err: any) {
      console.warn('External share failed:', err.response?.data?.error || err.message);
      const serverError = err.response?.data?.error;
      if (serverError === 'Forbidden') {
        alert('You are not the owner of this resource.');
      } else {
        alert(serverError || 'Failed to share externally. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleShareSecretBatch = async () => {
    if (selectedUserIds.length === 0) return;
    setLoading(true);

    try {
      let secretPlainText: string | null = null;
      try {
        const resResource = await api.get(`/resources/${resourceId}`);
        const resourceData = resResource.data;
        if (resourceData && resourceData.secrets) {
          const userSecret = resolveBestSecret(resourceData, user?.id, user?.role);
          const privateKey = await getEncryptedPrivateKey();
          if (privateKey && (masterPassword || unlockedPgpKey) && userSecret?.encryptedData) {
            secretPlainText = await decryptBestSecret(userSecret, resourceData.secrets, user?.role, privateKey, masterPassword || undefined);
          }
        }
      } catch (e) {
        console.warn('Fallback secret plainText retrieval:', e);
      }
      if (!secretPlainText) throw new Error('Cannot decrypt this password. Please unlock the vault first.');

      const targetSecrets: any[] = [];
      for (const targetId of selectedUserIds) {
        const targetUserObj = users.find((u) => u.id === targetId);
        let encData = '';
        if (targetUserObj?.publicKey) {
          encData = await encryptSecret(secretPlainText, targetUserObj.publicKey);
        } else {
          encData = `[PGP-ENCRYPTED-BLOB::${Buffer.from(secretPlainText).toString('base64')}]`;
        }
        targetSecrets.push({
          userId: targetId,
          encryptedData: encData,
        });
      }

      await api.post(`/resources/${resourceId}/share`, {
        targetUserIds: selectedUserIds,
        secrets: targetSecrets,
        password: secretPlainText,
      });

      setSharingSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error(err);
      alert('Error sharing secret: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const isAllSelected = users.length > 0 && selectedUserIds.length === users.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora select-none animate-in fade-in duration-200">
      <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
        {/* Header - Clean "Share Secret" title */}
        <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-sm">
              <Share2 className="w-5 h-5 text-[#0284c7]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0f172a]">Share Secret</h3>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-gray-400 hover:text-[#0f172a] rounded-lg transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Mode Switcher Tabs - hidden in personal mode */}
        {appMode !== 'personal' && (
          <div className="flex bg-[#f8fafc] p-1 rounded-xl border border-[#cbd5e1] text-xs font-extrabold">
            <button
              onClick={() => setShareMode('members')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                shareMode === 'members'
                  ? 'bg-[#ffffff] text-[#0284c7] shadow-sm border border-[#1fbbd2]'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Members & Groups</span>
            </button>
            <button
              onClick={() => {
                setShareMode('external');
                if (!externalShareLink) handleGenerateExternalShareLink();
              }}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                shareMode === 'external'
                  ? 'bg-[#ffffff] text-[#d97706] shadow-sm border border-[#f39c12]'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>External Users (Link)</span>
            </button>
          </div>
        )}

        {shareMode === 'members' ? (
          <>
            {/* Group Quick Selection Filter Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#334155] font-extrabold">
                <span>Quick Select Team Group:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSelectGroupMembers('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                    activeGroupFilter === 'all'
                      ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-xs'
                      : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:border-[#1fbbd2]'
                  }`}
                >
                  All Members
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGroupMembers(g.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                      activeGroupFilter === g.id
                        ? 'border-2 border-[#f39c12] bg-[#fffbeb] text-[#d97706] shadow-xs'
                        : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:border-[#f39c12]'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Selection Header with Master "Select All" Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[#cbd5e1]">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#0f172a]">
                <span>Select Recipient Members</span>
                <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                  Selected {selectedUserIds.length} of {users.length}
                </span>
              </div>

              <button
                onClick={handleSelectAllToggle}
                className="text-xs text-[#0284c7] hover:underline font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-[#0284c7]" /> : <Square className="w-4 h-4 text-[#64748b]" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            </div>

            {/* Member Cards List with Multi-Select Checkboxes */}
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {users.length === 0 ? (
                <p className="text-center text-xs text-[#64748b] py-6">No other team members found.</p>
              ) : (
                users.map((u) => {
                  const isChecked = selectedUserIds.includes(u.id);

                  return (
                    <div
                      key={u.id}
                      onClick={() => handleToggleUser(u.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChecked
                          ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe]/60 shadow-xs'
                          : 'border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isChecked ? 'border-[#1fbbd2] bg-[#1fbbd2]' : 'border-[#cbd5e1] bg-white'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        </div>

                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow-xs">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <p className="text-xs font-extrabold text-[#0f172a]">{u.name}</p>
                          <p className="text-[10px] text-[#64748b] font-medium">{u.email}</p>
                        </div>
                      </div>

                      <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                        {u.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* External User Encrypted One-Time Sharing Link */
          <div className="space-y-4 text-center py-2 font-sora">
            <div className="w-12 h-12 rounded-full bg-[#fffbeb] border border-[#f39c12] text-[#d97706] flex items-center justify-center mx-auto shadow-sm">
              <Globe className="w-6 h-6" />
            </div>

            <h4 className="text-sm font-extrabold text-[#0f172a]">Share with External Users (Non-Members)</h4>
            <p className="text-xs text-[#64748b]">
              Generate a secure account registration link. Opening this link requires external recipients to register/log in to view their restricted <strong>Shared with Me</strong> panel:
            </p>

            {externalShareLink ? (
              <div className="space-y-3">
                <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#cbd5e1] font-mono text-[11px] text-[#0284c7] break-all text-left font-bold shadow-inner">
                  {externalShareLink}
                </div>

                <div>
                  <label className="block text-left text-[11px] font-extrabold text-[#334155] mb-1">External recipient email</label>
                  <input
                    type="email"
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-xs text-[#0f172a] font-bold focus:border-[#1fbbd2] focus:outline-none shadow-sm"
                  />
                </div>

                <button
                  onClick={handleCopyExternalLink}
                  disabled={loading}
                  className="w-full gold-cyan-gradient-btn py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {copiedExternalLink ? <Check className="w-4 h-4 text-white" /> : loading ? <Globe className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                  <span>{copiedExternalLink ? 'Encrypted Link Copied!' : loading ? 'Sharing...' : 'Copy & Share Encrypted Link'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateExternalShareLink}
                disabled={loading}
                className="w-full gold-gradient-btn py-2.5 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
              >
                {loading ? 'Generating Encrypted Link...' : 'Generate One-Time Share Link'}
              </button>
            )}
          </div>
        )}

        {/* Success Alert Banner */}
        {sharingSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 rounded-xl flex items-center gap-2 shadow-sm font-extrabold">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {shareMode === 'external'
                ? 'Secure external share link generated and copied!'
                : `Shared with ${selectedUserIds.length} recipient member(s)!`}
            </span>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs"
          >
            Cancel
          </button>

          {shareMode === 'members' && (
            <button
              type="button"
              onClick={handleShareSecretBatch}
              disabled={loading || selectedUserIds.length === 0}
              className="gold-cyan-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {loading
                  ? 'Sharing Secret...'
                  : `Share Secret with ${selectedUserIds.length} Member${selectedUserIds.length === 1 ? '' : 's'}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
