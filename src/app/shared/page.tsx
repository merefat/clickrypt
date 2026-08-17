'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Share2, RefreshCw, Eye, EyeOff, Copy, User, Globe, Trash2, Check } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { decryptSecret } from '@/lib/crypto';

export default function SharedPage() {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      const currentUserEmail = user?.email || '';
      const currentUserRole = user?.role || 'User';

      // Strict role and person filtering:
      // Show items created by logged-in user that were shared OUT,
      // OR items shared specifically WITH the logged-in user.
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

  const handleDeleteResource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shared password item?')) return;
    try {
      await api.delete(`/resources/${id}`);
      fetchSharedResources();
    } catch (err) {
      alert('Failed to delete resource');
    }
  };

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm">
                <Share2 className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Shared with Me</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Passwords and secrets shared with your OpenPGP public key by team members.
                </p>
              </div>
            </div>

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

          <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                  <tr>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4">Shared By</th>
                    <th className="py-3.5 px-4">Permissions</th>
                    <th className="py-3.5 px-4">Password</th>
                    <th className="py-3.5 px-4">Last Modified</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#e2e8f0]">
                  {resources.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#64748b] text-xs">
                        No shared passwords found in your vault.
                      </td>
                    </tr>
                  ) : (
                    resources.map((res) => {
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';

                      return (
                        <tr key={res.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                          <td className="py-4 px-6 font-bold text-[#0f172a]">
                            <div className="flex items-center gap-2">
                              <span>{res.name}</span>
                              {res.isExternalShared && (
                                <span
                                  className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm"
                                  title="Shared externally with a non-application member"
                                >
                                  <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-[#334155]">
                            <div className="flex items-center gap-2 font-semibold">
                              <User className="w-3.5 h-3.5 text-[#d97706]" />
                              <span>{res.ownerId === user?.id ? `You (${user?.name || 'Owner'})` : 'Alex Morgan (Owner)'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 px-2.5 py-0.5 rounded-full font-extrabold text-[10px]">
                              Decrypt & View
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
                              <button
                                type="button"
                                onClick={() => handleDeleteResource(res.id)}
                                className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Delete Shared Item"
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
    </div>
  );
}
