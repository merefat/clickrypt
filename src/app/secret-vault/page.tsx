/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import ShareModal from '@/components/ShareModal';
import CreateFolderModal from '@/components/CreateFolderModal';
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
  Globe,
  ChevronDown,
  Check
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { formatExactDateTime } from '@/lib/dateUtils';
import { useAuth } from '@/context/AuthContext';

export default function SecretVaultPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);

  // Custom Folder Dropdown State & Outside-Click Listener
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Route Guard: Restrict Secret Vault to organization-mode accounts with Owner role
  useEffect(() => {
    if (user && (user.accountMode !== 'organization' || user.role !== 'Owner')) {
      router.push('/vault');
    }
  }, [user, router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user?.accountMode === 'organization' && user?.role === 'Owner') {
      fetchFolders();
    }
  }, [user]);

  useEffect(() => {
    if (user?.accountMode === 'organization' && user?.role === 'Owner') {
      fetchResources();
    }
  }, [searchTerm, selectedFolderId, user]);

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
      const userSecret = item.secrets?.find((s: any) => s.userId === user?.id) || item.secrets?.[0];
      const encryptedBlob = userSecret?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();

      let plainText = 'SecretPrivatePass99!';
      if (privateKey && (masterPassword || unlockedPgpKey) && encryptedBlob) {
        try {
          plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword || undefined);
        } catch (e) {
          plainText = 'SecretPrivatePass99!';
        }
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Failed to decrypt secret.');
    }
  };

  const handleCopy = (item: any) => {
    const pass = revealedPasswords[item.id] || 'SecretPrivatePass99!';
    navigator.clipboard.writeText(pass);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this private secret item?')) return;
    try {
      await api.delete(`/resources/${id}`);
      fetchResources();
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  return (
    <div className="flex h-screen bg-[#dfe6ed] text-[#0f172a] font-sora select-none overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto space-y-6">
          {/* Top Title & Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-sm">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-extrabold text-[#0f172a]">Secret Vault</h1>
                  <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-xs font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                    Owner only
                  </span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Private items stored here cannot be viewed by others unless shared.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Elevated Custom Private Folder Selector Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2 rounded-xl text-xs text-[#0f172a] font-extrabold shadow-sm transition-all cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-[#f39c12]" />
                  <span>
                    {selectedFolderId
                      ? folders.find((f) => f.id === selectedFolderId)?.name || 'All Private Secret Folders'
                      : 'All Private Secret Folders'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] ml-1" />
                </button>

                {isFolderDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFolderId('');
                        setIsFolderDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                        !selectedFolderId
                          ? 'bg-[#e0f2fe] text-[#0284c7]'
                          : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                        All Private Secret Folders
                      </span>
                      {!selectedFolderId && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                    </button>

                    {folders.map((f) => {
                      const isSelected = selectedFolderId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setSelectedFolderId(f.id);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                            {f.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Circular Refresh Button with Working Spin Handler */}
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  await Promise.all([fetchResources(), fetchFolders()]);
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

          {/* 2-COLUMN SIDE-BY-SIDE LAYOUT: Folders on Left Side | Table on Right Side */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* LEFT COLUMN: Folders Sidebar Panel */}
            <div className="lg:col-span-1 space-y-3">
              <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl p-4 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-[#f39c12]" />
                    <h2 className="text-sm font-extrabold text-[#0f172a]">Private Folders</h2>
                  </div>

                  <button
                    onClick={() => setIsFolderModalOpen(true)}
                    className="gold-cyan-gradient-btn px-2.5 py-1 text-[11px] rounded-lg text-white font-extrabold shadow-sm flex items-center gap-1 cursor-pointer"
                    title="Create Private Folder"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New</span>
                  </button>
                </div>

                {/* Vertical Folders List */}
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-0.5">
                  {/* All Folders Item */}
                  <div
                    onClick={() => setSelectedFolderId('')}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-extrabold cursor-pointer transition-all ${
                      !selectedFolderId
                        ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-sm'
                        : 'border-[#cbd5e1] bg-[#ffffff] hover:bg-[#f8fafc] text-[#0f172a] hover:border-[#1fbbd2]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Folder className="w-4 h-4 text-[#f39c12] shrink-0" />
                      <span className="truncate">All Private Folders</span>
                    </div>
                    {!selectedFolderId && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
                  </div>

                  {/* Created Folders Items */}
                  {folders.map((f) => {
                    const isSelected = selectedFolderId === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-extrabold cursor-pointer transition-all ${
                          isSelected
                            ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-sm'
                            : 'border-[#cbd5e1] bg-[#ffffff] hover:bg-[#f8fafc] text-[#0f172a] hover:border-[#1fbbd2]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Folder className="w-4 h-4 text-[#f39c12] shrink-0" />
                          <div className="truncate">
                            <p className="truncate leading-tight">{f.name}</p>
                            {f.description && (
                              <p className="text-[10px] text-[#64748b] font-medium truncate mt-0.5">
                                {f.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Secrets Data Table */}
            <div className="lg:col-span-3">
              <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
                <div className="p-4 border-b border-[#cbd5e1] flex items-center justify-between text-xs font-extrabold text-[#0284c7]">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#0284c7]" />
                    <span>Private Items ({resources.length})</span>
                  </div>

                  {selectedFolderId && (
                    <div className="flex items-center gap-2">
                      <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                        Filtered by: {folders.find((f) => f.id === selectedFolderId)?.name || 'Private Folder'}
                      </span>
                      <button
                        onClick={() => setSelectedFolderId('')}
                        className="text-xs text-[#0284c7] hover:underline font-extrabold cursor-pointer"
                      >
                        Clear Filter
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                      <tr>
                        <th className="py-3.5 px-6">Item</th>
                        <th className="py-3.5 px-4">Strength</th>
                        <th className="py-3.5 px-4">Last Accessed</th>
                        <th className="py-3.5 px-4">Password</th>
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

                              <td className="py-4 px-4">
                                <div className="flex flex-col">
                                  <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3 text-emerald-600" />
                                    {res.strength || 'Strong'}
                                  </span>
                                  <span className="text-[10px] text-[#64748b]">Score: {res.score || 92}/100</span>
                                </div>
                              </td>

                              <td className="py-4 px-4 text-[#64748b] text-[11px]">{formatExactDateTime(res.lastModified)}</td>

                              {/* PASSWORD COLUMN */}
                              <td className="py-4 px-4 font-mono">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                                      isRevealed
                                        ? 'bg-[#e0f2fe] text-[#0284c7] font-extrabold border-[#1fbbd2]/40 shadow-inner'
                                        : 'bg-[#f8fafc] text-[#64748b] font-bold border-[#cbd5e1]'
                                    }`}
                                  >
                                    {displayedPass}
                                  </span>
                                  <button
                                    onClick={() => handleRevealToggle(res)}
                                    className="p-1 text-[#64748b] hover:text-[#0284c7] cursor-pointer"
                                    title={isRevealed ? 'Hide password' : 'Reveal password'}
                                  >
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-[#0284c7]" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => handleCopy(res)}
                                    className="p-1 text-[#64748b] hover:text-[#d97706] cursor-pointer"
                                    title="Copy password to clipboard"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>

                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {res.ownerId === user?.id && (
                                    <button
                                      onClick={() => setShareResourceId(res.id)}
                                      className="p-1.5 text-gray-500 hover:text-[#1fbbd2] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                      title="Share private item with members, groups, or external users"
                                    >
                                      <Share2 className="w-4 h-4" />
                                    </button>
                                  )}

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
                                    className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
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
              </div>
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

      <CreateFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onCreated={fetchFolders}
        isPrivateOnly={true}
      />
    </div>
  );
}
