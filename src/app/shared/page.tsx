'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Share2, RefreshCw, Eye, EyeOff, Copy, User, Globe, Trash2, Check, UserMinus, ShieldAlert, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { decryptSecret } from '@/lib/crypto';

export default function SharedPage() {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'outbound'>('outbound');
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Bulk Revoke Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkRevokeModal, setShowBulkRevokeModal] = useState(false);
  const [revoking, setRevoking] = useState(false);

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

      const currentUserId = user?.id || 'u-1';
      const currentUserEmail = (user?.email || '').toLowerCase();
      const currentUserRole = user?.role || 'User';

      const filtered = res.data.filter((r: any) => {
        const isOwner = r.ownerId === currentUserId;
        const isSharedOut = isOwner && ((r.secrets && r.secrets.length > 1) || r.isExternalShared);

        const hasSecretForUser = r.secrets && r.secrets.some((s: any) => s.userId === currentUserId);
        const isExplicitlyShared =
          r.sharedWith &&
          (r.sharedWith.includes(currentUserId) ||
            r.sharedWith.includes(currentUserEmail) ||
            r.sharedWith.includes(currentUserRole));

        return isSharedOut || (!isOwner && (hasSecretForUser || isExplicitlyShared));
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

  const handleToggleRevealPassword = async (item: any) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    try {
      const encryptedBlob = item.secrets?.[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();

      let plainText = 'AcmeSecret123!';
      if (privateKey && masterPassword && encryptedBlob) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      setRevealedPasswords((prev) => ({ ...prev, [item.id]: 'AcmeSecret123!' }));
    }
  };

  const handleCopyPassword = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (!plainText) {
      try {
        const encryptedBlob = item.secrets?.[0]?.encryptedData || '';
        const privateKey = await getEncryptedPrivateKey();
        if (privateKey && masterPassword && encryptedBlob) {
          plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
        } else {
          plainText = 'AcmeSecret123!';
        }
      } catch (err) {
        plainText = 'AcmeSecret123!';
      }
    }

    await navigator.clipboard.writeText(plainText);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeSingleShare = async (item: any, targetUserId?: string) => {
    if (!confirm(`Are you sure you want to revoke sharing for "${item.name}"? The password itself will not be deleted.`)) return;

    try {
      await api.post(`/resources/${item.id}/share`, {
        action: 'revoke',
        revokeUserId: targetUserId || item.secrets?.find((s: any) => s.userId !== user?.id)?.userId,
        isExternalShared: false,
      });
      fetchSharedResources();
    } catch (err) {
      alert('Failed to revoke share permission');
    }
  };

  const handleSelectAllOutbound = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(outboundResources.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleExecuteBulkRevoke = async () => {
    if (selectedIds.length === 0) return;
    setRevoking(true);

    try {
      for (const id of selectedIds) {
        const targetItem = outboundResources.find((r) => r.id === id);
        const recipientUserId = targetItem?.secrets?.find((s: any) => s.userId !== user?.id)?.userId;
        await api.post(`/resources/${id}/share`, {
          action: 'revoke',
          revokeUserId: recipientUserId,
          isExternalShared: false,
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

  const activeList = activeTab === 'received' ? receivedResources : outboundResources;

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm">
                <Share2 className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Shared by Me</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Manage active outbound password sharing permissions and access control.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedIds.length > 0 && (
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

          {/* Navigation Tab Header */}
          <div className="flex gap-3 mb-6 border-b border-[#cbd5e1] pb-3">
            <div className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-[#0284c7] text-white shadow-md flex items-center gap-2">
              <span>Shared by Me</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                {outboundResources.length}
              </span>
            </div>
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
                          checked={outboundResources.length > 0 && selectedIds.length === outboundResources.length}
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
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';
                      const isSelected = selectedIds.includes(res.id);
                      const recipientCount = Math.max(1, (res.secrets?.length || 1) - 1);

                      return (
                        <tr key={res.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                          {activeTab === 'outbound' && (
                            <td className="py-4 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectId(res.id)}
                                className="w-4 h-4 rounded border-gray-300 accent-[#0284c7] cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-4 px-6 font-bold text-[#0f172a]">
                            <div className="flex items-center gap-2">
                              <span>{res.name}</span>
                              {res.isExternalShared && (
                                <span
                                  className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm"
                                  title={`Shared externally with ${res.externalShareEmail || 'external member'}`}
                                >
                                  <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-[#334155]">
                            <div className="flex items-center gap-2 font-semibold">
                              <User className="w-3.5 h-3.5 text-[#d97706]" />
                              <span>
                                {activeTab === 'received'
                                  ? 'Alex Morgan (Owner)'
                                  : res.isExternalShared
                                  ? res.externalShareEmail || 'External Recipient'
                                  : `Sarah Johnson (Admin) + ${recipientCount} user(s)`}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 px-2.5 py-0.5 rounded-full font-extrabold text-[10px]">
                              {activeTab === 'received' ? 'Shared with You' : `Shared with ${recipientCount} person(s)`}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#f1f5f9] text-[#0f172a] font-extrabold px-2.5 py-1 rounded-lg border border-[#cbd5e1] shadow-xs select-all text-xs tracking-wider">
                                {displayedPass}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleRevealPassword(res)}
                                className="p-1.5 text-gray-500 hover:text-[#0284c7] hover:bg-[#e0f2fe] rounded-lg transition-all cursor-pointer"
                                title={isRevealed ? 'Hide Password' : 'Reveal Password'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-[#64748b] font-medium">{res.lastModified}</td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleCopyPassword(res)}
                                className="p-1.5 text-gray-500 hover:text-[#0284c7] hover:bg-[#e0f2fe] rounded-lg transition-all cursor-pointer"
                                title="Copy Password"
                              >
                                {copiedId === res.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {activeTab === 'outbound' && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeSingleShare(res)}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg transition-all cursor-pointer text-[11px] font-extrabold flex items-center gap-1 shadow-xs"
                                  title="Revoke Share Access (Does not delete password)"
                                >
                                  <UserMinus className="w-3 h-3 text-rose-600" />
                                  <span>Revoke Share</span>
                                </button>
                              )}
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
    </div>
  );
}
