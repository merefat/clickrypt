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
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-[#0f172a]">Passwords</h1>
              <span className="bg-[#ffffff] text-[#475569] border border-[#cbd5e1] text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                {resources.length} items
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Folder Selector Filter with Readable Dropdown Styling */}
              <div className="flex items-center gap-2 bg-[#ffffff] border border-[#cbd5e1] px-3 py-2 rounded-xl text-xs shadow-sm">
                <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="bg-[#ffffff] text-[#0f172a] font-bold focus:outline-none cursor-pointer font-sora"
                >
                  <option value="" className="bg-[#ffffff] text-[#0f172a]">All Folders</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#ffffff] text-[#0f172a]">
                      / {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={fetchResources}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl text-[#475569] transition-all shadow-sm cursor-pointer"
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
                className="gold-cyan-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 disabled:opacity-50 text-white shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Password</span>
              </button>
            </div>
          </div>

          {/* EXPIRED SUBSCRIPTION LOCKOUT SCREEN */}
          {isExpired ? (
            <div className="glass-panel p-12 rounded-2xl border border-rose-300 bg-[#ffffff] text-center shadow-2xl my-8">
              <div className="w-20 h-20 rounded-full bg-rose-100 border border-rose-300 text-rose-600 flex items-center justify-center mx-auto mb-6">
                <Lock className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-extrabold text-[#0f172a] mb-2">
                Organization Vault Access Locked
              </h2>
              <p className="text-sm text-[#475569] max-w-lg mx-auto mb-6">
                Your Organization Subscription credit has expired ({subscription?.renewalDate || 'Today'}). Access to passwords and secrets is currently locked for all team members.
              </p>

              <div className="bg-[#f8fafc] max-w-md mx-auto p-4 rounded-xl border border-[#cbd5e1] text-xs text-left mb-6 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Lockout Status:</span>
                  <span className="text-rose-600 font-bold">Credit Finished (Expired)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Affected Accounts:</span>
                  <span className="text-[#0f172a] font-bold">Owner, Admins & Users</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Required Action:</span>
                  <span className="text-[#d97706] font-bold">Pay Bill via Stripe Credit Card</span>
                </div>
              </div>

              <Link
                href="/pay"
                className="gold-gradient-btn px-8 py-3.5 rounded-xl text-sm font-extrabold inline-flex items-center gap-3 shadow-xl text-white"
              >
                <CreditCard className="w-5 h-5" />
                <span>Pay Subscription Bill via Stripe Now</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          ) : (
            /* Passwords Data Table Card */
            <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                    <tr>
                      <th className="py-3.5 px-6">Name</th>
                      <th className="py-3.5 px-4">Username</th>
                      <th className="py-3.5 px-4">URL</th>
                      <th className="py-3.5 px-4">Password</th>
                      <th className="py-3.5 px-4">Last modified</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e2e8f0]">
                    {resources.map((res) => {
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';

                      return (
                        <tr
                          key={res.id}
                          className="hover:bg-[#f1f6fb] transition-all group border-b border-gray-100"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow">
                                {res.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-[#0f172a] text-sm group-hover:text-[#1fbbd2] transition-colors">
                                    {res.name}
                                  </p>
                                  {res.isExternalShared && (
                                    <span
                                      className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm"
                                      title="Shared externally with a non-application member"
                                    >
                                      <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#64748b]">{res.username || 'alex.doe'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#334155] font-medium">{res.username || 'alex.doe'}</td>

                          <td className="py-4 px-4">
                            <a
                              href={`https://${res.url}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#0284c7] hover:underline flex items-center gap-1.5 truncate max-w-[140px]"
                            >
                              <span>{res.url}</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#f39c12]" />
                            </a>
                          </td>

                          <td className="py-4 px-4 font-mono">
                            <div className="flex items-center gap-2">
                              <span className={isRevealed ? 'text-[#d97706] font-extrabold' : 'text-[#64748b]'}>
                                {displayedPass}
                              </span>
                              <button
                                onClick={() => handleRevealToggle(res)}
                                className="p-1 text-gray-500 hover:text-[#1fbbd2]"
                                title={isRevealed ? 'Hide' : 'Reveal'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-[#1fbbd2]" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleCopy(res)}
                                className="p-1 text-gray-500 hover:text-[#0f172a]"
                                title="Copy to clipboard"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#64748b] text-[11px]">{res.lastModified}</td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setShareResourceId(res.id)}
                                className="p-1.5 text-gray-500 hover:text-[#1fbbd2] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                title="Share secret"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingItem(res);
                                  setIsDrawerOpen(true);
                                }}
                                className="p-1.5 text-gray-500 hover:text-[#d97706] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                title="Edit item"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(res.id)}
                                className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
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

              <div className="p-4 bg-[#f8fafc] border-t border-[#cbd5e1] flex items-center justify-between text-xs text-[#64748b]">
                <span>Showing 1 to {resources.length} of {resources.length} items</span>

                <div className="flex items-center gap-1.5">
                  <button className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] rounded-lg hover:bg-[#f1f5f9]">
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
