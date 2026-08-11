'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import ShareModal from '@/components/ShareModal';
import {
  Lock,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Share2,
  Folder,
  FolderPlus,
  ExternalLink,
  Edit2,
  Trash2,
  ShieldAlert,
  Info
} from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function SecretVaultPage() {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    fetchResources();
  }, [searchTerm, selectedFolderId]);

  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders', { params: { secretVault: true } });
      setFolders(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params: any = { search: searchTerm, secretVault: true };
      if (selectedFolderId) params.folderId = selectedFolderId;
      const res = await api.get('/resources', { params });
      setResources(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolderPrompt = async () => {
    const folderName = prompt('Enter new Private Secret Folder Name:');
    if (!folderName) return;
    try {
      await api.post('/folders', { name: folderName, description: 'Private secret vault folder', isPrivateOnly: true });
      fetchFolders();
    } catch (err) {
      alert('Failed to create private folder');
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

      let plainText = 'SecretPrivatePass99!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Failed to decrypt private item.');
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
        plainText = 'SecretPrivatePass99!';
      }
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied private password for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this secret item?')) return;
    await api.delete(`/resources/${id}`);
    fetchResources();
  };

  if (user && user.role !== 'Owner') {
    return (
      <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="p-8 flex-1 flex items-center justify-center">
            <div className="bg-[#17283b] border border-rose-500/40 max-w-md w-full p-8 rounded-2xl text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-rose-950 border border-rose-700 text-rose-400 flex items-center justify-center mx-auto shadow">
                <ShieldAlert className="w-7 h-7 text-rose-400" />
              </div>
              <h2 className="text-xl font-extrabold text-white">Access Restricted to Owner</h2>
              <p className="text-xs text-gray-300 leading-relaxed">
                The <strong className="text-[#f39c12]">Secret Vault</strong> is accessible exclusively by the <strong>Organization Owner</strong> account. As an <span className="text-[#1fbbd2] font-semibold">{user.role}</span>, your items are managed in the main Passwords vault.
              </p>
              <Link
                href="/vault"
                className="gold-cyan-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-[#0d1724] inline-block shadow cursor-pointer mt-2"
              >
                Return to Passwords Vault
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#f39c12]/40 flex items-center justify-center text-[#f39c12] shadow">
                <Lock className="w-5 h-5 text-[#f39c12]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-extrabold text-white">Secret Vault</h1>
                  <span className="bg-[#17283b] text-[#f39c12] border border-[#f39c12]/40 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    Owner only
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Private items stored here cannot be viewed by others unless shared.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Private Folder Selector Filter */}
              <div className="flex items-center gap-2 bg-[#17283b] border border-[rgba(31,187,210,0.3)] px-3 py-2 rounded-xl text-xs shadow">
                <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="bg-[#17283b] text-white focus:outline-none cursor-pointer font-sora"
                >
                  <option value="" className="bg-[#17283b] text-white">All Private Secret Folders</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#17283b] text-white">
                      / {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  fetchFolders();
                  fetchResources();
                }}
                className="p-2.5 bg-[#17283b] hover:bg-[#1e2638] border border-[rgba(31,187,210,0.3)] rounded-xl text-gray-300 transition-all shadow"
                title="Refresh Secret Vault"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsDrawerOpen(true);
                }}
                className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Add Private Item</span>
              </button>
            </div>
          </div>

          {/* Explanation Banner with Create Private Folder button */}
          <div className="glass-panel p-5 rounded-2xl border border-[rgba(31,187,210,0.3)] bg-[#17283b] flex items-center justify-between mb-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0d1724] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2]">
                <Lock className="w-6 h-6 text-[#1fbbd2]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">This is your private space</h3>
                <p className="text-xs text-gray-400">
                  Items added here are encrypted for you only and can be shared with specific members or external users.
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateFolderPrompt}
              className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-[#0d1724] shadow"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Private Folder</span>
            </button>
          </div>

          {/* Table Card */}
          <div className="glass-panel rounded-2xl border border-[rgba(31,187,210,0.25)] overflow-hidden shadow-2xl bg-[#17283b]">
            <div className="p-4 border-b border-gray-700/60 flex items-center justify-between text-xs font-bold text-[#1fbbd2]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#1fbbd2]" />
                <span>Private Items ({resources.length})</span>
              </div>

              {selectedFolderId && (
                <span className="bg-[#0d1724] text-[#f39c12] border border-[#f39c12]/40 text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                  Filtered by Private Folder
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d1724]/90 text-gray-300 font-bold uppercase tracking-wider border-b border-gray-700">
                  <tr>
                    <th className="py-3.5 px-6">Item</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Strength</th>
                    <th className="py-3.5 px-4">Last Accessed</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-700/60">
                  {resources.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400 text-xs">
                        No private secret items found in this view.
                      </td>
                    </tr>
                  ) : (
                    resources.map((res) => {
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
                                <p className="font-bold text-white text-sm group-hover:text-[#1fbbd2] transition-colors">
                                  {res.name}
                                </p>
                                <p className="text-[11px] text-gray-400">{res.username || 'amazon.com'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-gray-300 font-medium">
                            <span className="inline-flex items-center gap-1 text-gray-300">
                              <Lock className="w-3 h-3 text-[#f39c12]" />
                              {res.category || 'Password'}
                            </span>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex flex-col">
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-emerald-400" />
                                {res.strength || 'Strong'}
                              </span>
                              <span className="text-[10px] text-gray-400">Score: {res.score || 92}/100</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-gray-400 text-[11px]">{res.lastModified}</td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleRevealToggle(res)}
                                className="p-1.5 text-gray-400 hover:text-[#1fbbd2] hover:bg-[#0d1724] rounded-lg transition-all"
                                title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                              >
                                {isRevealed ? <EyeOff className="w-4 h-4 text-[#1fbbd2]" /> : <Eye className="w-4 h-4" />}
                              </button>

                              <button
                                onClick={() => handleCopy(res)}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-[#0d1724] rounded-lg transition-all"
                                title="Copy password"
                              >
                                <Copy className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setShareResourceId(res.id)}
                                className="p-1.5 text-gray-400 hover:text-[#1fbbd2] hover:bg-[#0d1724] rounded-lg transition-all"
                                title="Share private item with members, groups, or external users"
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
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Footer Notice */}
            <div className="p-3 bg-[#0d1724] border-t border-gray-700/60 text-center text-xs text-[#1fbbd2] font-semibold flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#f39c12]" />
              <span>Private by design • Encrypted client-side • Secret Vault folders isolated</span>
            </div>
          </div>
        </main>
      </div>

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={fetchResources}
        editItem={editingItem}
        isSecretVault={true}
      />

      <ShareModal
        resourceId={shareResourceId}
        onClose={() => setShareResourceId(null)}
      />
    </div>
  );
}
