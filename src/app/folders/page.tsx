'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { Folder, Plus, FolderPlus, Trash2, Edit2, Shield, Eye, EyeOff, Copy } from 'lucide-react';
import api from '@/lib/api';

export default function FoldersPage() {
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderItems, setFolderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      fetchFolderItems(selectedFolderId);
    }
  }, [selectedFolderId]);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/folders', { params: { secretVault: false } });
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

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) || folders[0];

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#f39c12]/40 flex items-center justify-center text-[#f39c12] shadow">
                <Folder className="w-5 h-5 text-[#f39c12]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Folders Management</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Organize password items into structured categories and teams.
                </p>
              </div>
            </div>

            <button
              onClick={async () => {
                const folderName = prompt('Enter new Workplace Folder Name:');
                if (!folderName) return;
                try {
                  await api.post('/folders', { name: folderName, isPrivateOnly: false });
                  fetchFolders();
                } catch (e) {
                  alert('Error creating folder');
                }
              }}
              className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Folders List */}
            <div className="glass-panel rounded-2xl p-5 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-gray-300 pb-2 border-b border-gray-700">
                <span>WORKPLACE FOLDERS ({folders.length})</span>
              </div>

              <div className="space-y-2">
                {folders.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">No workplace folders found.</p>
                ) : (
                  folders.map((f) => {
                    const isSelected = f.id === selectedFolderId;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-[#0d1724] border-[#f39c12] shadow-lg'
                            : 'bg-[#0d1724]/60 border-gray-700/60 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Folder className={`w-5 h-5 ${isSelected ? 'text-[#f39c12]' : 'text-gray-400'}`} />
                            <div>
                              <h3 className="text-sm font-bold text-white">{f.name}</h3>
                              <p className="text-[11px] text-gray-400 line-clamp-1">{f.description}</p>
                            </div>
                          </div>

                          <span className="bg-[#17283b] text-[#1fbbd2] border border-[#1fbbd2]/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {f.itemCount} items
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Selected Folder Items */}
            {selectedFolder ? (
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] flex flex-col">
                <div className="flex items-center justify-between pb-6 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold shadow">
                      <Folder className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">/ {selectedFolder.name}</h2>
                      <p className="text-xs text-gray-400">{selectedFolder.description}</p>
                    </div>
                  </div>

                  {/* ADD ITEM TO FOLDER BUTTON */}
                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-[#0d1724] shadow cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Item to Folder</span>
                  </button>
                </div>

                <div className="mt-6 flex-1">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#0d1724]/90 text-gray-300 font-bold uppercase tracking-wider border-b border-gray-700">
                        <tr>
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Password</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700/60">
                        {folderItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-gray-400 text-xs">
                              No items in this folder yet. Click "Add Item to Folder" to organize secrets.
                            </td>
                          </tr>
                        ) : (
                          folderItems.map((item) => (
                            <tr key={item.id} className="hover:bg-[#0d1724]/60 transition-all border-b border-gray-700/40">
                              <td className="py-3.5 px-4 font-bold text-white">{item.name}</td>
                              <td className="py-3.5 px-4 text-gray-300">{item.username || 'alex.morgan'}</td>
                              <td className="py-3.5 px-4 font-mono text-gray-400">••••••••</td>
                              <td className="py-3.5 px-4 text-right">
                                <button className="p-1 text-gray-400 hover:text-white">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lg:col-span-2 glass-panel rounded-2xl p-12 text-center text-gray-400 text-xs bg-[#17283b]">
                <Folder className="w-12 h-12 text-gray-500 mx-auto mb-3 opacity-50" />
                <p>No workplace folders available. Click "Create Folder" to organize items.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* PASSWORD DRAWER INTEGRATION */}
      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={handleSavedItem}
        isSecretVault={false}
        defaultFolderId={selectedFolderId}
      />
    </div>
  );
}
