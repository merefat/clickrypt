/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability */
'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { SortableListItem, SortableTableRow } from '@/components/SortableItem';
import { Folder, Plus, FolderPlus, Trash2, Eye, EyeOff, Copy, Check } from 'lucide-react';
import api from '@/lib/api';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { decryptBestSecret } from '@/lib/crypto';
import { resolveBestSecret } from '@/lib/secretResolver';
import CreateFolderModal from '@/components/CreateFolderModal';
import UnlockVaultModal from '@/components/UnlockVaultModal';

export default function FoldersPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey, unlockVault } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderItems, setFolderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<'reveal' | 'copy' | null>(null);
  const [pendingUnlockItem, setPendingUnlockItem] = useState<any | null>(null);

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

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [dragOver, setDragOver] = useState<{ id: string | null; type: string | null }>({ id: null, type: null });

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Reorder folders
    if (activeType === 'folder' && overType === 'folder') {
      if (active.id === over.id) return;
      const oldIndex = folders.findIndex((f) => f.id === active.id);
      const newIndex = folders.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const previous = [...folders];
      const reordered = arrayMove(previous, oldIndex, newIndex);
      setFolders(reordered);
      try {
        await api.put('/folders/reorder', { ids: reordered.map((f) => f.id) });
      } catch (err) {
        setFolders(previous);
        alert('Failed to save folder order');
      }
      return;
    }

    // Reorder resources inside the current folder
    if (activeType === 'resource' && overType === 'resource') {
      if (active.id === over.id) return;
      const oldIndex = folderItems.findIndex((r) => r.id === active.id);
      const newIndex = folderItems.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const previous = [...folderItems];
      const reordered = arrayMove(previous, oldIndex, newIndex);
      setFolderItems(reordered);
      try {
        await api.put('/resources/reorder', { ids: reordered.map((r) => r.id) });
      } catch (err) {
        setFolderItems(previous);
        alert('Failed to save resource order');
      }
      return;
    }

    // Move resource into another folder
    if (activeType === 'resource' && overType === 'folder') {
      const resourceId = active.id as string;
      const targetFolderId = over.id as string;
      const item = folderItems.find((r) => r.id === resourceId);
      if (!item || item.folderId === targetFolderId) return;

      const previousItems = [...folderItems];
      setFolderItems(previousItems.filter((r) => r.id !== resourceId));

      setFolders((prev) =>
        prev.map((f) => {
          if (f.id === targetFolderId) return { ...f, itemCount: (f.itemCount || 0) + 1 };
          if (f.id === item.folderId) return { ...f, itemCount: Math.max((f.itemCount || 0) - 1, 0) };
          return f;
        })
      );

      try {
        await api.put(`/resources/${resourceId}`, { folderId: targetFolderId });
        if (selectedFolderId) fetchFolderItems(selectedFolderId);
        fetchFolders();
      } catch (err) {
        setFolderItems(previousItems);
        fetchFolders();
        alert('Failed to move resource');
      }
    }
  };

  const handleDragOver = (event: any) => {
    const over = event.over;
    const id = over?.id || null;
    const type = over?.data?.current?.type || null;
    setDragOver((prev) => (prev.id === id && prev.type === type ? prev : { id, type }));
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

  const performReveal = async (item: any, privateKeyOverride?: string) => {
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey) throw new Error('Key or encrypted data missing');

    const userSecret = resolveBestSecret(item, user?.id, user?.role);
    if (!userSecret) throw new Error('No usable secret for this user');

    const plainText = await decryptBestSecret(userSecret, item.secrets, user?.role, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
    setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
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

    if (!unlockedPgpKey && !masterPassword) {
      setPendingUnlockAction('reveal');
      setPendingUnlockItem(item);
      setShowUnlockModal(true);
      return;
    }

    try {
      await performReveal(item);
    } catch (err) {
      console.error('Reveal failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt.');
    }
  };

  const performCopy = async (item: any, privateKeyOverride?: string) => {
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey) throw new Error('Key or encrypted data missing');

    const userSecret = resolveBestSecret(item, user?.id, user?.role);
    if (!userSecret) throw new Error('No usable secret for this user');

    return await decryptBestSecret(userSecret, item.secrets, user?.role, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
  };

  const handleCopyPassword = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (plainText) {
      await navigator.clipboard.writeText(plainText);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      return;
    }

    if (!unlockedPgpKey && !masterPassword) {
      setPendingUnlockAction('copy');
      setPendingUnlockItem(item);
      setShowUnlockModal(true);
      return;
    }

    try {
      plainText = await performCopy(item);
    } catch (err) {
      console.error('Copy failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt.');
      return;
    }

    await navigator.clipboard.writeText(plainText);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUnlockSubmit = async (password: string) => {
    const privateKey = await unlockVault(password);
    if (!privateKey) return false;
    setShowUnlockModal(false);

    try {
      if (pendingUnlockAction === 'reveal' && pendingUnlockItem) {
        await performReveal(pendingUnlockItem, privateKey);
      } else if (pendingUnlockAction === 'copy' && pendingUnlockItem) {
        const plainText = await performCopy(pendingUnlockItem, privateKey);
        await navigator.clipboard.writeText(plainText);
        setCopiedId(pendingUnlockItem.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      alert('Failed to decrypt.');
    }

    setPendingUnlockAction(null);
    setPendingUnlockItem(null);
    return true;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto">
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

          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
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
                  <SortableContext items={folders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    {folders.map((f) => {
                      const isSelected = f.id === selectedFolderId;
                      return (
                        <SortableListItem
                          key={f.id}
                          id={f.id}
                          onClick={() => setSelectedFolderId(f.id)}
                          data={{ type: 'folder' }}
                          isOver={dragOver.id === f.id}
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
                                <p className="text-[11px] text-[#64748b] line-clamp-1">{f.creatorName}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                {f.itemCount || 0} items
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
                        </SortableListItem>
                      );
                    })}
                  </SortableContext>
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
                      <p className="text-xs text-[#64748b] mt-0.5">{selectedFolder.creatorName}</p>
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
                          <th className="py-3 px-2 w-10" />
                          <th className="py-3 px-6">Resource Name</th>
                          <th className="py-3 px-4">Username</th>
                          <th className="py-3 px-4">Password</th>
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
                          <SortableContext items={folderItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                            {folderItems.map((item) => {
                              const revealed = revealedPasswords[item.id];
                              return (
                                <SortableTableRow
                                  key={item.id}
                                  id={item.id}
                                  data={{ type: 'resource' }}
                                  className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100"
                                >
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
                              </SortableTableRow>
                            );
                          })}
                        </SortableContext>
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
          </DndContext>
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

      <UnlockVaultModal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setPendingUnlockAction(null);
          setPendingUnlockItem(null);
        }}
        onSubmit={handleUnlockSubmit}
      />
    </div>
  );
}
