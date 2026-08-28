'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Trash2,
  RotateCcw,
  Search,
  Filter,
  Folder,
  KeyRound,
  CreditCard,
  AlertTriangle,
  CheckSquare,
  Square,
  Check,
  X,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/context/AuthContext';
import FilterDropdown from '@/components/FilterDropdown';
import api from '@/lib/api';

export default function TrashPage() {
  useRequireAuth();
  const { user, appMode } = useAuth();

  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'passwords' | 'folders'>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Selection
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);

  // Modals
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'resource' | 'folder' | 'selected';
    id?: string;
    name?: string;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const fetchTrash = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/trash', {
        params: {
          search: searchTerm,
          category: categoryFilter,
        },
      });
      setResources(res.data.resources || []);
      setFolders(res.data.folders || []);
    } catch (err: any) {
      console.error('Failed to load trash items:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, [appMode, categoryFilter]);

  // Handle Search submit / debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTrash();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtered views based on activeTab
  const visibleResources = activeTab === 'folders' ? [] : resources;
  const visibleFolders = activeTab === 'passwords' ? [] : folders;

  const totalVisibleCount = visibleResources.length + visibleFolders.length;
  const totalSelectedCount = selectedResourceIds.length + selectedFolderIds.length;

  const isAllSelected =
    totalVisibleCount > 0 &&
    visibleResources.every((r) => selectedResourceIds.includes(r.id)) &&
    visibleFolders.every((f) => selectedFolderIds.includes(f.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedResourceIds([]);
      setSelectedFolderIds([]);
    } else {
      setSelectedResourceIds(visibleResources.map((r) => r.id));
      setSelectedFolderIds(visibleFolders.map((f) => f.id));
    }
  };

  const toggleSelectResource = (id: string) => {
    setSelectedResourceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectFolder = (id: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Restoration
  const handleRestoreSingleResource = async (id: string, name: string) => {
    setActionLoading(true);
    try {
      await api.post('/trash/restore', { resourceIds: [id] });
      showToast(`Restored "${name}" to your vault!`);
      setSelectedResourceIds((prev) => prev.filter((item) => item !== id));
      await fetchTrash();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to restore item');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreSingleFolder = async (id: string, name: string) => {
    setActionLoading(true);
    try {
      await api.post('/trash/restore', { folderIds: [id] });
      showToast(`Restored folder "${name}" and its child items!`);
      setSelectedFolderIds((prev) => prev.filter((item) => item !== id));
      await fetchTrash();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to restore folder');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkRestore = async () => {
    if (totalSelectedCount === 0) return;
    setActionLoading(true);
    try {
      await api.post('/trash/restore', {
        resourceIds: selectedResourceIds,
        folderIds: selectedFolderIds,
      });
      showToast(`Successfully restored ${totalSelectedCount} item(s)!`);
      setSelectedResourceIds([]);
      setSelectedFolderIds([]);
      await fetchTrash();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to restore selected items');
    } finally {
      setActionLoading(false);
    }
  };

  // Permanent Deletion
  const handleConfirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      if (deleteTarget.type === 'selected') {
        await api.delete('/trash', {
          data: {
            resourceIds: selectedResourceIds,
            folderIds: selectedFolderIds,
          },
        });
        showToast(`Permanently deleted ${totalSelectedCount} item(s).`);
        setSelectedResourceIds([]);
        setSelectedFolderIds([]);
      } else if (deleteTarget.type === 'resource' && deleteTarget.id) {
        await api.delete('/trash', {
          data: { resourceIds: [deleteTarget.id] },
        });
        showToast(`Permanently deleted "${deleteTarget.name}".`);
        setSelectedResourceIds((prev) => prev.filter((item) => item !== deleteTarget.id));
      } else if (deleteTarget.type === 'folder' && deleteTarget.id) {
        await api.delete('/trash', {
          data: { folderIds: [deleteTarget.id] },
        });
        showToast(`Permanently deleted folder "${deleteTarget.name}".`);
        setSelectedFolderIds((prev) => prev.filter((item) => item !== deleteTarget.id));
      }
      setShowPermanentDeleteModal(false);
      setDeleteTarget(null);
      await fetchTrash();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete permanently');
    } finally {
      setActionLoading(false);
    }
  };

  // Empty Trash
  const handleConfirmEmptyTrash = async () => {
    setActionLoading(true);
    try {
      await api.delete('/trash', {
        data: { emptyAll: true },
      });
      showToast('Trash emptied successfully.');
      setShowEmptyTrashModal(false);
      setSelectedResourceIds([]);
      setSelectedFolderIds([]);
      await fetchTrash();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to empty trash');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-[#0f172a] overflow-hidden font-sora selection:bg-[#1fbbd2]/20">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Toast Notification */}
          {notification && (
            <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-3 fade-in duration-200">
              <div className={`p-4 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-extrabold ${
                notification.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-500/10'
                  : 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-500/10'
              }`}>
                {notification.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{notification.message}</span>
              </div>
            </div>
          )}

          {/* Page Title & Stats */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-[#0f172a] tracking-tight">
                    Trash / Recycle Bin
                  </h1>
                  <p className="text-xs text-[#64748b] font-medium">
                    Deleted passwords, cards, and folders can be restored or permanently purged.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <button
                type="button"
                onClick={fetchTrash}
                disabled={refreshing}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                title="Refresh Trash"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#0284c7]' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {(resources.length > 0 || folders.length > 0) && (
                <button
                  type="button"
                  onClick={() => setShowEmptyTrashModal(true)}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-rose-600/20"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Empty Trash</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab Navigation & Controls */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* View Tabs */}
            <div className="flex items-center gap-1.5 bg-[#ffffff] p-1.5 rounded-2xl border border-[#cbd5e1] shadow-sm overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-[#0284c7] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                }`}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>All Trashed ({resources.length + folders.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('passwords')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'passwords'
                    ? 'bg-[#0284c7] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                }`}
              >
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>Passwords ({resources.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('folders')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'folders'
                    ? 'bg-[#0284c7] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                }`}
              >
                <Folder className="w-4 h-4 shrink-0" />
                <span>Folders ({folders.length})</span>
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search trashed items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0f172a] placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-sm"
                />
              </div>

              {activeTab !== 'folders' && (
                <FilterDropdown
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  icon={Filter}
                  options={[
                    { value: 'All', label: 'All Categories' },
                    { value: 'General', label: 'General' },
                    { value: 'Social', label: 'Social' },
                    { value: 'Finance', label: 'Finance' },
                    { value: 'Development', label: 'Development' },
                    { value: 'Cards', label: 'Cards' },
                  ]}
                />
              )}
            </div>
          </div>

          {/* Bulk Action Toolbar */}
          {totalSelectedCount > 0 && (
            <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
              <div className="flex items-center gap-2.5 text-xs font-extrabold text-[#0369a1]">
                <CheckSquare className="w-4 h-4 text-[#0284c7]" />
                <span>{totalSelectedCount} item{totalSelectedCount > 1 ? 's' : ''} selected</span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResourceIds([]);
                    setSelectedFolderIds([]);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#cbd5e1] text-[#475569] hover:text-[#0f172a] hover:bg-[#f8fafc] text-xs font-extrabold transition-all cursor-pointer shadow-xs"
                >
                  Deselect All
                </button>

                <button
                  type="button"
                  onClick={handleBulkRestore}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Selected ({totalSelectedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget({ type: 'selected' });
                    setShowPermanentDeleteModal(true);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Permanently ({totalSelectedCount})</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
            {loading ? (
              <div className="p-12 text-center text-xs text-[#64748b] font-extrabold flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0284c7]" />
                <span>Loading Trash...</span>
              </div>
            ) : totalVisibleCount === 0 ? (
              <div className="p-12 text-center bg-[#f8fafc] border border-dashed border-[#cbd5e1] rounded-2xl space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 mx-auto shadow-xs">
                  <Trash2 className="w-7 h-7 opacity-80" />
                </div>
                <h3 className="text-sm font-black text-[#0f172a]">Trash is Empty</h3>
                <p className="text-xs text-[#64748b] max-w-sm mx-auto">
                  {searchTerm || categoryFilter !== 'All'
                    ? 'No deleted items match your search or filter.'
                    : 'Items deleted from your vault or folders will appear here and can be restored anytime.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Selection Header Row */}
                <div className="px-4 py-2.5 bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl flex items-center justify-between text-xs font-extrabold text-[#475569]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="flex items-center gap-2 cursor-pointer text-[#475569] hover:text-[#0f172a]"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#0284c7]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#94a3b8]" />
                      )}
                      <span>Select All ({totalVisibleCount})</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-[#64748b]">
                    {visibleResources.length} password(s), {visibleFolders.length} folder(s)
                  </span>
                </div>

                {/* Trashed Folders */}
                {visibleFolders.map((f) => {
                  const isSelected = selectedFolderIds.includes(f.id);
                  return (
                    <div
                      key={f.id}
                      className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xs group ${
                        isSelected
                          ? 'bg-[#f0f9ff] border-[#0284c7] ring-1 ring-[#0284c7]/30'
                          : 'bg-[#f8fafc] hover:bg-[#f1f5f9] border-[#cbd5e1]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectFolder(f.id)}
                          className="cursor-pointer text-[#475569] hover:text-[#0284c7] shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#0284c7]" />
                          ) : (
                            <Square className="w-4 h-4 text-[#94a3b8]" />
                          )}
                        </button>

                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                          <Folder className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#0f172a] truncate">{f.name}</span>
                            <span className="border text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border-amber-300">
                              Folder
                            </span>
                          </div>
                          <p className="text-[11px] text-[#64748b] truncate mt-0.5">
                            {f.description || 'No description'} • {f.itemCount} items
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="text-right hidden md:block">
                          <div className="flex items-center gap-1 text-[11px] text-[#64748b] font-medium">
                            <Clock className="w-3 h-3 text-[#94a3b8]" />
                            <span>{new Date(f.deletedAt).toLocaleDateString()} {new Date(f.deletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <span className="text-[10px] text-[#94a3b8]">Deleted by {f.deletedByName || 'You'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleFolder(f.id, f.name)}
                            disabled={actionLoading}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                            title="Restore Folder and its items"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Restore</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({ type: 'folder', id: f.id, name: f.name });
                              setShowPermanentDeleteModal(true);
                            }}
                            disabled={actionLoading}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Delete Folder Permanently"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Trashed Resources */}
                {visibleResources.map((r) => {
                  const isSelected = selectedResourceIds.includes(r.id);
                  const isCard = r.category === 'Cards' || r.isPrivateOnly;

                  return (
                    <div
                      key={r.id}
                      className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xs group ${
                        isSelected
                          ? 'bg-[#f0f9ff] border-[#0284c7] ring-1 ring-[#0284c7]/30'
                          : 'bg-[#f8fafc] hover:bg-[#f1f5f9] border-[#cbd5e1]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectResource(r.id)}
                          className="cursor-pointer text-[#475569] hover:text-[#0284c7] shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#0284c7]" />
                          ) : (
                            <Square className="w-4 h-4 text-[#94a3b8]" />
                          )}
                        </button>

                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                          isCard
                            ? 'bg-purple-50 border-purple-200 text-purple-600'
                            : 'bg-sky-50 border-sky-200 text-sky-600'
                        }`}>
                          {isCard ? <CreditCard className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#0f172a] truncate">{r.name}</span>
                            <span className={`border text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              isCard
                                ? 'bg-purple-50 text-purple-700 border-purple-300'
                                : 'bg-sky-50 text-sky-700 border-sky-300'
                            }`}>
                              {r.category || 'General'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#64748b] truncate mt-0.5">
                            <span className="truncate">{r.username || r.url || 'No username'}</span>
                            <span>•</span>
                            <span className="text-[#0284c7] font-bold">
                              Folder: {r.originalFolderName || 'Root Vault'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="text-right hidden md:block">
                          <div className="flex items-center gap-1 text-[11px] text-[#64748b] font-medium">
                            <Clock className="w-3 h-3 text-[#94a3b8]" />
                            <span>{new Date(r.deletedAt).toLocaleDateString()} {new Date(r.deletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <span className="text-[10px] text-[#94a3b8]">Deleted by {r.deletedByName || r.ownerName}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleResource(r.id, r.name)}
                            disabled={actionLoading}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                            title="Restore Password"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Restore</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({ type: 'resource', id: r.id, name: r.name });
                              setShowPermanentDeleteModal(true);
                            }}
                            disabled={actionLoading}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Delete Permanently"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {showPermanentDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-extrabold shadow-xs">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">
                    Permanent Deletion
                  </h3>
                  <p className="text-[11px] text-rose-600 font-bold">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPermanentDeleteModal(false);
                  setDeleteTarget(null);
                }}
                disabled={actionLoading}
                className="p-1 text-[#64748b] hover:text-[#0f172a] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">
              {deleteTarget?.type === 'selected'
                ? `Are you sure you want to permanently delete the ${totalSelectedCount} selected item(s)? Their encrypted data will be wiped from the database forever.`
                : deleteTarget?.type === 'folder'
                ? `Are you sure you want to permanently delete the folder "${deleteTarget.name}"?`
                : `Are you sure you want to permanently delete "${deleteTarget?.name}"? Its encrypted password will be permanently lost.`}
            </p>

            <div className="pt-2 flex justify-end gap-3 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={() => {
                  setShowPermanentDeleteModal(false);
                  setDeleteTarget(null);
                }}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{actionLoading ? 'Deleting...' : 'Delete Forever'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Modal */}
      {showEmptyTrashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-extrabold shadow-xs">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Empty All Trash</h3>
                  <p className="text-[11px] text-rose-600 font-bold">Irreversible operation</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmptyTrashModal(false)}
                disabled={actionLoading}
                className="p-1 text-[#64748b] hover:text-[#0f172a] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">
              Are you sure you want to permanently delete all {resources.length + folders.length} item(s) currently in Trash? All encrypted records will be deleted from the database.
            </p>

            <div className="pt-2 flex justify-end gap-3 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={() => setShowEmptyTrashModal(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmEmptyTrash}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{actionLoading ? 'Emptying...' : 'Empty Trash'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
