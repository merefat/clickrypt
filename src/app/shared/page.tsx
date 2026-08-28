/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Share2, RefreshCw, Eye, EyeOff, Copy, User, Globe, Trash2, Check, UserMinus, ShieldAlert, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { decryptBestSecret } from '@/lib/crypto';
import { resolveBestSecret } from '@/lib/secretResolver';
import { formatExactDateTime } from '@/lib/dateUtils';
import UnlockVaultModal from '@/components/UnlockVaultModal';

export default function SharedPage() {
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey, unlockVault } = useAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'outbound'>('outbound');
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<'reveal' | 'copy' | null>(null);
  const [pendingUnlockItem, setPendingUnlockItem] = useState<any | null>(null);

  // Bulk Revoke Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkRevokeModal, setShowBulkRevokeModal] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [appMode, setAppMode] = useState<'personal' | 'organization'>('personal');

  const handleUpgradeAccount = async () => {
    if (!confirm('Upgrade to a full Clickrypt account? This will unlock all features.')) return;
    try {
      const res = await api.post('/auth/upgrade-account', { role: 'User' });
      if (res.data?.success) {
        window.location.reload();
      } else {
        alert(res.data?.error || 'Upgrade failed.');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upgrade account.');
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mode = (localStorage.getItem('clickrypt_app_mode') as any) || 'personal';
      setAppMode(mode);
      if (user?.role === 'External' || mode === 'organization') {
        setActiveTab('received');
      } else {
        setActiveTab('outbound');
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchSharedResources();
    }
  }, [user]);

  const fetchSharedResources = async () => {
    setLoading(true);
    try {
      const res = await api.get('/resources', {
        params: { search: '', sharedWithUserId: user?.id },
      });

      const currentUserId = user?.id || '';
      const currentUserEmail = (user?.email || '').toLowerCase();

      const filtered = res.data.filter((r: any) => {
        const isOwner = r.ownerId === currentUserId;
        const isSharedOut = isOwner && ((r.sharedWith && r.sharedWith.length > 0) || r.isExternalShared);

        const isExplicitlyShared =
          !isOwner &&
          ((r.sharedWith &&
            (r.sharedWith.includes(currentUserId) ||
              r.sharedWith.includes(currentUserEmail))) ||
            (r.isExternalShared && r.externalShareEmail?.toLowerCase() === currentUserEmail));

        return isSharedOut || isExplicitlyShared;
      });

      setResources(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const receivedResources = resources.filter((r) => r.ownerId !== user?.id);
  const outboundResources = resources.filter((r) => r.ownerId === user?.id);

  const performReveal = async (item: any, privateKeyOverride?: string) => {
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey) throw new Error('Key or encrypted data missing');

    const userSecret = resolveBestSecret(item, user?.id, user?.role, user?.email);
    if (!userSecret) throw new Error('No usable secret for this user');

    const plainText = await decryptBestSecret(userSecret, item.secrets, user?.role, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
    setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
  };

  const handleToggleRevealPassword = async (item: any) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    if (!unlockedPgpKey && !masterPassword) {
      setPendingUnlockAction('reveal');
      setPendingUnlockItem(item);
      setShowUnlockModal(true);
      return;
    }

    try {
      await performReveal(item);
    } catch (err) {
      console.error('Reveal failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt.');
    }
  };

  const performCopy = async (item: any, privateKeyOverride?: string) => {
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey) throw new Error('Key or encrypted data missing');

    const userSecret = resolveBestSecret(item, user?.id, user?.role, user?.email);
    if (!userSecret) throw new Error('No usable secret for this user');

    return await decryptBestSecret(userSecret, item.secrets, user?.role, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
  };

  const handleCopyPassword = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (plainText) {
      await navigator.clipboard.writeText(plainText);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      return;
    }

    if (!unlockedPgpKey && !masterPassword) {
      setPendingUnlockAction('copy');
      setPendingUnlockItem(item);
      setShowUnlockModal(true);
      return;
    }

    try {
      plainText = await performCopy(item);
    } catch (err) {
      console.error('Copy failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt.');
      return;
    }

    await navigator.clipboard.writeText(plainText);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUnlockSubmit = async (password: string) => {
    const privateKey = await unlockVault(password);
    if (!privateKey) return false;
    setShowUnlockModal(false);

    try {
      if (pendingUnlockAction === 'reveal' && pendingUnlockItem) {
        await performReveal(pendingUnlockItem, privateKey);
      } else if (pendingUnlockAction === 'copy' && pendingUnlockItem) {
        const plainText = await performCopy(pendingUnlockItem, privateKey);
        await navigator.clipboard.writeText(plainText);
        setCopiedId(pendingUnlockItem.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (err) {
      alert('Failed to decrypt.');
    }

    setPendingUnlockAction(null);
    setPendingUnlockItem(null);
    return true;
  };

  const handleRevokeSingleShare = async (res: any, recipient: any) => {
    if (!confirm(`Are you sure you want to revoke sharing for "${res.name}" with ${recipient.name}? The password itself will not be deleted.`)) return;

    try {
      await api.post(`/resources/${res.id}/share`, {
        action: 'revoke',
        revokeUserId: recipient.external ? undefined : recipient.id,
        isExternalShared: recipient.external ? false : undefined,
      });
      fetchSharedResources();
    } catch (err) {
      alert('Failed to revoke share permission');
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"? This cannot be undone.`)) return;

    try {
      await api.delete(`/resources/${item.id}`);
      fetchSharedResources();
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  const handleSelectAllOutbound = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(outboundRows.map((r) => r.rowKey));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRowKey = (rowKey: string) => {
    setSelectedIds((prev) => (prev.includes(rowKey) ? prev.filter((item) => item !== rowKey) : [...prev, rowKey]));
  };

  const handleExecuteBulkRevoke = async () => {
    if (selectedIds.length === 0) return;
    setRevoking(true);

    try {
      for (const rowKey of selectedIds) {
        const row = outboundRows.find((r) => r.rowKey === rowKey);
        if (!row) continue;
        await api.post(`/resources/${row.id}/share`, {
          action: 'revoke',
          revokeUserId: row.recipient?.external ? undefined : row.recipient?.id,
          isExternalShared: row.recipient?.external ? false : undefined,
        });
      }
      setSelectedIds([]);
      setShowBulkRevokeModal(false);
      fetchSharedResources();
    } catch (err) {
      alert('Bulk revocation encountered an error');
    } finally {
      setRevoking(false);
    }
  };

  const outboundRows = outboundResources.flatMap((res: any) =>
    (res.recipients && res.recipients.length > 0)
      ? res.recipients.map((recipient: any) => ({
          ...res,
          recipient,
          rowKey: `${res.id}::${recipient.id || 'na'}`,
        }))
      : [
          {
            ...res,
            recipient: { id: undefined, name: res.isExternalShared ? res.externalShareEmail || 'External Recipient' : 'Unknown', external: res.isExternalShared },
            rowKey: `${res.id}::na`,
          },
        ]
  );

  const activeList = activeTab === 'received' ? receivedResources : outboundRows;

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto">
          {/* Top Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm">
                <Share2 className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">
                  {appMode === 'organization' ? 'Shared Passwords' : 'Shared by Me'}
                </h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  {appMode === 'organization'
                    ? 'Manage active inbound and outbound password sharing permissions.'
                    : 'Manage active outbound password sharing permissions and access control.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === 'outbound' && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkRevokeModal(true)}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <UserMinus className="w-4 h-4 text-rose-600" />
                  <span>Revoke Sharing ({selectedIds.length})</span>
                </button>
              )}

              <button
                onClick={async () => {
                  setLoading(true);
                  await fetchSharedResources();
                  setTimeout(() => setLoading(false), 500);
                }}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-[#0f172a] transition-all shadow-sm cursor-pointer active:scale-95"
                title="Refresh Shared Secrets"
              >
                <RefreshCw className={`w-4 h-4 text-[#0284c7] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {user?.role === 'External' && (
            <div className="mb-6 p-4 bg-[#fffbeb] border border-[#f39c12]/40 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <h2 className="text-sm font-extrabold text-[#0f172a]">External View-Only Account</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">
                  You can only view passwords shared with you. Upgrade to a full account to create and share your own.
                </p>
              </div>
              <button
                onClick={handleUpgradeAccount}
                className="px-4 py-2 gold-cyan-gradient-btn rounded-xl text-xs font-extrabold text-white shadow-md hover:opacity-95 transition-all"
              >
                Upgrade to Full Account
              </button>
            </div>
          )}

          {/* Navigation Tabs Header */}
          <div className="flex gap-3 mb-6 border-b border-[#cbd5e1] pb-3">
            <button
              onClick={() => setActiveTab('received')}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'received'
                  ? 'bg-[#0284c7] text-white shadow-md'
                  : 'bg-[#ffffff] text-[#475569] hover:bg-[#e0f2fe] hover:text-[#0284c7] border border-[#cbd5e1]'
              }`}
            >
              <span>Shared with Me</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                {receivedResources.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('outbound')}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'outbound'
                  ? 'bg-[#0284c7] text-white shadow-md'
                  : 'bg-[#ffffff] text-[#475569] hover:bg-[#e0f2fe] hover:text-[#0284c7] border border-[#cbd5e1]'
              }`}
            >
              <span>Shared by Me</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                {outboundResources.length}
              </span>
            </button>
          </div>

          {/* Table Container */}
          <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                  <tr>
                    {activeTab === 'outbound' && (
                      <th className="py-3.5 px-4 w-10">
                        <input
                          type="checkbox"
                          onChange={handleSelectAllOutbound}
                          checked={outboundRows.length > 0 && selectedIds.length === outboundRows.length}
                          className="w-4 h-4 rounded border-gray-300 accent-[#0284c7] cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3.5 px-6">Password Name</th>
                    <th className="py-3.5 px-4">{activeTab === 'received' ? 'Shared By' : 'Shared With'}</th>
                    <th className="py-3.5 px-4">Status & Recipients</th>
                    <th className="py-3.5 px-4">Password</th>
                    <th className="py-3.5 px-4">Last Modified</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#e2e8f0]">
                  {activeList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#64748b] text-xs">
                        {activeTab === 'received'
                          ? 'No passwords have been shared with you yet.'
                          : 'You have not shared any passwords with others.'}
                      </td>
                    </tr>
                  ) : (
                    activeList.map((res) => {
                      const isOutbound = activeTab === 'outbound';
                      const row = res as any;
                      const isRevealed = !!revealedPasswords[row.id];
                      const displayedPass = isRevealed ? revealedPasswords[row.id] : '••••••••';
                      const isSelected = selectedIds.includes(row.rowKey || row.id);

                      return (
                        <tr key={row.rowKey || row.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                          {isOutbound && (
                            <td className="py-4 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectRowKey(row.rowKey)}
                                className="w-4 h-4 rounded border-gray-300 accent-[#0284c7] cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-4 px-6 font-bold text-[#0f172a]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate min-w-0" title={row.name}>{row.name}</span>
                              {row.isExternalShared && (
                                <span
                                  className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm shrink-0"
                                  title={`Shared externally with ${row.externalShareEmail || 'external member'}`}
                                >
                                  <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-[#334155]">
                            <div className="flex items-center gap-2 font-semibold">
                              <User className="w-3.5 h-3.5 text-[#d97706]" />
                              <span className="truncate min-w-0">
                                {isOutbound
                                  ? row.recipient?.name || 'Unknown'
                                  : row.ownerName || 'Vault Owner'}
                              </span>
                              {isOutbound && row.recipient?.external && (
                                <Globe className="w-3.5 h-3.5 text-[#d97706] shrink-0" aria-label="External share" />
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 px-2.5 py-0.5 rounded-full font-extrabold text-[10px]">
                              {isOutbound ? 'Shared with 1 person' : 'Shared with You'}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#f1f5f9] text-[#0f172a] font-extrabold px-2.5 py-1 rounded-lg border border-[#cbd5e1] shadow-xs select-all text-xs tracking-wider">
                                {displayedPass}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleRevealPassword(row)}
                                className="p-1.5 text-gray-500 hover:text-[#0284c7] hover:bg-[#e0f2fe] rounded-lg transition-all cursor-pointer"
                                title={isRevealed ? 'Hide Password' : 'Reveal Password'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-[#64748b] font-medium">{formatExactDateTime(row.lastModified)}</td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleCopyPassword(row)}
                                className="p-1.5 text-gray-500 hover:text-[#0284c7] hover:bg-[#e0f2fe] rounded-lg transition-all cursor-pointer"
                                title="Copy Password"
                              >
                                {copiedId === row.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {isOutbound && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeSingleShare(row, row.recipient)}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg transition-all cursor-pointer text-[11px] font-extrabold flex items-center gap-1 shadow-xs"
                                  title="Revoke Share Access (Does not delete password)"
                                >
                                  <UserMinus className="w-3 h-3 text-rose-600" />
                                  <span>Revoke Share</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Delete password item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Bulk Revoke Confirmation Modal */}
      {showBulkRevokeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-2xl border border-[#cbd5e1] p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#0f172a]">Revoke Selected Shares?</h3>
                <p className="text-xs text-[#64748b]">Revoke sharing for {selectedIds.length} password items</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[#92400e] space-y-1">
              <strong className="font-extrabold flex items-center gap-1.5 text-[#78350f]">
                <AlertCircle className="w-4 h-4 text-[#d97706]" />
                Important Protection Notice:
              </strong>
              <p className="text-[11px]">
                This action revokes share access for recipients. The original passwords will <strong>NOT</strong> be deleted and will remain in your private vault.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkRevokeModal(false)}
                disabled={revoking}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#334155] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteBulkRevoke}
                disabled={revoking}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                {revoking ? 'Revoking Shares...' : 'Revoke Sharing'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UnlockVaultModal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setPendingUnlockAction(null);
          setPendingUnlockItem(null);
        }}
        onSubmit={handleUnlockSubmit}
      />
    </div>
  );
}
