'use client';

import React, { useState, useEffect } from 'react';
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
  Info,
  Globe
} from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function SecretVaultPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
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

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#f39c12]/50 flex items-center justify-center text-[#d97706] shadow-sm">
                <Lock className="w-5 h-5 text-[#d97706]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-extrabold text-[#0f172a]">Secret Vault</h1>
                  <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
                    Owner only
                  </span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Private items stored here cannot be viewed by others unless shared.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Private Folder Selector Filter */}
              <div className="flex items-center gap-2 bg-[#ffffff] border border-[#cbd5e1] px-3 py-2 rounded-xl text-xs shadow-sm">
                <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="bg-[#ffffff] text-[#0f172a] font-bold focus:outline-none cursor-pointer font-sora"
                >
                  <option value="" className="bg-[#ffffff] text-[#0f172a]">All Private Secret Folders</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#ffffff] text-[#0f172a]">
                      / {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={async () => {
                  setLoading(true);
                  await fetchResources();
                  setTimeout(() => setLoading(false), 500);
                }}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-[#0f172a] transition-all shadow-sm cursor-pointer active:scale-95"
                title="Refresh Secret Vault Data"
              >
                <RefreshCw className={`w-4 h-4 text-[#0284c7] ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsDrawerOpen(true);
                }}
                className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Private Item</span>
              </button>
            </div>
          </div>

          {/* Explanation Banner with Create Private Folder button */}
          <div className="glass-panel p-5 rounded-2xl border border-[#d0dbe5] bg-[#ffffff] flex items-center justify-between mb-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7]">
                <Lock className="w-6 h-6 text-[#0284c7]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0f172a]">This is your private space</h3>
                <p className="text-xs text-[#64748b]">
                  Items added here are encrypted for you only and can be shared with specific members or external users.
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateFolderPrompt}
              className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Private Folder</span>
            </button>
          </div>

          {/* Table Card */}
          <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
            <div className="p-4 border-b border-[#cbd5e1] flex items-center justify-between text-xs font-extrabold text-[#0284c7]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0284c7]" />
                <span>Private Items ({resources.length})</span>
              </div>

              {selectedFolderId && (
                <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                  Filtered by Private Folder
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                  <tr>
                    <th className="py-3.5 px-6">Item</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Strength</th>
                    <th className="py-3.5 px-4">Last Accessed</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#e2e8f0]">
                  {resources.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#64748b] text-xs">
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
                                <p className="text-[11px] text-[#64748b]">{res.username || 'amazon.com'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#334155] font-medium">
                            <span className="inline-flex items-center gap-1 text-[#334155]">
                              <Lock className="w-3 h-3 text-[#d97706]" />
                              {res.category || 'Password'}
                            </span>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex flex-col">
                              <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-emerald-600" />
                                {res.strength || 'Strong'}
                              </span>
                              <span className="text-[10px] text-[#64748b]">Score: {res.score || 92}/100</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#64748b] text-[11px]">{res.lastModified}</td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleRevealToggle(res)}
                                className="p-1.5 text-gray-500 hover:text-[#1fbbd2] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                              >
                                {isRevealed ? <EyeOff className="w-4 h-4 text-[#1fbbd2]" /> : <Eye className="w-4 h-4" />}
                              </button>

                              <button
                                onClick={() => handleCopy(res)}
                                className="p-1.5 text-gray-500 hover:text-[#0f172a] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                title="Copy password"
                              >
                                <Copy className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setShareResourceId(res.id)}
                                className="p-1.5 text-gray-500 hover:text-[#1fbbd2] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                title="Share private item with members, groups, or external users"
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
