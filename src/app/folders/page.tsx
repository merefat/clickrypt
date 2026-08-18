'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { Folder, Plus, FolderPlus, Trash2, Edit2, Shield, Eye, EyeOff, Copy } from 'lucide-react';
import api from '@/lib/api';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import CreateFolderModal from '@/components/CreateFolderModal';

export default function FoldersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderItems, setFolderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

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
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#f39c12]/50 flex items-center justify-center text-[#d97706] shadow-sm">
                <Folder className="w-5 h-5 text-[#d97706]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Folders Management</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Organize password items into structured categories and teams.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsFolderModalOpen(true)}
              className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Folders List */}
            <div className="glass-panel rounded-2xl p-5 border border-[#d0dbe5] bg-[#ffffff] space-y-3 shadow-xl">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#334155] pb-2 border-b border-[#cbd5e1]">
                <span>WORKPLACE FOLDERS ({folders.length})</span>
              </div>

              <div className="space-y-2">
                {folders.length === 0 ? (
                  <p className="text-xs text-[#64748b] py-6 text-center">No workplace folders found.</p>
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
                          <div className="flex items-center gap-3">
                            <Folder className={`w-5 h-5 ${isSelected ? 'text-[#1fbbd2]' : 'text-[#64748b]'}`} />
                            <div>
                              <h3 className="text-sm font-extrabold text-[#0f172a]">{f.name}</h3>
                              <p className="text-[11px] text-[#64748b] line-clamp-1">{f.description}</p>
                            </div>
                          </div>

                          <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            {f.itemCount} items
                          </span>
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

                    <button
                      onClick={() => setIsDrawerOpen(true)}
                      className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Item to Folder</span>
                    </button>
                  </div>

                  {/* Folder Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                        <tr>
                          <th className="py-3 px-6">Resource Name</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[#e2e8f0]">
                        {folderItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-12 text-center text-[#64748b] text-xs">
                              No password items stored inside this folder yet.
                            </td>
                          </tr>
                        ) : (
                          folderItems.map((item) => (
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
                              <td className="py-4 px-4 text-[#64748b]">{item.category || 'General'}</td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-[#0284c7] font-extrabold text-[11px]">In Folder</span>
                              </td>
                            </tr>
                          ))
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
