/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import ShareModal from '@/components/ShareModal';
import CreateFolderModal from '@/components/CreateFolderModal';
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
  ChevronDown,
  Check,
  ExternalLink,
  Edit2,
  Trash2,
  Folder,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  Globe,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Users
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { ENABLE_PAY_BILL } from '@/lib/config';
import { decryptSecret } from '@/lib/crypto';
import UnlockVaultModal from '@/components/UnlockVaultModal';
import ExportFormatDropdown from '@/components/ExportFormatDropdown';
import { useAuth } from '@/context/AuthContext';
import {
  buildDecryptedExportData,
  exportPasswords,
  addImportExportHistory,
} from '@/lib/exportVault';
import { formatExactDateTime } from '@/lib/dateUtils';

export default function VaultPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey, unlockVault } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [externalSharedSecret, setExternalSharedSecret] = useState<any | null>(null);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isOldFilter, setIsOldFilter] = useState(false);
  const [activeFilterMode, setActiveFilterMode] = useState<'all' | 'leaked' | 'outdated'>('all');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf' | 'xlsx' | 'xls' | 'kdbx'>('csv');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingExportTarget, setPendingExportTarget] = useState<any[] | null>(null);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<'reveal' | 'copy' | 'export' | null>(null);
  const [pendingUnlockItem, setPendingUnlockItem] = useState<any | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const filterParam = searchParams.get('filter');
    if (filterParam === 'leaked') {
      setActiveFilterMode('leaked');
      setIsOldFilter(true);
    } else if (filterParam === 'outdated' || filterParam === 'old') {
      setActiveFilterMode('outdated');
      setIsOldFilter(true);
    }
  }, []);

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
    if (user?.role === 'External') {
      router.push('/shared');
      return;
    }
    fetchFolders();
    fetchSubscription();

    const searchParams = new URLSearchParams(window.location.search);
    const externalShareId = searchParams.get('externalShareId') || searchParams.get('st') || searchParams.get('shareToken');

    if (externalShareId && !user) {
      router.push(`/register?externalShareId=${externalShareId}&role=External`);
    }
  }, [user, router]);

  useEffect(() => {
    fetchResources();
  }, [searchTerm, selectedFolderId]);

  const handleFullRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchResources(), fetchFolders(), fetchSubscription()]);
    setTimeout(() => {
      setLoading(false);
    }, 600);
  };

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
      const params: any = { secretVault: false };
      if (user?.role === 'Owner' || user?.role === 'Admin') {
        params.scope = 'manage';
      }
      const res = await api.get('/folders', { params });
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

  const performReveal = async (item: any, privateKeyOverride?: string) => {
    const userSecret = item.secrets?.find((s: any) => s.userId === user?.id) || item.secrets?.[0];
    const encryptedBlob = userSecret?.encryptedData || '';
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey || !encryptedBlob) throw new Error('Key or encrypted data missing');

    const plainText = await decryptSecret(encryptedBlob, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
    setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
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

    if (!unlockedPgpKey && !masterPassword) {
      setPendingUnlockAction('reveal');
      setPendingUnlockItem(item);
      setShowUnlockModal(true);
      return;
    }

    try {
      await performReveal(item);
    } catch (err) {
      alert('Failed to decrypt.');
    }
  };

  const performCopy = async (item: any, privateKeyOverride?: string) => {
    const userSecret = item.secrets?.find((s: any) => s.userId === user?.id) || item.secrets?.[0];
    const encryptedBlob = userSecret?.encryptedData || '';
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey || !encryptedBlob) throw new Error('Key or encrypted data missing');

    return await decryptSecret(encryptedBlob, privateKey, privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined);
  };

  const handleCopy = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (plainText) {
      navigator.clipboard.writeText(plainText);
      alert(`Copied password for ${item.name} to clipboard!`);
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
    } catch {
      alert('Failed to decrypt.');
      return;
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this password?')) return;
    await api.delete(`/resources/${id}`);
    fetchResources();
  };

  const isExpired = ENABLE_PAY_BILL && subscription && (subscription.status === 'Expired' || subscription.daysRemaining <= 0);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const leakedCount = resources.filter(
    (r) => r.isPwned || r.isCompromised || r.strength === 'Weak' || r.name.toLowerCase().includes('leaked') || r.name.toLowerCase().includes('breach')
  ).length;

  const outdatedCount = resources.filter((r) => {
    if (r.isOld || r.name.toLowerCase().includes('old')) return true;
    if (!r.lastModified) return false;
    const modDate = new Date(r.lastModified);
    return modDate < sixMonthsAgo;
  }).length;

  const displayedResources = resources.filter((r) => {
    if (activeFilterMode === 'leaked') {
      return r.isPwned || r.isCompromised || r.strength === 'Weak' || r.name.toLowerCase().includes('leaked') || r.name.toLowerCase().includes('breach');
    }
    if (activeFilterMode === 'outdated') {
      if (r.isOld || r.name.toLowerCase().includes('old')) return true;
      if (!r.lastModified) return false;
      const modDate = new Date(r.lastModified);
      return modDate < sixMonthsAgo;
    }
    return true;
  });

  const toggleResourceSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllDisplayed = () => {
    const displayedIds = displayedResources.map((r) => r.id);
    const allSelected = displayedIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const executeExport = async (target: any[], overridePassword?: string) => {
    try {
      const data = await buildDecryptedExportData(
        target,
        user,
        overridePassword || masterPassword,
        unlockedPgpKey,
        getEncryptedPrivateKey
      );
      const { filename, count, filePassword } = await exportPasswords(data, exportFormat, user);
      addImportExportHistory({
        type: 'export',
        fileName: filename,
        format: exportFormat,
        count,
        by: user?.name || user?.email || 'Unknown',
        filePassword,
        passwordNames: target.map((r) => r.name),
      });
      const failedDecryptionCount = data.filter((d) => d.Password === '[Decryption Required]').length;
      const failedNote = failedDecryptionCount > 0
        ? `\n\nNote: ${failedDecryptionCount} password${failedDecryptionCount > 1 ? 's' : ''} could not be decrypted and will show "[Decryption Required]".`
        : '';
      setSelectedIds([]);
      setBulkSelectMode(false);
      alert(`Exported ${count} passwords to ${filename}.${failedNote}`);
    } catch (err: any) {
      console.error(err);
      alert('Export failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleBulkExport = async () => {
    const mode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'personal' : 'personal';
    if (mode !== 'personal' && !['Owner', 'Admin'].includes(user?.role as string)) {
      alert('Export is restricted to Organization Owners/Admins or Personal mode.');
      return;
    }

    const target = selectedIds.length > 0
      ? displayedResources.filter((r) => selectedIds.includes(r.id))
      : displayedResources;

    if (target.length === 0) {
      alert('No passwords selected to export.');
      return;
    }

    if (!masterPassword && !unlockedPgpKey) {
      setPendingExportTarget(target);
      setPendingUnlockAction('export');
      setShowUnlockModal(true);
      return;
    }

    await executeExport(target);
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
        navigator.clipboard.writeText(plainText);
        alert(`Copied password for ${pendingUnlockItem.name} to clipboard!`);
      } else if (pendingUnlockAction === 'export' && pendingExportTarget) {
        await executeExport(pendingExportTarget, password);
        setPendingExportTarget(null);
      }
    } catch {
      alert('Failed to decrypt.');
    }

    setPendingUnlockAction(null);
    setPendingUnlockItem(null);
    return true;
  };

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-[#0f172a]">
                {isOldFilter ? 'Passwords Needing Attention 🔴' : 'Passwords'}
              </h1>
              <span className="bg-[#ffffff] text-[#475569] border border-[#cbd5e1] text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                {resources.length} items
              </span>
              {isOldFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOldFilter(false);
                    window.history.pushState({}, '', '/vault');
                  }}
                  className="text-xs text-[#0284c7] font-extrabold hover:underline cursor-pointer"
                >
                  Show All Passwords
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Custom Styled Elevated Folder Selector Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2 rounded-xl text-xs text-[#0f172a] font-extrabold shadow-sm transition-all cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-[#f39c12]" />
                  <span>
                    {selectedFolderId
                      ? folders.find((f) => f.id === selectedFolderId)?.name || 'All Folders'
                      : 'All Folders'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748b] ml-1" />
                </button>

                {isFolderDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
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
                        All Folders
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

              {/* Working Circular Refresh Button with Live Animation Feedback */}
              <button
                type="button"
                onClick={handleFullRefresh}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-[#0f172a] transition-all shadow-sm cursor-pointer active:scale-95"
                title="Refresh Vault Data"
              >
                <RefreshCw className={`w-4 h-4 text-[#0284c7] ${loading ? 'animate-spin' : ''}`} />
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
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* LEFT COLUMN: Folders Sidebar Panel */}
              <div className="lg:col-span-1 space-y-3">
                <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl p-4 shadow-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-[#f39c12]" />
                      <h2 className="text-sm font-extrabold text-[#0f172a]">Vault Folders</h2>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedFolderId && (
                        <button
                          onClick={() => setSelectedFolderId('')}
                          className="text-[11px] text-[#0284c7] hover:underline font-extrabold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => setIsFolderModalOpen(true)}
                        className="gold-cyan-gradient-btn px-2.5 py-1 text-[11px] rounded-lg text-white font-extrabold shadow-sm flex items-center gap-1 cursor-pointer"
                        title="Create New Folder"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New</span>
                      </button>
                    </div>
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
                        <span className="truncate">All Folders</span>
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
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                              {f.itemCount || 0}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Passwords Data Table */}
              <div className="lg:col-span-3 space-y-4">
                {/* Security Audit Filter Tabs */}
                <div className="flex items-center gap-2 flex-wrap bg-[#ffffff] p-2 rounded-2xl border border-[#d0dbe5] shadow-sm text-xs font-extrabold">
                  <button
                    onClick={() => setActiveFilterMode('all')}
                    className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeFilterMode === 'all'
                        ? 'bg-[#0f172a] text-white shadow-sm'
                        : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                    }`}
                  >
                    <span>All Vault Passwords</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-[10px]">
                      {resources.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterMode('leaked')}
                    className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeFilterMode === 'leaked'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-rose-700 hover:bg-rose-50 border border-rose-200'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Leaked Passwords</span>
                    {leakedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-800 text-white text-[10px]">
                        {leakedCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveFilterMode('outdated')}
                    className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeFilterMode === 'outdated'
                        ? 'bg-[#d97706] text-white shadow-sm'
                        : 'text-[#d97706] hover:bg-amber-50 border border-amber-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Outdated (&gt;6 Months)</span>
                    {outdatedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-800 text-white text-[10px]">
                        {outdatedCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Audit Context Banner */}
                {activeFilterMode === 'leaked' && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-between text-xs text-rose-900 font-extrabold shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-rose-900 text-xs">Leaked Password Audit Section</h4>
                        <p className="text-[11px] text-rose-700 font-medium">
                          Showing {displayedResources.length} password credential(s) detected in public breach databases or flagged as weak. Change these immediately.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveFilterMode('all')}
                      className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      Show All Passwords
                    </button>
                  </div>
                )}

                {activeFilterMode === 'outdated' && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-extrabold shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#d97706] text-white flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-amber-900 text-xs">Outdated Password Audit Section (&gt;6 Months)</h4>
                        <p className="text-[11px] text-amber-800 font-medium">
                          Showing {displayedResources.length} password credential(s) last modified over 6 months ago. Rotate these passwords for security compliance.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveFilterMode('all')}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      Show All Passwords
                    </button>
                  </div>
                )}

                {/* Bulk Select & Export Bar */}
                <div className="flex flex-wrap items-center gap-3 bg-[#ffffff] border border-[#d0dbe5] rounded-2xl p-3 shadow-sm">
                  <button
                    onClick={() => {
                      setBulkSelectMode((prev) => !prev);
                      if (bulkSelectMode) setSelectedIds([]);
                    }}
                    className="px-3.5 py-2 bg-[#f8fafc] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0f172a] transition-all cursor-pointer flex items-center gap-2"
                  >
                    {bulkSelectMode ? 'Cancel Bulk Select' : 'Bulk Select'}
                  </button>

                  {bulkSelectMode && (
                    <>
                      <button
                        onClick={toggleSelectAllDisplayed}
                        className="px-3.5 py-2 bg-[#f8fafc] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0f172a] transition-all cursor-pointer"
                      >
                        Select All
                      </button>

                      <ExportFormatDropdown value={exportFormat} onChange={(value) => setExportFormat(value)} />

                      <button
                        onClick={handleBulkExport}
                        className="gold-cyan-gradient-btn px-4 py-2 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
                      >
                        Export {selectedIds.length > 0 ? `Selected (${selectedIds.length})` : 'All'}
                      </button>
                    </>
                  )}

                  {selectedIds.length > 0 && (
                    <span className="text-xs font-bold text-[#0284c7]">
                      {selectedIds.length} selected
                    </span>
                  )}
                </div>

                <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                    <tr>
                      {bulkSelectMode && (
                        <th className="py-3.5 px-4 w-10">
                          <input
                            type="checkbox"
                            checked={
                              displayedResources.length > 0 &&
                              displayedResources.every((r) => selectedIds.includes(r.id))
                            }
                            onChange={toggleSelectAllDisplayed}
                            className="accent-[#f39c12] w-4 h-4"
                          />
                        </th>
                      )}
                      <th className="py-3.5 px-6 font-extrabold uppercase tracking-wider">Name</th>
                      <th className="py-3.5 px-4 font-extrabold uppercase tracking-wider">Username</th>
                      <th className="py-3.5 px-4 font-extrabold uppercase tracking-wider">URL</th>
                      <th className="py-3.5 px-4 font-extrabold uppercase tracking-wider">Password</th>
                      <th className="py-3.5 px-4 font-extrabold uppercase tracking-wider">Last modified</th>
                      <th className="py-3.5 px-6 text-center font-extrabold uppercase tracking-wider min-w-[210px]">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e2e8f0]">
                    {displayedResources.map((res) => {
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';
                      const isTeamShared = (res.secrets && res.secrets.length > 1) || (res.sharedWith && res.sharedWith.length > 0);

                      return (
                        <tr
                          key={res.id}
                          className="hover:bg-[#f1f6fb] transition-all group border-b border-gray-100"
                        >
                          {bulkSelectMode && (
                            <td className="py-4 px-4 w-10">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(res.id)}
                                onChange={() => toggleResourceSelection(res.id)}
                                className="accent-[#f39c12] w-4 h-4"
                              />
                            </td>
                          )}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow">
                                {res.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex flex-col gap-1 min-w-0">
                                <p className="font-bold text-[#0f172a] text-sm group-hover:text-[#1fbbd2] transition-colors truncate min-w-0" title={res.name}>
                                  {res.name}
                                </p>
                                {(res.strength === 'Weak' || res.isOld || isOldFilter || res.name.toLowerCase().includes('old') || isTeamShared || res.isExternalShared) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(res.strength === 'Weak' || res.isOld || isOldFilter || res.name.toLowerCase().includes('old')) && (
                                  <span
                                    className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-300 text-rose-700 text-[10px] font-extrabold inline-flex items-center gap-1 shadow-xs shrink-0"
                                    title="This password is old and needs attention (Action Required)"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse shrink-0" />
                                    <span>Needs Attention</span>
                                  </span>
                                )}
                                {isTeamShared && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-[#e0f2fe] border border-[#1fbbd2]/50 text-[#0284c7] text-[10px] font-extrabold inline-flex items-center gap-1 shadow-xs shrink-0"
                                    title="This password is shared with team members"
                                  >
                                    <Users className="w-3 h-3 text-[#0284c7]" />
                                    <span>Shared</span>
                                  </span>
                                )}
                                {res.isExternalShared && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-[#d97706] text-[10px] font-extrabold inline-flex items-center gap-1 shadow-xs shrink-0"
                                    title="Shared externally with a non-application member"
                                  >
                                    <Globe className="w-3 h-3 text-[#d97706]" />
                                    <span>External Share</span>
                                  </span>
                                )}
                                </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#334155] font-medium">{res.username || '—'}</td>

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

                          <td className="py-4 px-4 text-[#64748b] text-[11px]">{formatExactDateTime(res.lastModified)}</td>

                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {res.ownerId === user?.id && (
                                <button
                                  type="button"
                                  onClick={() => setShareResourceId(res.id)}
                                  className="px-2.5 py-1 bg-[#e0f2fe] hover:bg-[#bae6fd] border border-[#1fbbd2]/40 text-[#0284c7] rounded-lg text-xs font-extrabold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                  title="Share password with member or group"
                                >
                                  <Share2 className="w-3.5 h-3.5 text-[#0284c7]" />
                                  <span>Share</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(res);
                                  setIsDrawerOpen(true);
                                }}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[#d97706] rounded-lg text-xs font-extrabold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                title="Edit password item"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-[#d97706]" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(res.id)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-extrabold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                title="Delete password item"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>Delete</span>
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
                  <button className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] cursor-pointer shadow-xs">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="w-7 h-7 gold-cyan-gradient-btn text-white font-extrabold rounded-lg flex items-center justify-center shadow-xs">
                    1
                  </button>
                  <button className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] cursor-pointer shadow-xs">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
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

      <UnlockVaultModal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setPendingExportTarget(null);
          setPendingUnlockAction(null);
          setPendingUnlockItem(null);
        }}
        onSubmit={handleUnlockSubmit}
      />

      <CreateFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onCreated={fetchFolders}
      />

      {/* External Shared Secret Preview Modal */}
      {externalSharedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora select-none animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-xs">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-[#0f172a]">Shared Secret Access</h3>
              </div>
              <button
                onClick={() => setExternalSharedSecret(null)}
                className="text-gray-400 hover:text-[#0f172a] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 bg-[#f8fafc] p-4 rounded-xl border border-[#cbd5e1]">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-[#64748b] tracking-wider">Secret Title</span>
                <p className="text-sm font-extrabold text-[#0f172a]">{externalSharedSecret.title || 'Shared Secret'}</p>
              </div>

              <div>
                <span className="text-[10px] font-extrabold uppercase text-[#64748b] tracking-wider">Decrypted Password</span>
                <div className="mt-1 p-2.5 bg-white border border-[#cbd5e1] rounded-lg font-mono text-xs font-bold text-[#0284c7] flex items-center justify-between shadow-inner">
                  <span>{externalSharedSecret.secret || '••••••••'}</span>
                  <button
                    onClick={() => {
                      if (externalSharedSecret.secret) {
                        navigator.clipboard.writeText(externalSharedSecret.secret);
                        alert('Password copied to clipboard!');
                      }
                    }}
                    className="text-xs text-[#d97706] hover:underline font-extrabold cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setExternalSharedSecret(null)}
                className="gold-cyan-gradient-btn px-6 py-2 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
