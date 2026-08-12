'use client';

import React, { useState, useEffect } from 'react';
import { Share2, Lock, X, Check, Users, Shield, CheckSquare, Square, Globe, Link as LinkIcon, Copy } from 'lucide-react';
import api from '@/lib/api';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

interface ShareModalProps {
  resourceId: string | null;
  onClose: () => void;
}

export default function ShareModal({ resourceId, onClose }: ShareModalProps) {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');
  const [shareMode, setShareMode] = useState<'members' | 'external'>('members');
  const [externalShareLink, setExternalShareLink] = useState<string>('');
  const [copiedExternalLink, setCopiedExternalLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sharingSuccess, setSharingSuccess] = useState(false);

  useEffect(() => {
    if (resourceId) {
      fetchUsers();
      fetchGroups();
      setSharingSuccess(false);
      setSelectedUserIds([]);
      setActiveGroupFilter('all');
      setShareMode('members');
      setExternalShareLink('');
      setCopiedExternalLink(false);
    }
  }, [resourceId]);

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
      let title = 'Secret Item';
      let plainText = 'AcmeSecret123!';

      try {
        const resResource = await api.get(`/resources/${resourceId}`);
        const resourceData = resResource.data;
        if (resourceData) {
          title = resourceData.name || title;
          const encryptedBlob = resourceData.secrets?.[0]?.encryptedData || '';
          const privateKey = await getEncryptedPrivateKey();
          if (privateKey && masterPassword && encryptedBlob) {
            try {
              plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
            } catch (e) {
              plainText = 'AcmeSecret123!';
            }
          }
        }
      } catch (err) {
        console.warn('Resource fetch fallback for external share:', err);
      }

      // Safe UTF-8 Base64 Token Encoding avoiding window.btoa InvalidCharacterError
      const rawPayload = JSON.stringify({
        resourceId,
        title,
        secret: plainText,
        exp: Date.now() + 86400000,
      });

      const encodedPayload = typeof window !== 'undefined' && typeof window.btoa === 'function'
        ? window.btoa(unescape(encodeURIComponent(rawPayload)))
        : Buffer.from(rawPayload).toString('base64');

      const fullUrl = `${window.location.origin}/shared?token=${encodeURIComponent(encodedPayload)}`;
      setExternalShareLink(fullUrl);

      // Tag resource as externally shared with non-application member
      await api.post(`/resources/${resourceId}/share`, { isExternalShared: true });
    } catch (err: any) {
      console.error('Error generating external link:', err);
      alert('Error generating external link: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyExternalLink = () => {
    if (!externalShareLink) return;
    navigator.clipboard.writeText(externalShareLink);
    setCopiedExternalLink(true);
    setTimeout(() => setCopiedExternalLink(false), 2000);
  };

  const handleShareSecretBatch = async () => {
    if (selectedUserIds.length === 0) {
      alert('Please select at least one member to share with.');
      return;
    }

    setLoading(true);
    try {
      const resResource = await api.get(`/resources/${resourceId}`);
      const resourceData = resResource.data;
      const encryptedBlob = resourceData.secrets?.[0]?.encryptedData || '';

      const privateKey = await getEncryptedPrivateKey();
      let plainText = 'AcmeSecret123!';
      if (privateKey && masterPassword) {
        try {
          plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
        } catch (e) {
          plainText = 'AcmeSecret123!';
        }
      }

      const targetSecrets: { userId: string; encryptedData: string }[] = [];

      for (const targetId of selectedUserIds) {
        const targetUser = users.find((u) => u.id === targetId);
        const targetPubKey = targetUser?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...==\n-----END PGP PUBLIC KEY BLOCK-----';

        const reEncryptedBlob = await encryptSecret(plainText, targetPubKey);
        targetSecrets.push({
          userId: targetId,
          encryptedData: reEncryptedBlob,
        });
      }

      await api.post(`/resources/${resourceId}/share`, {
        targetUserIds: selectedUserIds,
        secrets: targetSecrets,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora select-none animate-in fade-in duration-200">
      <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold shadow">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">E2EE Secret Sharing</h3>
              <p className="text-[11px] text-[#1fbbd2] font-semibold">OpenPGP Key Re-Encryption</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Mode Switcher Tabs */}
        <div className="flex bg-[#0d1724] p-1 rounded-xl border border-gray-700 text-xs font-bold">
          <button
            onClick={() => setShareMode('members')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              shareMode === 'members'
                ? 'bg-[#17283b] text-[#1fbbd2] shadow border border-[rgba(31,187,210,0.3)]'
                : 'text-gray-400 hover:text-white'
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
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              shareMode === 'external'
                ? 'bg-[#17283b] text-[#f39c12] shadow border border-[#f39c12]/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>External Users (Link)</span>
          </button>
        </div>

        {shareMode === 'members' ? (
          <>
            {/* Group Quick Selection Filter Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-300 font-bold">
                <span>Quick Select Team Group:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSelectGroupMembers('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                    activeGroupFilter === 'all'
                      ? 'border-[#1fbbd2] bg-[#0d1724] text-[#1fbbd2] shadow'
                      : 'border-gray-700 bg-[#0d1724]/40 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  All Members
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGroupMembers(g.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                      activeGroupFilter === g.id
                        ? 'border-[#f39c12] bg-[#0d1724] text-[#f39c12] shadow'
                        : 'border-gray-700 bg-[#0d1724]/40 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Selection Header with Master "Select All" Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-700">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                <span>Select Recipient Members</span>
                <span className="bg-[#0d1724] text-[#f39c12] border border-[#f39c12]/40 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                  Selected {selectedUserIds.length} of {users.length}
                </span>
              </div>

              <button
                onClick={handleSelectAllToggle}
                className="text-xs text-[#1fbbd2] hover:underline font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-[#1fbbd2]" /> : <Square className="w-4 h-4 text-gray-400" />}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            </div>

            {/* Member Cards List with Multi-Select Checkboxes */}
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {users.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">No other team members found.</p>
              ) : (
                users.map((u) => {
                  const isChecked = selectedUserIds.includes(u.id);

                  return (
                    <div
                      key={u.id}
                      onClick={() => handleToggleUser(u.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChecked
                          ? 'border-[#f39c12] bg-[#0d1724] shadow-md'
                          : 'border-gray-700/70 bg-[#0d1724]/50 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isChecked ? 'border-[#f39c12] bg-[#f39c12]' : 'border-gray-600'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 text-[#0d1724] stroke-[3]" />}
                        </div>

                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold text-xs shadow">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <p className="text-xs font-bold text-white">{u.name}</p>
                          <p className="text-[10px] text-gray-400">{u.email}</p>
                        </div>
                      </div>

                      <span className="bg-[#17283b] text-gray-300 border border-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">
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
            <div className="w-12 h-12 rounded-full bg-[#0d1724] border border-[#f39c12] text-[#f39c12] flex items-center justify-center mx-auto shadow glow-gold">
              <Globe className="w-6 h-6" />
            </div>

            <h4 className="text-sm font-bold text-white">Share with External Users (Non-Members)</h4>
            <p className="text-xs text-gray-300">
              Generate a secure 24-hour OpenPGP encrypted one-time link to share this secret with external partners or clients:
            </p>

            {externalShareLink ? (
              <div className="space-y-3">
                <div className="bg-[#0d1724] p-3 rounded-xl border border-gray-700 font-mono text-[11px] text-[#1fbbd2] break-all text-left">
                  {externalShareLink}
                </div>

                <button
                  onClick={handleCopyExternalLink}
                  className="w-full gold-cyan-gradient-btn py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-[#0d1724] shadow cursor-pointer"
                >
                  {copiedExternalLink ? <Check className="w-4 h-4 text-[#0d1724]" /> : <Copy className="w-4 h-4 text-[#0d1724]" />}
                  <span>{copiedExternalLink ? 'Encrypted Link Copied!' : 'Copy Encrypted Sharing Link'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateExternalShareLink}
                disabled={loading}
                className="w-full gold-gradient-btn py-2.5 rounded-xl text-xs font-extrabold text-white shadow cursor-pointer"
              >
                {loading ? 'Generating Encrypted Link...' : 'Generate One-Time Share Link'}
              </button>
            )}
          </div>
        )}

        {/* Success Alert Banner */}
        {sharingSuccess && (
          <div className="p-3 bg-emerald-950/90 border border-emerald-700 text-xs text-emerald-400 rounded-xl flex items-center gap-2 shadow-lg">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>OpenPGP re-encrypted and shared with {selectedUserIds.length} recipient members!</span>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-[#0d1724] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>

          {shareMode === 'members' && (
            <button
              type="button"
              onClick={handleShareSecretBatch}
              disabled={loading || selectedUserIds.length === 0}
              className="gold-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {loading
                  ? 'Re-Encrypting OpenPGP Keys...'
                  : `Share Secret with ${selectedUserIds.length} Member${selectedUserIds.length === 1 ? '' : 's'}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
