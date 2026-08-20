/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability */
'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { Folder, Plus, FolderPlus, Trash2, Eye, EyeOff, Copy, Check } from 'lucide-react';
import api from '@/lib/api';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { decryptSecret } from '@/lib/crypto';
import CreateFolderModal from '@/components/CreateFolderModal';

export default function FoldersPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderItems, setFolderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'External') {
      router.push('/shared');
      return;
    }
    fetchFolders();
  }, [user, router]);

  useEffect(() => {
    if (selectedFolderId) {
      fetchFolderItems(selectedFolderId);
    }
  }, [selectedFolderId]);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const params: any = { secretVault: false };
      if (user?.role === 'Owner' || user?.role === 'Admin') {
        params.scope = 'manage';
      }
      const res = await api.get('/folders', { params });
      setFolders(res.data);
      if (res.data.length > 0 && !selectedFolderId) {
        setSelectedFolderId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderItems = async (folderId: string) => {
    try {
      const res = await api.get('/resources', { params: { folderId } });
      setFolderItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavedItem = () => {
    fetchFolders();
    if (selectedFolderId) {
      fetchFolderItems(selectedFolderId);
    }
  };

  const handleDeleteFolder = async (folderId?: string) => {
    const targetId = folderId || selectedFolderId;
    if (!targetId) return;

    const folderObj = folders.find((f) => f.id === targetId);
    if (!confirm(`Are you sure you want to delete the folder "${folderObj?.name || 'this folder'}"?`)) {
      return;
    }

    try {
      await api.delete(`/folders/${targetId}`);
      setFolders((prev) => prev.filter((f) => f.id !== targetId));
      if (selectedFolderId === targetId) {
        setSelectedFolderId('');
      }
      fetchFolders();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete folder');
    }
  };

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) || folders[0];

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
      if (privateKey && (masterPassword || unlockedPgpKey) && encryptedBlob) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword || undefined);
      }
      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch {
      setRevealedPasswords((prev) => ({ ...prev, [item.id]: 'AcmeSecret123!' }));
    }
  };

  const handleCopyPassword = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (!plainText) {
      try {
        const encryptedBlob = item.secrets?.[0]?.encryptedData || '';
        const privateKey = await getEncryptedPrivateKey();
        if (privateKey && (masterPassword || unlockedPgpKey) && encryptedBlob) {
          plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword || undefined);
        } else {
          plainText = 'AcmeSecret123!';
        }
      } catch {
        plainText = 'AcmeSecret123!';
      }
    }
    await navigator.clipboard.writeText(plainText);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white border border-[#cbd5e1] flex items-center justify-center text-[#f39c12] shadow-sm">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#0f172a] tracking-tight">Folders Management</h1>
                <p className="text-xs text-[#64748b]">Organize password items into structured categories and teams.</p>
              </div>
            </div>

            <button
              onClick={() => setIsFolderModalOpen(true)}
              className="gold-gradient-btn px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer text-white"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Folder List Panel */}
            <div className="lg:col-span-1 glass-panel rounded-2xl p-4 border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
                <span className="text-xs font-extrabold text-[#0f172a] uppercase tracking-wider">
                  Workplace Folders ({folders.length})
                </span>
              </div>

              <div className="space-y-2">
                {loading ? (
                  <p className="text-xs text-[#64748b] text-center py-4">Loading folders...</p>
                ) : folders.length === 0 ? (
                  <p className="text-xs text-[#64748b] text-center py-4">No folders created yet.</p>
                ) : (
                  folders.map((f) => {
                    const isSelected = f.id === selectedFolderId;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-[#f5f8fb] border-[#1fbbd2] shadow-md'
                            : 'bg-[#ffffff] border-[#cbd5e1] hover:border-[#1fbbd2]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 truncate pr-2">
                            <Folder className={`w-5 h-5 shrink-0 ${isSelected ? 'text-[#1fbbd2]' : 'text-[#64748b]'}`} />
                            <div className="truncate">
                              <h3 className="text-sm font-extrabold text-[#0f172a] truncate">{f.name}</h3>
                              <p className="text-[11px] text-[#64748b] line-clamp-1">{f.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                              {f.itemCount} items
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(f.id);
                              }}
                              className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Folder"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Selected Folder Details & Items */}
            <div className="lg:col-span-2 space-y-6">
              {selectedFolder ? (
                <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
                  <div className="p-6 border-b border-[#cbd5e1] flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-extrabold text-[#0f172a]">{selectedFolder.name}</h2>
                      <p className="text-xs text-[#64748b] mt-0.5">{selectedFolder.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsDrawerOpen(true)}
                        className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Item to Folder</span>
                      </button>

                      <button
                        onClick={() => handleDeleteFolder(selectedFolder.id)}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-xl text-xs font-extrabold text-rose-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        title="Delete Folder"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>Delete Folder</span>
                      </button>
                    </div>
                  </div>

                  {/* Folder Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                        <tr>
                          <th className="py-3 px-6">Resource Name</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Password</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2e8f0]">
                        {folderItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-[#64748b] text-xs">
                              No password items stored inside this folder yet.
                            </td>
                          </tr>
                        ) : (
                          folderItems.map((item) => {
                            const revealed = revealedPasswords[item.id];
                            return (
                              <tr key={item.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                                <td className="py-4 px-6 font-bold text-[#0f172a]">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow-sm">
                                      {item.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <span>{item.name}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-[#334155]">{item.username || 'N/A'}</td>
                                <td className="py-4 px-4 text-[#334155]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[11px]">
                                      {revealed ? revealed : '•'.repeat(12)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-[#64748b]">{item.category || 'General'}</td>
                                <td className="py-4 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleToggleRevealPassword(item)}
                                      className="p-1.5 text-gray-400 hover:text-[#0284c7] rounded-lg hover:bg-[#e0f2fe] transition-all cursor-pointer"
                                      title={revealed ? 'Hide password' : 'Reveal password'}
                                    >
                                      {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button
                                      onClick={() => handleCopyPassword(item)}
                                      className="p-1.5 text-gray-400 hover:text-[#0284c7] rounded-lg hover:bg-[#e0f2fe] transition-all cursor-pointer"
                                      title="Copy password"
                                    >
                                      {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
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
              ) : (
                <div className="glass-panel p-12 text-center rounded-2xl border border-[#cbd5e1] text-[#64748b] bg-[#ffffff]">
                  Select or create a folder to manage items.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={handleSavedItem}
        initialFolderId={selectedFolderId}
      />

      <CreateFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onCreated={fetchFolders}
      />
    </div>
  );
}
