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
  Filter,
  Users,
  GripVertical
} from 'lucide-react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { ENABLE_PAY_BILL } from '@/lib/config';
import { decryptSecret, safeBase64Decode } from '@/lib/crypto';
import { resolveBestSecret } from '@/lib/secretResolver';
import UnlockVaultModal from '@/components/UnlockVaultModal';
import ExportFormatDropdown from '@/components/ExportFormatDropdown';
import { useAuth } from '@/context/AuthContext';
import {
  buildDecryptedExportData,
  exportPasswords,
  addImportExportHistory,
} from '@/lib/exportVault';
import { provisionSecretsForFolder } from '@/lib/folderSharing';
import { formatExactDateTime } from '@/lib/dateUtils';

function SortableTableRow({
  id,
  className,
  disabled,
  data,
  children,
}: {
  id: string;
  className?: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled, data });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <tr ref={setNodeRef} style={style} className={className}>
      <td className="py-4 px-2 w-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-[#0284c7] cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      {children}
    </tr>
  );
}

function SortableListItem({
  id,
  className,
  disabled,
  data,
  isOver,
  onClick,
  children,
}: {
  id: string;
  className?: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  isOver?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled, data });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className || ''} flex items-center gap-2 ${isOver ? 'ring-2 ring-[#1fbbd2] bg-cyan-50' : ''}`}
      onClick={onClick}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-1 text-gray-400 hover:text-[#0284c7] cursor-grab active:cursor-grabbing shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

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
  const [activeFilterMode, setActiveFilterMode] = useState<'all' | 'leaked' | 'outdated' | 'own' | 'shared' | 'lastModified'>('all');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'pdf' | 'xlsx' | 'kdbx'>('csv');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingExportTarget, setPendingExportTarget] = useState<any[] | null>(null);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<'reveal' | 'copy' | 'export' | null>(null);
  const [pendingUnlockItem, setPendingUnlockItem] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const filterDropdownRef = React.useRef<HTMLDivElement>(null);
  const moveDropdownRef = React.useRef<HTMLDivElement>(null);
  const mainRef = React.useRef<HTMLElement>(null);
  const syncInProgress = React.useRef(false);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (moveDropdownRef.current && !moveDropdownRef.current.contains(event.target as Node)) {
        setIsMoveDropdownOpen(false);
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
    fetchGroups();
    fetchUsers();
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

  useEffect(() => {
    if (!unlockedPgpKey || !user?.id) return;
    if (!groups.length || !users.length || !resources.length) return;
    if (syncInProgress.current) return;
    syncInProgress.current = true;

    (async () => {
      try {
        const privateKey = await getEncryptedPrivateKey();
        if (!privateKey) return;
        const passphrase = unlockedPgpKey ? undefined : masterPassword || undefined;

        for (const g of groups) {
          const groupMemberIds = (g.members || [])
            .map((m: any) => m.userId)
            .filter((id: string) => id !== user?.id);
          for (const folderId of g.assignedFolderIds || []) {
            const myFolderResources = resources.filter(
              (r) => r.ownerId === user?.id && r.folderId === folderId
            );
            if (myFolderResources.length === 0) continue;

            const missing = new Set<string>();
            for (const r of myFolderResources) {
              for (const mId of groupMemberIds) {
                if (!r.secrets?.some((s: any) => s.userId === mId)) {
                  missing.add(mId);
                }
              }
            }
            if (missing.size === 0) continue;

            await provisionSecretsForFolder({
              folderId,
              targetUserIds: Array.from(missing),
              users,
              ownerId: user?.id || '',
              privateKey,
              passphrase,
            });
          }
        }
      } catch (err) {
        console.warn('Background group folder sync failed:', err);
      } finally {
        syncInProgress.current = false;
      }
    })();
  }, [resources, groups, users, unlockedPgpKey, user, getEncryptedPrivateKey, masterPassword]);

  const handleFullRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchResources(), fetchFolders(), fetchGroups(), fetchUsers(), fetchSubscription()]);
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

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
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
    const privateKey = privateKeyOverride || (await getEncryptedPrivateKey());
    if (!privateKey) throw new Error('Key or encrypted data missing');

    const userSecret = resolveBestSecret(item, user?.id, user?.role);
    if (!userSecret) throw new Error('No usable secret for this user');

    const passphrase = privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined;
    try {
      const plainText = await decryptSecret(userSecret.encryptedData, privateKey, passphrase);
      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
      return;
    } catch (err: any) {
      const fallback = (user?.role === 'Owner' || user?.role === 'Admin')
        ? item.secrets?.find((s: any) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'))
        : undefined;
      if (fallback) {
        const plainText = safeBase64Decode(fallback.encryptedData);
        setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
        return;
      }
      throw err;
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

    const passphrase = privateKeyOverride ? undefined : unlockedPgpKey ? undefined : masterPassword || undefined;
    try {
      return await decryptSecret(userSecret.encryptedData, privateKey, passphrase);
    } catch (err: any) {
      const fallback = (user?.role === 'Owner' || user?.role === 'Admin')
        ? item.secrets?.find((s: any) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'))
        : undefined;
      if (fallback) {
        return safeBase64Decode(fallback.encryptedData);
      }
      throw err;
    }
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
    } catch (err) {
      console.error('Copy failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt.');
      return;
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to move this password to Trash?')) return;
    setResources((prev) => prev.filter((r) => r.id !== id));
    try {
      await api.delete(`/resources/${id}`);
      await fetchResources();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to move password to Trash');
      await fetchResources();
    }
  };

  const [dragOver, setDragOver] = useState<{ id: string | null; type: string | null }>({ id: null, type: null });

  const handleDragOver = (event: any) => {
    const over = event.over;
    setDragOver((prev) =>
      prev.id === over?.id && prev.type === over?.data?.current?.type
        ? prev
        : { id: over?.id || null, type: over?.data?.current?.type || null }
    );
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'resource' && overType === 'resource') {
      if (searchTerm || activeFilterMode !== 'all') return;
      const oldIndex = displayedResources.findIndex((r) => r.id === active.id);
      const newIndex = displayedResources.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const previous = [...resources];
      const reordered = arrayMove(displayedResources, oldIndex, newIndex);
      setResources(reordered);
      try {
        await api.put('/resources/reorder', { ids: reordered.map((r) => r.id) });
      } catch (err) {
        setResources(previous);
        alert('Failed to save resource order');
      }
      return;
    }

    if (activeType === 'folder' && overType === 'folder') {
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

    if (activeType === 'resource' && overType === 'folder') {
      const resourceId = active.id as string;
      const targetFolderId = over.id as string;
      const item = resources.find((r) => r.id === resourceId);
      if (!item || item.folderId === targetFolderId) return;

      const previousResources = [...resources];
      setResources(previousResources.map((r) => (r.id === resourceId ? { ...r, folderId: targetFolderId } : r)));
      setFolders((prev) =>
        prev.map((f) => {
          if (f.id === targetFolderId) return { ...f, itemCount: (f.itemCount || 0) + 1 };
          if (f.id === item.folderId) return { ...f, itemCount: Math.max((f.itemCount || 0) - 1, 0) };
          return f;
        })
      );

      try {
        await api.put(`/resources/${resourceId}`, { folderId: targetFolderId });
        fetchResources();
        fetchFolders();
      } catch (err) {
        setResources(previousResources);
        fetchFolders();
        alert('Failed to move resource');
      }
    }
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

  const ownCount = resources.filter((r) => r.ownerId === user?.id).length;

  const sharedCount = resources.filter(
    (r) => (r.sharedWith && r.sharedWith.length > 0) || r.isExternalShared
  ).length;

  const duplicateMap: Record<string, string[]> = {};
  resources.forEach((r) => {
    const key = `${(r.url || '').trim().toLowerCase()}||${(r.username || '').trim().toLowerCase()}`;
    if (!duplicateMap[key]) duplicateMap[key] = [];
    duplicateMap[key].push(r.id);
  });
  const duplicateGroups = Object.values(duplicateMap).filter((arr) => arr.length > 1);
  const duplicateGroupCount = duplicateGroups.length;
  const duplicateIds = new Set<string>();
  duplicateGroups.forEach((arr) => arr.forEach((id) => duplicateIds.add(id)));

  const displayedResources = resources
    .filter((r) => {
      if (showDuplicates && !duplicateIds.has(r.id)) return false;
      if (activeFilterMode === 'leaked') {
        return r.strength === 'Weak' || r.name.toLowerCase().includes('leak');
      }
      if (activeFilterMode === 'outdated') {
        if (r.isOld || r.name.toLowerCase().includes('old')) return true;
        if (!r.lastModified) return false;
        const modDate = new Date(r.lastModified);
        return modDate < sixMonthsAgo;
      }
      if (activeFilterMode === 'own') {
        return r.ownerId === user?.id;
      }
      if (activeFilterMode === 'shared') {
        return (r.sharedWith && r.sharedWith.length > 0) || r.isExternalShared;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return dateB - dateA;
    });

  const filterModeLabel = {
    all: 'All Vault Passwords',
    leaked: 'Leaked Passwords',
    outdated: 'Outdated (>6 Months)',
    own: 'Items I Own',
    shared: 'Items I Shared',
    lastModified: 'Last Modified',
  }[activeFilterMode];

  const filterModeColor =
    activeFilterMode === 'leaked'
      ? 'text-rose-700'
      : activeFilterMode === 'outdated'
      ? 'text-[#d97706]'
      : activeFilterMode === 'all'
      ? 'text-[#0f172a]'
      : 'text-[#0284c7]';

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
      const { filename, count } = await exportPasswords(data, exportFormat, user);
      addImportExportHistory({
        type: 'export',
        fileName: filename,
        format: exportFormat,
        count,
        by: user?.name || user?.email || 'Unknown',
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

  const handleBulkMove = async (folderId: string) => {
    if (selectedIds.length === 0) {
      alert('No passwords selected to move.');
      return;
    }
    try {
      await Promise.all(selectedIds.map((id) => api.put(`/resources/${id}`, { folderId })));
      setIsMoveDropdownOpen(false);
      setSelectedIds([]);
      fetchResources();
      fetchFolders();
    } catch (err) {
      alert('Failed to move selected passwords.');
    }
  };

  const handleRemoveDuplicates = async () => {
    const idsToRemove: string[] = [];
    duplicateGroups.forEach((ids) => {
      const sorted = [...ids].sort((a, b) => {
        const aModified = resources.find((r) => r.id === a)?.lastModified || '';
        const bModified = resources.find((r) => r.id === b)?.lastModified || '';
        return new Date(bModified).getTime() - new Date(aModified).getTime();
      });
      idsToRemove.push(...sorted.slice(1));
    });
    if (idsToRemove.length === 0) return;
    if (!confirm(`Remove ${idsToRemove.length} duplicate password(s)?`)) return;
    setResources((prev) => prev.filter((r) => !idsToRemove.includes(r.id)));
    try {
      await Promise.all(idsToRemove.map((id) => api.delete(`/resources/${id}`)));
      setShowDuplicates(false);
      await fetchResources();
      await fetchFolders();
    } catch (err) {
      alert('Failed to remove duplicates.');
      await fetchResources();
    }
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
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main ref={mainRef} onScroll={(e) => setShowBackToTop(e.currentTarget.scrollTop > 300)} className="p-4 md:p-8 flex-1 overflow-y-auto relative">
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
            <div className="grid grid-cols-1 gap-6">
              {/* RIGHT COLUMN: Passwords Data Table */}
              <div className="space-y-4">
                {/* Duplicate Password Warning */}
                {duplicateGroupCount > 0 && !showDuplicates && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-between text-xs text-rose-900 font-extrabold shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-rose-900 text-xs">{duplicateGroupCount} duplicate password group{duplicateGroupCount > 1 ? 's' : ''} detected</h4>
                        <p className="text-[11px] text-rose-700 font-medium">
                          Multiple items share the same URL and username.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setShowDuplicates(true)}
                        className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Show Duplicates
                      </button>
                      <button
                        onClick={handleRemoveDuplicates}
                        className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Remove Duplicates
                      </button>
                    </div>
                  </div>
                )}

                {showDuplicates && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-between text-xs text-rose-900 font-extrabold shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-rose-900 text-xs">Showing duplicates</h4>
                        <p className="text-[11px] text-rose-700 font-medium">
                          {displayedResources.length} duplicate item{displayedResources.length !== 1 ? 's' : ''} displayed.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDuplicates(false)}
                      className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      Show All
                    </button>
                  </div>
                )}

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
                  <div className="relative" ref={filterDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                      className="flex items-center gap-2 bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2 rounded-xl text-[#0f172a] transition-all cursor-pointer"
                    >
                      <Filter className="w-3.5 h-3.5 text-[#0284c7]" />
                      <span className={filterModeColor}>
                        {filterModeLabel}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#64748b]" />
                    </button>

                    {isFilterDropdownOpen && (
                      <div className="absolute left-0 mt-2 w-56 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('all'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'all'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">All Vault Passwords ({resources.length})</span>
                          {activeFilterMode === 'all' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('leaked'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'leaked'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">Leaked Passwords ({leakedCount})</span>
                          {activeFilterMode === 'leaked' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('outdated'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'outdated'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">Outdated (&gt;6 Months) ({outdatedCount})</span>
                          {activeFilterMode === 'outdated' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('own'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'own'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">Items I Own ({ownCount})</span>
                          {activeFilterMode === 'own' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('shared'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'shared'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">Items I Shared ({sharedCount})</span>
                          {activeFilterMode === 'shared' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveFilterMode('lastModified'); setIsFilterDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                            activeFilterMode === 'lastModified'
                              ? 'bg-[#e0f2fe] text-[#0284c7]'
                              : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <span className="flex items-center gap-2">Last Modified ({resources.length})</span>
                          {activeFilterMode === 'lastModified' && <Check className="w-3.5 h-3.5 text-[#0284c7]" />}
                        </button>
                      </div>
                    )}
                  </div>
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

                      {/* Bulk Move to Folder */}
                      <div className="relative" ref={moveDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsMoveDropdownOpen((prev) => !prev)}
                          disabled={selectedIds.length === 0}
                          className="flex items-center gap-2 bg-[#f8fafc] hover:bg-[#e0f2fe] border border-[#cbd5e1] hover:border-[#1fbbd2] disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2 rounded-xl text-xs font-extrabold text-[#0f172a] transition-all cursor-pointer"
                        >
                          <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                          <span>Move to Folder</span>
                          <ChevronDown className="w-3.5 h-3.5 text-[#64748b]" />
                        </button>

                        {isMoveDropdownOpen && (
                          <div className="absolute left-0 mt-2 w-56 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
                            {folders.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-[#64748b]">No folders available</p>
                            ) : (
                              folders.map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => handleBulkMove(f.id)}
                                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold text-[#0f172a] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                                    {f.name}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

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
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                    <tr>
                      <th className="py-3.5 px-2 w-10" />
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
                    <SortableContext items={displayedResources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                    {displayedResources.map((res) => {
                      const isRevealed = !!revealedPasswords[res.id];
                      const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';
                      const isTeamShared = (res.sharedWith && res.sharedWith.length > 0) || res.isExternalShared;

                      return (
                        <SortableTableRow
                          key={res.id}
                          id={res.id}
                          disabled={!!searchTerm || activeFilterMode !== 'all'}
                          data={{ type: 'resource' }}
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
                                {(res.strength === 'Weak' || res.isOld || res.name.toLowerCase().includes('old') || (res.lastModified ? new Date(res.lastModified) < sixMonthsAgo : false) || isTeamShared || res.isExternalShared) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(res.strength === 'Weak' || res.isOld || res.name.toLowerCase().includes('old') || (res.lastModified ? new Date(res.lastModified) < sixMonthsAgo : false)) && (
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
                        </SortableTableRow>
                      );
                    })}
                    </SortableContext>
                  </tbody>
                </table>
                </DndContext>
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

        {showBackToTop && (
          <button
            type="button"
            onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-20 p-2.5 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-full shadow-lg transition-all cursor-pointer"
            title="Back to top"
          >
            <ChevronLeft className="w-4 h-4 rotate-90" />
          </button>
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
