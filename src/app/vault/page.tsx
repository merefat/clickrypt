'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import ShareModal from '@/components/ShareModal';
import {
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Share2,
  Lock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit2,
  Trash2,
  Folder,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  Globe,
  ShieldCheck
} from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function VaultPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFolders();
    fetchSubscription();
  }, []);

  useEffect(() => {
    fetchResources();
  }, [searchTerm, selectedFolderId]);

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/subscription');
      setSubscription(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders');
      setFolders(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params: any = { search: searchTerm, secretVault: false };
      if (selectedFolderId) params.folderId = selectedFolderId;
      const res = await api.get('/resources', { params });
      setResources(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDemoExpiry = async () => {
    const nextAction = subscription?.status === 'Expired' ? 'RENEW' : 'EXPIRE_DEMO';
    try {
      const res = await api.post('/subscription', { action: nextAction });
      setSubscription(res.data.subscription);
      fetchResources();
    } catch (err) {
      alert('Failed to toggle demo status');
    }
  };

  const handleRevealToggle = async (item: any) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    try {
      const encryptedBlob = item.secrets[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();

      let plainText = 'AcmeSecret123!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Failed to decrypt.');
    }
  };

  const handleCopy = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (!plainText) {
      const encryptedBlob = item.secrets[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      } else {
        plainText = 'AcmeSecret123!';
      }
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this password?')) return;
    await api.delete(`/resources/${id}`);
    fetchResources();
  };

  const isExpired = subscription && (subscription.status === 'Expired' || subscription.daysRemaining <= 0);

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white">Passwords</h1>
              <span className="bg-[#17283b] text-gray-300 border border-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {resources.length} items
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Folder Selector Filter with Readable Dropdown Styling */}
              <div className="flex items-center gap-2 bg-[#17283b] border border-[rgba(31,187,210,0.3)] px-3 py-2 rounded-xl text-xs shadow">
                <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="bg-[#17283b] text-white focus:outline-none cursor-pointer font-sora"
                >
                  <option value="" className="bg-[#17283b] text-white">All Folders</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#17283b] text-white">
                      / {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={fetchResources}
                className="p-2.5 bg-[#17283b] hover:bg-[#1e2638] border border-[rgba(31,187,210,0.3)] rounded-xl text-gray-300 transition-all shadow"
                title="Refresh Vault"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsDrawerOpen(true);
                }}
                disabled={isExpired}
                className="purple-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 disabled:opacity-50 text-[#0d1724]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Password</span>
              </button>
            </div>
          </div>

          {/* EXPIRED SUBSCRIPTION LOCKOUT SCREEN */}
          {isExpired ? (
            <div className="glass-panel p-12 rounded-2xl border border-rose-500/40 bg-gradient-to-b from-[#17283b] to-[#0d111a] text-center shadow-2xl my-8">
              <div className="w-20 h-20 rounded-full bg-rose-950 border border-rose-700 text-rose-400 flex items-center justify-center mx-auto mb-6 glow-red">
                <Lock className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-extrabold text-white mb-2">
                Organization Vault Access Locked
              </h2>
              <p className="text-sm text-gray-300 max-w-lg mx-auto mb-6">
                Your Organization Subscription credit has expired ({subscription?.renewalDate || 'Today'}). Access to passwords and secrets is currently locked for all team members.
              </p>

              <div className="bg-[#0d1724] max-w-md mx-auto p-4 rounded-xl border border-gray-700 text-xs text-left mb-6 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Lockout Status:</span>
                  <span className="text-rose-400 font-bold">Credit Finished (Expired)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Affected Accounts:</span>
                  <span className="text-white font-bold">Owner, Admins & Users</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Required Action:</span>
                  <span className="text-[#f39c12] font-bold">Pay Bill via Stripe Credit Card</span>
                </div>
              </div>

              <Link
                href="/pay"
                className="gold-cyan-gradient-btn px-8 py-3.5 rounded-xl text-sm font-extrabold inline-flex items-center gap-3 shadow-xl text-[#0d1724]"
              >
                <CreditCard className="w-5 h-5" />
                <span>Pay Subscription Bill via Stripe Now</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          ) : (
            /* Passwords Data Table Card */
            <div className="glass-panel rounded-2xl border border-[rgba(31,187,210,0.25)] overflow-hidden shadow-2xl bg-[#17283b]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1724]/90 text-gray-300 font-bold uppercase tracking-wider border-b border-gray-700">
                    <tr>
                      <th className="py-3.5 px-6">Name</th>
                      <th className="py-3.5 px-4">Username</th>
                      <th className="py-3.5 px-4">URL</th>
                      <th className="py-3.5 px-4">Password</th>
                      <th className="py-3.5 px-4">Last modified</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-700/60">
                    {resources.map((res) => {
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';

                      return (
                        <tr
                          key={res.id}
                          className="hover:bg-[#0d1724]/60 transition-all group border-b border-gray-700/40"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold text-xs shadow">
                                {res.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-white text-sm group-hover:text-[#1fbbd2] transition-colors">
                                    {res.name}
                                  </p>
                                  {res.isExternalShared && (
                                    <span
                                      className="bg-amber-950/80 text-amber-400 border border-amber-600/60 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1 shadow"
                                      title="Shared externally with a non-application member"
                                    >
                                      <Globe className="w-3 h-3 text-amber-400" />
                                      <span>Shared Externally</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-400">{res.username || 'alex.doe'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-gray-300 font-medium">{res.username || 'alex.doe'}</td>

                          <td className="py-4 px-4">
                            <a
                              href={`https://${res.url}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gray-300 hover:text-[#1fbbd2] flex items-center gap-1.5 truncate max-w-[140px]"
                            >
                              <span>{res.url}</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#f39c12]" />
                            </a>
                          </td>

                          <td className="py-4 px-4 font-mono">
                            <div className="flex items-center gap-2">
                              <span className={isRevealed ? 'text-[#f39c12] font-extrabold' : 'text-gray-400'}>
                                {displayedPass}
                              </span>
                              <button
                                onClick={() => handleRevealToggle(res)}
                                className="p-1 text-gray-400 hover:text-white"
                                title={isRevealed ? 'Hide' : 'Reveal'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-[#1fbbd2]" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleCopy(res)}
                                className="p-1 text-gray-400 hover:text-white"
                                title="Copy to clipboard"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-gray-400 text-[11px]">{res.lastModified}</td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setShareResourceId(res.id)}
                                className="p-1.5 text-gray-400 hover:text-[#1fbbd2] hover:bg-[#0d1724] rounded-lg transition-all"
                                title="Share secret"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingItem(res);
                                  setIsDrawerOpen(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-[#f39c12] hover:bg-[#0d1724] rounded-lg transition-all"
                                title="Edit item"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(res.id)}
                                className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-[#0d1724] rounded-lg transition-all"
                                title="Delete item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-[#0d1724]/80 border-t border-gray-700 flex items-center justify-between text-xs text-gray-400">
                <span>Showing 1 to {resources.length} of {resources.length} items</span>

                <div className="flex items-center gap-1.5">
                  <button className="p-1.5 bg-[#17283b] border border-gray-700 rounded-lg hover:bg-gray-800">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="w-7 h-7 gold-cyan-gradient-btn text-[#0d1724] font-extrabold rounded-lg flex items-center justify-center">
                    1
                  </button>
                  <button className="p-1.5 bg-[#17283b] border border-gray-700 rounded-lg hover:bg-gray-800">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={fetchResources}
        editItem={editingItem}
      />

      <ShareModal resourceId={shareResourceId} onClose={() => setShareResourceId(null)} />
    </div>
  );
}
