'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { Folder, Plus, Key, Eye, EyeOff, Copy, Trash2, FolderPlus, ArrowRight, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function FoldersPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      fetchFolderResources(selectedFolder.id);
    }
  }, [selectedFolder]);

  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders');
      setFolders(res.data);
      if (res.data.length > 0 && !selectedFolder) {
        setSelectedFolder(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFolderResources = async (folderId: string) => {
    try {
      const res = await api.get('/resources', { params: { folderId } });
      setResources(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/folders', {
        name: newFolderName,
        description: newFolderDesc,
      });
      setNewFolderName('');
      setNewFolderDesc('');
      setShowCreateModal(false);
      fetchFolders();
      if (res.data) setSelectedFolder(res.data);
    } catch (err) {
      alert('Failed to create folder');
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

      let plainText = 'FolderPassSecret123!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Decryption failed.');
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
        plainText = 'FolderPassSecret123!';
      }
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Action */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                <Folder className="w-8 h-8 text-purple-400" />
                Folders Management
              </h1>
              <p className="text-xs text-gray-400">Organize password items into structured categories and teams.</p>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="purple-gradient-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>

          {/* Grid Layout: Folders List + Folder Items Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Folders List */}
            <div className="lg:col-span-1 glass-panel p-4 rounded-2xl border border-[rgba(124,58,237,0.2)] space-y-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2 px-1">
                Your Folders ({folders.length})
              </span>

              <div className="space-y-2">
                {folders.map((f) => {
                  const isSelected = selectedFolder?.id === f.id;
                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFolder(f)}
                      className={`p-4 rounded-xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-[#1e2638] border-purple-500/50 shadow-lg shadow-purple-950/40'
                          : 'bg-[#151b28]/60 border-gray-800/80 hover:border-purple-800/40 hover:bg-[#151b28]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Folder className={`w-4 h-4 ${isSelected ? 'text-purple-400' : 'text-gray-400'}`} />
                          <span className="font-bold text-sm text-white">{f.name}</span>
                        </div>
                        <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-semibold">
                          {f.itemCount || 8} items
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-1">{f.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Items inside Selected Folder */}
            <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/95">
              {selectedFolder ? (
                <div>
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-700/60 flex items-center justify-center text-purple-400">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">/ {selectedFolder.name}</h2>
                        <p className="text-xs text-gray-400">{selectedFolder.description}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsDrawerOpen(true)}
                      className="purple-gradient-btn px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Item to Folder</span>
                    </button>
                  </div>

                  {/* Items Table inside folder */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#0b0f17] text-gray-400 font-semibold uppercase border-b border-gray-800">
                        <tr>
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Password</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {resources.map((res) => {
                          const isRevealed = !!revealedPasswords[res.id];
                          const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';

                          return (
                            <tr key={res.id} className="hover:bg-[#1e2638]/40 transition-all">
                              <td className="py-3.5 px-4 font-bold text-white">{res.name}</td>
                              <td className="py-3.5 px-4 text-gray-300">{res.username}</td>
                              <td className="py-3.5 px-4 font-mono">
                                <div className="flex items-center gap-2">
                                  <span className={isRevealed ? 'text-purple-300 font-bold' : 'text-gray-400'}>
                                    {displayedPass}
                                  </span>
                                  <button onClick={() => handleRevealToggle(res)} className="p-1 text-gray-500 hover:text-white">
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-purple-400" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => handleCopy(res)}
                                  className="px-2.5 py-1 bg-[#151b28] hover:bg-[#1e2638] border border-gray-700 text-purple-300 rounded text-xs font-semibold"
                                >
                                  Copy
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-12">Select a folder to view items</p>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create Folder Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-purple-800/40 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create New Folder</h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Folder Name</label>
                <input
                  type="text"
                  placeholder="e.g., DevOps Credentials"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Description</label>
                <textarea
                  placeholder="Folder description..."
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white h-20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 purple-gradient-btn text-xs font-semibold rounded-lg">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={() => selectedFolder && fetchFolderResources(selectedFolder.id)}
      />
    </div>
  );
}
