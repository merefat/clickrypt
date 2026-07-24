"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Folder as FolderIcon,
  FolderPlus,
  Info,
  Key,
  ListTree,
  Lock,
  LogOut,
  Pencil,
  Pin,
  Plus,
  Search,
  Share2,
  Shield,
  Star,
  StickyNote,
  Trash2,
  Upload,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import {
  encryptMessage,
  decryptMessage,
  decryptGroupKey,
  decryptWithGroupKey,
  decryptWithPassphrase,
  getPublicKeyFromPrivateKey,
  generateGroupKey,
  encryptGroupKey,
} from "@clickrypt/crypto";
import {
  apiClient,
  ApiError,
  setAccessToken,
  getAccessToken,
  type Folder,
  type PermissionEntry,
  type ResourceListItem,
  type Tag,
  type UserProfile,
} from "@/lib/api/client";
import { useSessionStore, getStoredEmail, hasStoredSession, clearStoredSession } from "@/stores/session";
import { useSync } from "@/lib/api/sync";

function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session has expired. Please log in again.";
    if (err.status >= 500) return "Server error. Please try again.";
    return err.message || "Request failed.";
  }
  if (err instanceof Error) return err.message;
  return "Failed. Please try again.";
}

export default function VaultPage() {
  const router = useRouter();
  const { unlocked, lock, email, privateKey, resetLockTimer, deploymentMode, setDeploymentMode, orgRole } = useSessionStore();
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateTotp, setShowCreateTotp] = useState(false);
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState<string | null>(null);
  const [createFolderGroupId, setCreateFolderGroupId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showReUnlock, setShowReUnlock] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const createDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceListItem | null>(null);
  const [decryptedSecret, setDecryptedSecret] = useState<Record<string, string> | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [secretAccessible, setSecretAccessible] = useState(true);
  const [dialogMode, setDialogMode] = useState<"detail" | "edit" | "share" | "permissions" | "info">("detail");
  const [ownerShareResource, setOwnerShareResource] = useState<{ id: string; name: string; secretPayload: string; selfPublicKey: string } | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [decryptingPasswordId, setDecryptingPasswordId] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<ResourceListItem | null>(null);

  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [r, f, t] = await Promise.all([
        apiClient.listResources(),
        apiClient.listFolders(),
        apiClient.listTags(),
      ]);
      setResources(r);
      setFolders(f);
      setTags(t);
      setFavoriteIds(new Set(r.filter((res) => (res as any).isFavorite).map((res) => res.id)));
    } catch (err) {
      console.error("[Vault] loadData failed:", err);
      const message = err instanceof Error ? err.message : "Failed to load vault data";
      setError(message);
      // Only redirect to login on auth failure (401), not on all errors
      if (err && typeof err === "object" && "status" in err && err.status === 401) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Cross-device sync via WebSocket
  const { isConnected: syncConnected, connectionError: syncError } = useSync({
    token: getAccessToken(),
    onResourceCreate: () => {
      loadData();
    },
    onResourceUpdate: () => {
      loadData();
    },
    onResourceDelete: (resourceId) => {
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
    },
    onFolderCreate: (folder) => {
      // Do not add group-scoped folders to the main workspace
      if ((folder as any).groupId) return;
      setFolders((prev) => {
        if (prev.some((f) => f.id === folder.id)) return prev;
        return [...prev, folder];
      });
    },
    onFolderUpdate: (folder) => {
      if ((folder as any).groupId) return;
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    },
    onFolderDelete: (folderId) => {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
    },
  });

  useEffect(() => {
    if (!unlocked) {
      // Check if setup is needed first
      apiClient.getSetupStatus().then((s) => {
        if (s.needsSetup) {
          clearStoredSession();
          setAccessToken(null);
          router.push("/onboarding");
          return;
        }
        // If we have a stored access token + email, show re-unlock dialog instead of full login.
        if (hasStoredSession()) {
          setShowReUnlock(true);
          return;
        }
        router.push("/login");
      }).catch(() => {
        // If setup status check fails, fall back to existing behavior
        if (hasStoredSession()) {
          setShowReUnlock(true);
          return;
        }
        router.push("/login");
      });
      return;
    }
    setShowReUnlock(false);
    loadData();
  }, [unlocked, router, loadData]);

  // Fetch deployment mode config once on mount
  useEffect(() => {
    apiClient.getDeploymentConfig().then((cfg) => setDeploymentMode(cfg.deploymentMode)).catch(() => {});
  }, [setDeploymentMode]);

  // Debounce search for server-side filtering
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!unlocked) return;
    const handleActivity = () => resetLockTimer();
    document.addEventListener("mousemove", handleActivity);
    document.addEventListener("keydown", handleActivity);
    window.addEventListener("beforeunload", lock);
    return () => {
      document.removeEventListener("mousemove", handleActivity);
      document.removeEventListener("keydown", handleActivity);
      window.removeEventListener("beforeunload", lock);
    };
  }, [unlocked, lock, resetLockTimer]);

  // Close Create dropdown when clicking outside
  useEffect(() => {
    if (!createOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (createDropdownRef.current && !createDropdownRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [createOpen]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }

  function toggleExpandFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function handleLogout() {
    try { await apiClient.logout(); } catch {}
    setAccessToken(null);
    lock();
    router.push("/login");
  }

  async function ensureAndDecryptGroupKey(groupId: string): Promise<string | null> {
    if (!privateKey) return null;
    const currentUserId = useSessionStore.getState().userId;
    if (!currentUserId) return null;
    const { encryptedGroupKey, keyExists } = await apiClient.getGroupKey(groupId);
    if (encryptedGroupKey) {
      const groupKey = await decryptGroupKey(encryptedGroupKey, privateKey);
      // Redistribute key to any org members who don't have it yet
      try {
        const recipients = await apiClient.getGroupRecipients(groupId);
        const missingKey = recipients.filter((r: any) => r.publicKey && !r.hasGroupKey);
        if (missingKey.length > 0) {
          const wrapped = await encryptGroupKey(groupKey, missingKey.map((r: any) => ({ userId: r.userId, publicKey: r.publicKey })));
          for (const r of missingKey) {
            if (wrapped[r.userId]) {
              await apiClient.setGroupKey(groupId, r.userId, wrapped[r.userId]);
            }
          }
        }
      } catch (err) {
        console.error("[ensureAndDecryptGroupKey] Failed to redistribute key:", err);
      }
      return groupKey;
    }
    if (!keyExists) {
      // No key exists yet — generate and distribute to all org members
      const key = await generateGroupKey();
      const publicKey = await getPublicKeyFromPrivateKey(privateKey);
      const recipients = await apiClient.getGroupRecipients(groupId);
      const recipientsWithKeys = recipients.filter((r: any) => r.publicKey);
      if (recipientsWithKeys.length === 0) {
        const wrapped = await encryptGroupKey(key, [{ userId: currentUserId, publicKey }]);
        await apiClient.setGroupKey(groupId, currentUserId, wrapped[currentUserId], key);
      } else {
        const wrapped = await encryptGroupKey(key, recipientsWithKeys.map((r: any) => ({ userId: r.userId, publicKey: r.publicKey })));
        // Send rawGroupKey with the first setGroupKey call so backend stores it for auto-distribution
        let rawKeySent = false;
        for (const r of recipientsWithKeys) {
          if (wrapped[r.userId]) {
            await apiClient.setGroupKey(groupId, r.userId, wrapped[r.userId], rawKeySent ? undefined : key);
            rawKeySent = true;
          }
        }
      }
      return key;
    }
    // Key exists but not shared with us — backend should have auto-encrypted it
    // If we still get null, the raw key wasn't stored (pre-fix groups). Retry once.
    console.warn("[ensureAndDecryptGroupKey] Group key exists but not shared with current user. groupId:", groupId);
    return null;
  }

  async function handleReveal(resource: ResourceListItem) {
    if (!privateKey) return;
    // Check if resource still exists in local state (may have been deleted)
    if (!resources.some((r) => r.id === resource.id)) {
      setError("Resource no longer exists");
      return;
    }
    setDecrypting(true);
    setError(null);
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      let plaintext = "";
      if (resource.groupId) {
        const groupKey = await ensureAndDecryptGroupKey(resource.groupId);
        if (!groupKey) throw new Error("No group key available");
        const { iv, ciphertext } = JSON.parse(encryptedData);
        plaintext = await decryptWithGroupKey({ iv, ciphertext }, groupKey);
      } else {
        const result = await decryptMessage(encryptedData, privateKey);
        plaintext = result.plaintext;
      }
      setDecryptedSecret(JSON.parse(plaintext));
      setSecretAccessible(true);
      setRevealPassword(false);
      setSelectedResource(resource);
      setDialogMode("detail");
    } catch (err) {
      console.error("[handleReveal] Failed to decrypt resource:", resource.id, err);
      setDecryptedSecret(null);
      setSecretAccessible(false);
      setRevealPassword(false);
      setSelectedResource(resource);
      setDialogMode("detail");
    } finally {
      setDecrypting(false);
    }
  }

  async function handleCopy(field: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    if (clipboardTimer.current) clearTimeout(clipboardTimer.current);
    clipboardTimer.current = setTimeout(() => {
      setCopiedField(null);
      navigator.clipboard.writeText("");
    }, 30_000);
  }

  async function handleDelete() {
    if (!selectedResource) return;
    if (!confirm(`Delete "${selectedResource.name}"?`)) return;
    try {
      await apiClient.deleteResource(selectedResource.id);
      setResources((prev) => prev.filter((r) => r.id !== selectedResource.id));
      closeDetail();
    } catch {
      setError("Failed to delete.");
    }
  }

  // Table row delete handlers
  function handleDeleteClick(resource: ResourceListItem) {
    setResourceToDelete(resource);
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!resourceToDelete) return;
    setDeletingId(resourceToDelete.id);
    setError(null);
    try {
      await apiClient.deleteResource(resourceToDelete.id);
      setResources((prev) => prev.filter((r) => r.id !== resourceToDelete.id));
      // Clear selected resource if it matches the deleted one
      if (selectedResource?.id === resourceToDelete.id) {
        setSelectedResource(null);
        setDecryptedSecret(null);
        setSecretAccessible(true);
        setRevealPassword(false);
        setDialogMode("detail");
      }
      setShowDeleteConfirm(false);
      setResourceToDelete(null);
      showToast("Resource deleted");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete() {
    setShowDeleteConfirm(false);
    setResourceToDelete(null);
  }

  async function handleToggleFavorite(resourceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await apiClient.toggleFavorite(resourceId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (res.isFavorite) next.add(resourceId);
        else next.delete(resourceId);
        return next;
      });
    } catch {
      // ignore
    }
  }

  async function handleRevealPassword(resource: ResourceListItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!privateKey) return;

    // Check if resource still exists in local state (may have been deleted)
    if (!resources.some((r) => r.id === resource.id)) {
      showToast("Resource no longer exists");
      return;
    }

    // If already revealed, hide it
    if (revealedPasswords[resource.id]) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[resource.id];
        return next;
      });
      return;
    }

    // Decrypt the password
    setDecryptingPasswordId(resource.id);
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      let plaintext = "";
      if (resource.groupId) {
        const groupKey = await ensureAndDecryptGroupKey(resource.groupId);
        if (!groupKey) throw new Error("No group key available");
        const { iv, ciphertext } = JSON.parse(encryptedData);
        plaintext = await decryptWithGroupKey({ iv, ciphertext }, groupKey);
      } else {
        const result = await decryptMessage(encryptedData, privateKey);
        plaintext = result.plaintext;
      }
      const secret = JSON.parse(plaintext);
      setRevealedPasswords((prev) => ({ ...prev, [resource.id]: secret.password ?? "" }));
    } catch (err) {
      console.error("[handleRevealPassword] Failed to decrypt password for resource:", resource.id, err);
      showToast("Group key not yet distributed — ask a colleague to open the group page.");
    } finally {
      setDecryptingPasswordId(null);
    }
  }

  function handleLock() {
    lock();
    router.push("/login");
  }

  function closeDetail() {
    setSelectedResource(null);
    setDecryptedSecret(null);
    setSecretAccessible(true);
    setRevealPassword(false);
    setDialogMode("detail");
    setError(null);
  }

  let filtered = resources;
  if (selectedFolder) filtered = filtered.filter((r) => r.folder?.id === selectedFolder);
  if (selectedTag) filtered = filtered.filter((r) => r.tags.some((t) => t.id === selectedTag));
  if (showFavoritesOnly) filtered = filtered.filter((r) => favoriteIds.has(r.id));
  if (debouncedSearch) {
    const q = debouncedSearch.toLowerCase();
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.uri?.toLowerCase().includes(q) ?? false)
    );
  }

  // Build folder tree from flat list
  const folderTree = folders.filter((f) => !f.parentFolderId);
  function renderFolderNode(folder: Folder, depth: number): React.ReactNode {
    const children = folders.filter((f) => f.parentFolderId === folder.id);
    const isExpanded = expandedFolders.has(folder.id);
    return (
      <div key={folder.id}>
        <div
          className={`group flex items-center justify-between rounded-md ${selectedFolder === folder.id ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <div className="flex flex-1 items-center">
            {children.length > 0 ? (
              <button
                onClick={() => toggleExpandFolder(folder.id)}
                className="px-1 py-1.5 text-[#8ba3b8] hover:text-white"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
              </button>
            ) : (
              <span className="w-5" />
            )}
            <button
              onClick={() => setSelectedFolder(folder.id)}
              className="flex flex-1 items-center gap-2 py-1.5 pr-2 text-left text-sm"
            >
              <FolderIcon className="h-3.5 w-3.5" /> {folder.name}
            </button>
          </div>
          <div className="flex items-center opacity-0 group-hover:opacity-100">
            <button
              onClick={() => { setSelectedFolder(folder.id); setShowCreate(true); }}
              className="px-1.5 py-1.5 text-[#8ba3b8] hover:text-white"
              title="New resource in this folder"
            >
              <Key className="h-3 w-3" />
            </button>
            <button
              onClick={() => { setCreateFolderParent(folder.id); setCreateFolderGroupId(folder.groupId ?? null); setShowCreateFolder(true); }}
              className="px-1.5 py-1.5 text-[#8ba3b8] hover:text-white"
              title="New subfolder"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </div>
        </div>
        {isExpanded && children.map((c) => renderFolderNode(c, depth + 1))}
      </div>
    );
  }

  if (showReUnlock) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ReUnlockDialog onClose={() => { setShowReUnlock(false); router.push("/login"); }} onUnlocked={() => setShowReUnlock(false)} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/clickrypt.png" alt="Clickrypt" className="h-8 w-8" />
            <span className="text-xl font-bold">Clickrypt</span>
          </div>
          <div className="relative" ref={createDropdownRef}>
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              Create
              <ChevronDown className={`h-4 w-4 transition-transform ${createOpen ? "rotate-180" : ""}`} />
            </button>

            {createOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-[#2a4055] bg-[#1a3349] py-1 shadow-xl">
                <button
                  onClick={() => { setCreateOpen(false); setShowCreate(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <Key className="h-4 w-4" /> Password
                </button>
                <button
                  onClick={() => { setCreateOpen(false); setShowCreateTotp(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <Clock className="h-4 w-4" /> TOTP
                </button>
                <button
                  onClick={() => { setCreateOpen(false); showToast("Coming soon"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <ListTree className="h-4 w-4" /> Custom fields
                </button>
                <button
                  onClick={() => { setCreateOpen(false); showToast("Coming soon"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <Pin className="h-4 w-4" /> Pin code
                </button>
                <button
                  onClick={() => { setCreateOpen(false); setShowCreateNote(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <StickyNote className="h-4 w-4" /> Notes
                </button>

                <div className="my-1 border-t border-[#2a4055]" />

                <button
                  onClick={() => { setCreateOpen(false); setShowCreateFolder(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <FolderPlus className="h-4 w-4" /> Folder
                </button>
                <button
                  onClick={() => { setCreateOpen(false); router.push("/import"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <FileUp className="h-4 w-4" /> Import resources
                </button>
                <button
                  onClick={() => { setCreateOpen(false); router.push("/export"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#1ebbd4]"
                >
                  <Download className="h-4 w-4" /> Export resources
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${syncConnected ? "bg-green-500" : "bg-red-500"}`} title={syncConnected ? "Sync connected" : syncError || "Sync disconnected"} />
            <span className="text-xs text-[#8ba3b8]">{syncConnected ? "Synced" : "Offline"}</span>
          </div>
          <span className="text-sm text-[#8ba3b8]">{email}</span>
          <button onClick={handleLock} className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]">
            <Lock className="h-4 w-4" /> Lock
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-6 py-4">
        <aside className="w-56 shrink-0 space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-[#8ba3b8]">Filters</h3>
            <button onClick={() => { setSelectedFolder(null); setShowFavoritesOnly(false); }} className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${!selectedFolder && !showFavoritesOnly ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}>All Items</button>
            <button onClick={() => { setSelectedFolder(null); setShowFavoritesOnly(true); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${showFavoritesOnly ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}>
              <Star className="h-3.5 w-3.5" /> Favorites
            </button>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-[#8ba3b8]">My Workspace</h3>
              <button
                onClick={() => { setCreateFolderParent(null); setShowCreateFolder(true); }}
                className="text-[#8ba3b8] hover:text-white"
                title="New folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {folderTree.map((f) => renderFolderNode(f, 0))}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-[#8ba3b8]">Manage</h3>
            <button onClick={() => router.push("/settings/profile")} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-[#8ba3b8] hover:bg-[#213548]/50">
              <UserCircle className="h-3.5 w-3.5" /> Profile
            </button>
            <button onClick={() => router.push("/settings/mfa")} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-[#8ba3b8] hover:bg-[#213548]/50">
              <Shield className="h-3.5 w-3.5" /> MFA
            </button>
            {deploymentMode === "organization" && (
              <button onClick={() => router.push("/settings/groups")} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-[#8ba3b8] hover:bg-[#213548]/50">
                <Users className="h-3.5 w-3.5" /> Groups
              </button>
            )}
            {deploymentMode === "organization" && (orgRole === "OWNER" || orgRole === "ADMIN") && (
              <button onClick={() => router.push("/admin")} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-[#8ba3b8] hover:bg-[#213548]/50">
                <Shield className="h-3.5 w-3.5" /> Members
              </button>
            )}
            <button onClick={() => router.push("/import")} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-[#8ba3b8] hover:bg-[#213548]/50">
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
          </div>
          {tags.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-[#8ba3b8]">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button key={t.id} onClick={() => setSelectedTag(selectedTag === t.id ? null : t.id)} className={`rounded-full px-2.5 py-1 text-xs ${selectedTag === t.id ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}>{t.name}</button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba3b8]" />
              <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
          </div>

          {selectedFolder && (() => {
            const folder = folders.find((f) => f.id === selectedFolder);
            if (!folder) return null;
            const breadcrumbs: Folder[] = [];
            let current: Folder | undefined = folder;
            while (current) {
              breadcrumbs.unshift(current);
              current = folders.find((f) => f.id === current!.parentFolderId);
            }
            return (
              <div className="flex items-center gap-1 text-sm text-[#8ba3b8]">
                <button onClick={() => setSelectedFolder(null)} className="hover:text-white">All Items</button>
                {breadcrumbs.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <span className="text-[#5a7a95]">/</span>
                    <button
                      onClick={() => setSelectedFolder(f.id)}
                      className={`hover:text-white ${f.id === selectedFolder ? "text-white font-medium" : ""}`}
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
              </div>
            );
          })()}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-12 text-center">
              <p className="text-[#8ba3b8]">{resources.length === 0 ? "Your vault is empty. Create your first password." : "No resources match your filters."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2a4055]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#2a4055] bg-[#1a3349]/80 text-xs uppercase text-[#8ba3b8]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Username</th>
                    <th className="px-4 py-3 font-semibold">Password</th>
                    <th className="px-4 py-3 font-semibold">URI</th>
                    <th className="px-4 py-3 font-semibold">Modified</th>
                    <th className="px-4 py-3 text-center font-semibold">★</th>
                    <th className="px-4 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => handleReveal(r)}
                      className={`cursor-pointer border-b border-[#2a4055]/50 hover:bg-[#213548]/40 ${i % 2 === 0 ? "bg-[#1a3349]/30" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#213548]">
                            {r.resourceType === "totp" ? (
                              <Clock className="h-3 w-3 text-[#1ebbd4]" />
                            ) : r.resourceType === "note" ? (
                              <StickyNote className="h-3 w-3 text-[#1ebbd4]" />
                            ) : (
                              <Lock className="h-3 w-3 text-[#8ba3b8]" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{r.name}</span>
                            <span
                              className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                                r.source === "group"
                                  ? "bg-purple-900/50 text-purple-200"
                                  : "bg-blue-900/50 text-blue-200"
                              }`}
                            >
                              {r.source === "group" ? "Group" : "Workplace"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-[#213548] px-2 py-0.5 text-xs text-[#c4d4e0]">
                          {r.source === "group" ? "Group" : "My Workplace"}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-[#8ba3b8]">
                        {r.folderPath ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[#8ba3b8]">
                        {r.resourceType === "totp" ? "TOTP" : r.resourceType === "note" ? "Note" : "Password"}
                      </td>
                      <td className="px-4 py-3 text-[#8ba3b8]">{(r.metadata as Record<string, string>)?.username ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.resourceType === "note" ? (
                          <span className="flex items-center gap-1 text-xs text-[#8ba3b8]">
                            <StickyNote className="h-3.5 w-3.5" />
                            Encrypted note
                          </span>
                        ) : decryptingPasswordId === r.id ? (
                          <span className="text-xs text-[#8ba3b8]">Decrypting…</span>
                        ) : revealedPasswords[r.id] ? (
                          <div className="flex items-center gap-2">
                            <code className="text-sm text-[#c4d4e0]">{revealedPasswords[r.id]}</code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(revealedPasswords[r.id]);
                                showToast("Password copied");
                              }}
                              className="rounded p-1 text-[#8ba3b8] hover:text-[#c4d4e0]"
                              title="Copy password"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleRevealPassword(r, e)}
                              className="rounded p-1 text-[#8ba3b8] hover:text-[#c4d4e0]"
                              title="Hide password"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => handleRevealPassword(r, e)}
                            className="flex items-center gap-1 text-[#8ba3b8] hover:text-[#c4d4e0]"
                            title="Click to reveal password"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="text-xs">••••••••</span>
                          </button>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-[#8ba3b8]">{r.uri ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#8ba3b8]">{new Date(r.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={(e) => handleToggleFavorite(r.id, e)} className={`p-1 ${favoriteIds.has(r.id) ? "text-[#f89c11]" : "text-[#5a7a95] hover:text-[#8ba3b8]"}`}>
                          <Star className="h-4 w-4" fill={favoriteIds.has(r.id) ? "currentColor" : "none"} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(orgRole === "OWNER" || orgRole === "ADMIN" || r.createdBy?.email === email) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(r); }}
                            disabled={deletingId === r.id}
                            className="p-1 text-[#8ba3b8] hover:text-[#f89c11] disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {showCreate && <CreateDialog folders={folders} privateKey={privateKey} defaultFolderId={selectedFolder} orgRole={orgRole} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadData(); }} onOwnerCreated={(id, name, secretPayload, selfPublicKey) => { setShowCreate(false); setOwnerShareResource({ id, name, secretPayload, selfPublicKey }); loadData(); }} />}

      {showCreateTotp && <CreateTotpDialog folders={folders} privateKey={privateKey} defaultFolderId={selectedFolder} orgRole={orgRole} onClose={() => setShowCreateTotp(false)} onCreated={() => { setShowCreateTotp(false); loadData(); }} onOwnerCreated={(id, name, secretPayload, selfPublicKey) => { setShowCreateTotp(false); setOwnerShareResource({ id, name, secretPayload, selfPublicKey }); loadData(); }} />}

      {showCreateNote && <CreateNoteDialog folders={folders} privateKey={privateKey} defaultFolderId={selectedFolder} orgRole={orgRole} onClose={() => setShowCreateNote(false)} onCreated={() => { setShowCreateNote(false); loadData(); }} onOwnerCreated={(id, name, secretPayload, selfPublicKey) => { setShowCreateNote(false); setOwnerShareResource({ id, name, secretPayload, selfPublicKey }); loadData(); }} />}

      {showCreateFolder && <CreateFolderDialog parentFolderId={createFolderParent} groupId={createFolderGroupId} onClose={() => { setShowCreateFolder(false); setCreateFolderParent(null); setCreateFolderGroupId(null); }} onCreated={() => { setShowCreateFolder(false); setCreateFolderParent(null); setCreateFolderGroupId(null); loadData(); }} />}

      {showReUnlock && <ReUnlockDialog onClose={() => { setShowReUnlock(false); router.push("/login"); }} onUnlocked={() => setShowReUnlock(false)} />}

      {ownerShareResource && (
        <OwnerShareDialog
          resource={ownerShareResource}
          onClose={() => setOwnerShareResource(null)}
          onDone={() => { setOwnerShareResource(null); loadData(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#213548] px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {selectedResource && dialogMode === "detail" && (
        <Dialog title={selectedResource.name} onClose={closeDetail}>
          <div className="space-y-4">
            {decrypting && <p className="text-sm text-[#8ba3b8]">Decrypting…</p>}
            {decryptedSecret ? (
              selectedResource.resourceType === "note" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[#8ba3b8]">Note</label>
                    <p className="whitespace-pre-wrap rounded-md bg-[#213548]/50 p-3 text-sm text-[#c4d4e0]">{decryptedSecret.note ?? ""}</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCopy("note", decryptedSecret.note ?? "")}
                      className="flex items-center gap-1 text-xs text-[#8ba3b8] hover:text-[#c4d4e0]"
                    >
                      {copiedField === "note" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedField === "note" ? "Copied" : "Copy note"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <SecretField label="Username" value={decryptedSecret.username ?? ""} copied={copiedField === "username"} onCopy={() => handleCopy("username", decryptedSecret.username ?? "")} />
                  <SecretField label="Password" value={decryptedSecret.password ?? ""} masked={!revealPassword} copied={copiedField === "password"} onCopy={() => handleCopy("password", decryptedSecret.password ?? "")} onToggleReveal={() => setRevealPassword((v) => !v)} />
                  {decryptedSecret.notes && <div><label className="mb-1 block text-xs text-[#8ba3b8]">Notes</label><p className="rounded-md bg-[#213548]/50 p-3 text-sm text-[#c4d4e0]">{decryptedSecret.notes}</p></div>}
                </>
              )
            ) : !secretAccessible ? (
              selectedResource.resourceType === "note" ? (
                <div>
                  <label className="mb-1 block text-xs text-[#8ba3b8]">Note</label>
                  <p className="flex items-center gap-2 text-sm text-[#8ba3b8]"><Lock className="h-4 w-4" /> Note content not shared with you</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[#8ba3b8]">Username</label>
                    <p className="text-sm text-[#c4d4e0]">{(selectedResource.metadata as Record<string, string>)?.username ?? "—"}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#8ba3b8]">Password</label>
                    <p className="flex items-center gap-2 text-sm text-[#8ba3b8]"><Lock className="h-4 w-4" /> Not shared with you</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#8ba3b8]">Notes</label>
                    <p className="text-sm text-[#8ba3b8]">—</p>
                  </div>
                </>
              )
            ) : null}
            {selectedResource.uri && <div><label className="mb-1 block text-xs text-[#8ba3b8]">URI</label><p className="text-sm text-[#c4d4e0]">{selectedResource.uri}</p></div>}
            <div className="grid grid-cols-3 gap-2 border-t border-[#2a4055] pt-4">
              {secretAccessible && <button onClick={() => setDialogMode("edit")} className={`${secondaryBtnClass} flex items-center justify-center gap-1.5`}><Pencil className="h-3.5 w-3.5" />Edit</button>}
              {secretAccessible && <button onClick={() => setDialogMode("share")} className={`${secondaryBtnClass} flex items-center justify-center gap-1.5`}><Share2 className="h-3.5 w-3.5" />Share</button>}
              {secretAccessible && <button onClick={() => setDialogMode("permissions")} className={`${secondaryBtnClass} flex items-center justify-center gap-1.5`}>Permissions</button>}
              <button onClick={() => setDialogMode("info")} className={`${secondaryBtnClass} flex items-center justify-center gap-1.5`}><Info className="h-3.5 w-3.5" />Info</button>
              {secretAccessible && <button onClick={handleDelete} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#f89c11] px-3 py-2 text-sm text-[#f89c11] hover:bg-[#f89c11]/20"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
            </div>
          </div>
        </Dialog>
      )}

      {selectedResource && dialogMode === "edit" && (
        <EditDialog resource={selectedResource} decryptedSecret={decryptedSecret} folders={folders} privateKey={privateKey} onClose={closeDetail} onUpdated={() => { setDialogMode("detail"); loadData(); if (selectedResource) handleReveal(selectedResource); }} />
      )}

      {selectedResource && dialogMode === "share" && (
        <ShareDialog resource={selectedResource} decryptedSecret={decryptedSecret} privateKey={privateKey} onClose={closeDetail} />
      )}

      {selectedResource && dialogMode === "permissions" && (
        <PermissionsDialog resource={selectedResource} onClose={closeDetail} />
      )}

      {selectedResource && dialogMode === "info" && (
        <InfoDialog resource={selectedResource} onClose={() => setDialogMode("detail")} />
      )}

      {showDeleteConfirm && resourceToDelete && (
        <Dialog title="Delete Resource" onClose={cancelDelete}>
          <div className="space-y-4">
            <p className="text-sm text-[#c4d4e0]">
              Are you sure you want to delete <strong>"{resourceToDelete.name}"</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={confirmDelete}
                disabled={deletingId === resourceToDelete.id}
                className="flex items-center gap-1.5 rounded-lg bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white hover:bg-[#dc2626] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId === resourceToDelete.id ? "Deleting…" : "Delete"}
              </button>
              <button
                onClick={cancelDelete}
                disabled={deletingId === resourceToDelete.id}
                className="rounded-lg border border-[#2a4055] px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#213548] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

async function getPublicKeyFromPrivateKeyLocal(privateKeyArmored: string): Promise<string> {
  return getPublicKeyFromPrivateKey(privateKeyArmored);
}

async function encryptForAllOrgMembers(secretPayload: string, selfPublicKey: string, selfUserId: string | null): Promise<Record<string, string>> {
  try {
    const members = await apiClient.getOrgMemberKeys();
    const additionalSecrets: Record<string, string> = {};
    await Promise.all(
      members
        .filter((m) => m.userId !== selfUserId)
        .map(async (m) => {
          const encrypted = await encryptMessage(secretPayload, [m.publicKey]);
          additionalSecrets[m.userId] = encrypted;
        })
    );
    return additionalSecrets;
  } catch (err) {
    console.error("[encryptForAllOrgMembers] Failed to auto-share with org members:", err);
    return {};
  }
}

function CreateDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated, onOwnerCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; onOwnerCreated: (resourceId: string, name: string, secretPayload: string, selfPublicKey: string) => void; }) {
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const secretPayload = JSON.stringify({ username, password, notes });
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);
      const currentUserId = useSessionStore.getState().userId;
      const isOwner = orgRole === "OWNER";
      const additionalSecrets = isOwner ? {} : await encryptForAllOrgMembers(secretPayload, publicKey, currentUserId);
      const sharingMode = isOwner ? "RESTRICTED" as const : "AUTO" as const;
      const created = await apiClient.createResource({ name, uri: uri || undefined, folderId: folderId || undefined, encryptedData, metadata: { username }, additionalSecrets, sharingMode });
      if (isOwner) {
        onOwnerCreated(created.id, name, secretPayload, publicKey);
      } else {
        onCreated();
      }
    } catch (err) {
      console.error("[CreateDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title="New Password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. GitHub" /></Field>
        <Field label="URI"><input type="url" value={uri} onChange={(e) => setUri(e.target.value)} className={inputClass} placeholder="https://github.com" /></Field>
        <Field label="Username"><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} /></Field>
        <Field label="Password" required><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} /></Field>
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function CreateFolderDialog({ parentFolderId, groupId, onClose, onCreated }: { parentFolderId: string | null; groupId: string | null; onClose: () => void; onCreated: () => void; }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiClient.createFolder({ 
        name, 
        parentFolderId: parentFolderId ?? undefined,
        groupId: groupId ?? undefined
      });
      onCreated();
    } catch (err) {
      console.error("[CreateFolderDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title={parentFolderId ? "New Subfolder" : "New Folder"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Work" autoFocus /></Field>
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Create Folder"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function CreateTotpDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated, onOwnerCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; onOwnerCreated: (resourceId: string, name: string, secretPayload: string, selfPublicKey: string) => void; }) {
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const secretPayload = JSON.stringify({ totpSecret });
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);
      const currentUserId = useSessionStore.getState().userId;
      const isOwner = orgRole === "OWNER";
      const additionalSecrets = isOwner ? {} : await encryptForAllOrgMembers(secretPayload, publicKey, currentUserId);
      const sharingMode = isOwner ? "RESTRICTED" as const : "AUTO" as const;
      const created = await apiClient.createResource({ name, encryptedData, metadata: { issuer }, resourceType: "totp", folderId: folderId || undefined, additionalSecrets, sharingMode });
      if (isOwner) {
        onOwnerCreated(created.id, name, secretPayload, publicKey);
      } else {
        onCreated();
      }
    } catch (err) {
      console.error("[CreateTotpDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title="New TOTP" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. GitHub 2FA" /></Field>
        <Field label="Issuer"><input type="text" value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inputClass} placeholder="e.g. GitHub" /></Field>
        <Field label="TOTP Secret (base32)" required><input type="text" required value={totpSecret} onChange={(e) => setTotpSecret(e.target.value)} className={inputClass} placeholder="e.g. JBSWY3DPEHPK3PXP" /></Field>
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function CreateNoteDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated, onOwnerCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; onOwnerCreated: (resourceId: string, name: string, secretPayload: string, selfPublicKey: string) => void; }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const secretPayload = JSON.stringify({ note });
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);
      const currentUserId = useSessionStore.getState().userId;
      const isOwner = orgRole === "OWNER";
      const additionalSecrets = isOwner ? {} : await encryptForAllOrgMembers(secretPayload, publicKey, currentUserId);
      const sharingMode = isOwner ? "RESTRICTED" as const : "AUTO" as const;
      const created = await apiClient.createResource({ name, encryptedData, resourceType: "note", folderId: folderId || undefined, additionalSecrets, sharingMode });
      if (isOwner) {
        onOwnerCreated(created.id, name, secretPayload, publicKey);
      } else {
        onCreated();
      }
    } catch (err) {
      console.error("[CreateNoteDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title="New Note" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Server credentials" /></Field>
        <Field label="Note" required><textarea required value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} min-h-[120px] resize-y`} placeholder="Write your encrypted note here…" /></Field>
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function OwnerShareDialog({ resource, onClose, onDone }: { resource: { id: string; name: string; secretPayload: string; selfPublicKey: string }; onClose: () => void; onDone: () => void; }) {
  const [shareWithAll, setShareWithAll] = useState(true);
  const [members, setMembers] = useState<{ userId: string; email: string; publicKey: string }[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = useSessionStore.getState().userId;

  useEffect(() => {
    Promise.all([
      apiClient.getOrgMemberKeys(),
      apiClient.getOrgInfo().then((org) => apiClient.listMembers(org.id)),
    ]).then(([keys, memberList]) => {
      const emailMap = new Map(memberList.map((m) => [m.userId, m.email]));
      setMembers(keys
        .filter((k) => k.userId !== currentUserId)
        .map((k) => ({ userId: k.userId, publicKey: k.publicKey, email: emailMap.get(k.userId) ?? k.userId }))
      );
    }).catch(() => {
      // If we can't load members, just allow "share with all" or "keep private"
    });
  }, [currentUserId]);

  async function handleSave() {
    setLoading(true); setError(null);
    try {
      if (shareWithAll) {
        const additionalSecrets: Record<string, string> = {};
        await Promise.all(
          members.map(async (m) => {
            additionalSecrets[m.userId] = await encryptMessage(resource.secretPayload, [m.publicKey]);
          })
        );
        await apiClient.updateResource(resource.id, { additionalSecrets, sharingMode: "AUTO" });
      } else if (selectedUserIds.size > 0) {
        const additionalSecrets: Record<string, string> = {};
        await Promise.all(
          members.filter((m) => selectedUserIds.has(m.userId)).map(async (m) => {
            additionalSecrets[m.userId] = await encryptMessage(resource.secretPayload, [m.publicKey]);
          })
        );
        await apiClient.updateResource(resource.id, { additionalSecrets, sharingMode: "RESTRICTED" });
      } else {
        await apiClient.updateResource(resource.id, { sharingMode: "RESTRICTED" });
      }
      onDone();
    } catch (err) {
      console.error("[OwnerShareDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setLoading(false); }
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <Dialog title={`Share "${resource.name}"`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-[#8ba3b8]">As the owner, you can choose who has access to this resource.</p>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={shareWithAll}
            onChange={(e) => setShareWithAll(e.target.checked)}
            className="h-4 w-4 rounded border-[#2a4055] bg-[#0f1f2e]"
          />
          <span className="text-sm text-[#c4d4e0]">Share with all organization members</span>
        </label>

        {!shareWithAll && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-[#8ba3b8]">Select specific members</p>
            {members.length === 0 ? (
              <p className="text-sm text-[#8ba3b8]">No other members in the organization.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#2a4055] p-2">
                {members.map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-[#213548]">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(m.userId)}
                      onChange={() => toggleUser(m.userId)}
                      className="h-4 w-4 rounded border-[#2a4055] bg-[#0f1f2e]"
                    />
                    <span className="text-sm text-[#c4d4e0]">{m.email}</span>
                  </label>
                ))}
              </div>
            )}
            {!shareWithAll && selectedUserIds.size === 0 && (
              <p className="text-xs text-[#8ba3b8]">No one selected — this resource will be private to you only.</p>
            )}
          </div>
        )}

        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={loading} className={primaryBtnClass}>
            {loading ? "Saving…" : "Save Sharing"}
          </button>
          <button onClick={onClose} className={secondaryBtnClass}>Skip for now</button>
        </div>
      </div>
    </Dialog>
  );
}

function ReUnlockDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void; }) {
  const email = getStoredEmail();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const unlock = useSessionStore((s) => s.unlock);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("No cached email found. Please log in again.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const challenge = await apiClient.verify(email);
      const privateKey = await decryptWithPassphrase(challenge.encryptedPrivateKey, passphrase);
      unlock(privateKey, email);
      onUnlocked();
    } catch (err) {
      console.error("[ReUnlockDialog] failed:", err);
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        clearStoredSession();
        setAccessToken(null);
        setError("Your session has expired. Redirecting to login…");
        setTimeout(() => onClose(), 1500);
      } else {
        setError("Wrong passphrase or corrupted key.");
      }
    } finally { setLoading(false); }
  }

  return (
    <Dialog title="Unlock your vault" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[#8ba3b8]">Your session is locked. Enter your master passphrase to continue.</p>
        <Field label="Email"><input type="email" value={email || ""} readOnly className={`${inputClass} opacity-60`} /></Field>
        <Field label="Master passphrase" required><input type="password" required value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus className={inputClass} /></Field>
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={loading} className={primaryBtnClass}>{loading ? "Unlocking…" : "Unlock"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Log in again</button></div>
      </form>
    </Dialog>
  );
}

function EditDialog({ resource, decryptedSecret, folders, privateKey, onClose, onUpdated }: { resource: ResourceListItem; decryptedSecret: Record<string, string> | null; folders: Folder[]; privateKey: string | null; onClose: () => void; onUpdated: () => void; }) {
  const isNote = resource.resourceType === "note";
  const [name, setName] = useState(resource.name);
  const [uri, setUri] = useState(resource.uri ?? "");
  const [username, setUsername] = useState(decryptedSecret?.username ?? "");
  const [password, setPassword] = useState(decryptedSecret?.password ?? "");
  const [notes, setNotes] = useState(decryptedSecret?.notes ?? "");
  const [noteContent, setNoteContent] = useState(decryptedSecret?.note ?? "");
  const [folderId, setFolderId] = useState(resource.folder?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) return;
    setSaving(true); setError(null);
    try {
      if (isNote) {
        const secretChanged = (decryptedSecret?.note ?? "") !== noteContent;
        const updateData: Record<string, unknown> = { name, folderId: folderId || undefined };
        if (secretChanged) {
          const secretPayload = JSON.stringify({ note: noteContent });
          const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
          updateData.encryptedData = await encryptMessage(secretPayload, [publicKey]);
          const currentUserId = useSessionStore.getState().userId;
          updateData.additionalSecrets = await encryptForAllOrgMembers(secretPayload, publicKey, currentUserId);
        }
        await apiClient.updateResource(resource.id, updateData);
      } else {
        const secretChanged = (decryptedSecret?.username ?? "") !== username || (decryptedSecret?.password ?? "") !== password || (decryptedSecret?.notes ?? "") !== notes;
        const updateData: Record<string, unknown> = { name, uri: uri || undefined, folderId: folderId || undefined, metadata: { username } };
        if (secretChanged) {
          const secretPayload = JSON.stringify({ username, password, notes });
          const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
          updateData.encryptedData = await encryptMessage(secretPayload, [publicKey]);
          const currentUserId = useSessionStore.getState().userId;
          updateData.additionalSecrets = await encryptForAllOrgMembers(secretPayload, publicKey, currentUserId);
        }
        await apiClient.updateResource(resource.id, updateData);
      }
      onUpdated();
    } catch { setError("Failed to update."); } finally { setSaving(false); }
  }

  return (
    <Dialog title={`Edit: ${resource.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        {isNote ? (
          <Field label="Note" required><textarea required value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className={`${inputClass} min-h-[120px] resize-y`} /></Field>
        ) : (
          <>
            <Field label="URI"><input type="url" value={uri} onChange={(e) => setUri(e.target.value)} className={inputClass} /></Field>
            <Field label="Username"><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></Field>
            <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} /></Field>
          </>
        )}
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save Changes"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function ShareDialog({ resource, decryptedSecret, privateKey, onClose }: { resource: ResourceListItem; decryptedSecret: Record<string, string> | null; privateKey: string | null; onClose: () => void; }) {
  const { deploymentMode } = useSessionStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [recipients, setRecipients] = useState<{ userId: string; email: string; name: string }[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<"READ" | "UPDATE" | "OWNER">("READ");
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"people" | "group">("people");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [existingPerms, setExistingPerms] = useState<PermissionEntry[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(true);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const groupHasMembers = selectedGroup ? selectedGroup.memberCount > 0 : false;

  useEffect(() => {
    apiClient.listMembersBasic().then((members) => {
      setUsers(members.map((m) => ({
        id: m.id,
        email: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        role: "USER",
        orgRole: "USER",
        status: "ACTIVE",
        orgId: "",
        fingerprint: null,
        avatarBase64: null,
        jobTitle: null,
        phone: null,
        bio: null,
        timezone: null,
        createdAt: "",
      })));
    }).catch(() => {});
    apiClient.listGroups().then(setGroups).catch(() => {});
    apiClient.listPermissions(resource.id).then((perms) => {
      setExistingPerms(perms);
      setLoadingPerms(false);
    }).catch(() => setLoadingPerms(false));
  }, [resource.id]);

  const suggestions = users
    .filter((u) => u.email !== useSessionStore.getState().email)
    .filter((u) => emailInput.length === 0 ||
      u.email.toLowerCase().includes(emailInput.toLowerCase()) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(emailInput.toLowerCase())
    )
    .slice(0, 20);

  function toggleSuggestion(userId: string) {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function addSelected() {
    const toAdd = users.filter((u) => selectedSuggestions.has(u.id) && !recipients.some((r) => r.userId === u.id));
    if (toAdd.length > 0) {
      setRecipients([...recipients, ...toAdd.map((u) => ({ userId: u.id, email: u.email, name: `${u.firstName} ${u.lastName}` }))]);
    }
    setSelectedSuggestions(new Set());
    setEmailInput("");
    setShowSuggestions(false);
  }

  function addRecipientByEmail() {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    const match = users.find((u) => u.email.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      setRecipients([...recipients, { userId: match.id, email: match.email, name: `${match.firstName} ${match.lastName}` }]);
      setEmailInput("");
      setShowSuggestions(false);
    } else {
      setRecipients([...recipients, { userId: "", email: trimmed, name: trimmed }]);
      setEmailInput("");
      setShowSuggestions(false);
    }
  }

  function removeRecipient(idx: number) {
    setRecipients(recipients.filter((_, i) => i !== idx));
  }

  async function handleShare() {
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    if (!decryptedSecret) {
      setError("Click the resource to reveal the secret first, then share.");
      return;
    }
    setSharing(true); setError(null);
    try {
      const secretPayload = JSON.stringify(decryptedSecret);

      // People sharing
      const resolved = recipients.length > 0 ? await Promise.all(recipients.map(async (r) => {
        let userId = r.userId;
        if (!userId) {
          const match = users.find((u) => u.email.toLowerCase() === r.email.toLowerCase());
          if (match) {
            userId = match.id;
          } else {
            const lookedUp = await apiClient.lookupUserByEmail(r.email);
            userId = lookedUp.id;
          }
        }
        const { publicKey } = await apiClient.getPublicKey(userId);
        const encryptedData = await encryptMessage(secretPayload, [publicKey]);
        return { userId, permission, encryptedData };
      })) : undefined;

      // Group sharing
      let groupRecipients: import("@/lib/api/client").GroupShareRecipient[] | undefined;
      if (activeTab === "group" && selectedGroupId) {
        const group = await apiClient.getGroup(selectedGroupId);
        const memberSecrets: Record<string, string> = {};
        await Promise.all(group.members.map(async (m) => {
          const { publicKey } = await apiClient.getPublicKey(m.userId);
          const encryptedData = await encryptMessage(secretPayload, [publicKey]);
          memberSecrets[m.userId] = encryptedData;
        }));
        const groupPermission: "READ" | "UPDATE" = permission === "OWNER" ? "UPDATE" : permission;
        groupRecipients = [{ groupId: selectedGroupId, permission: groupPermission, memberSecrets }];
      }

      if (!resolved && !groupRecipients) {
        setError("Add at least one recipient or select a group.");
        setSharing(false);
        return;
      }

      await apiClient.shareResource(resource.id, resolved, groupRecipients);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to share.";
      if (msg.includes("User not found")) {
        setError("This user hasn't registered on Clickrypt yet. Ask them to create an account first, then share again.");
      } else if (msg.includes("Only owners") || msg.includes("OWNER")) {
        setError("You need OWNER permission to share this resource.");
      } else {
        setError(msg);
      }
    } finally { setSharing(false); }
  }

  if (success) return <Dialog title="Shared!" onClose={onClose}><p className="py-6 text-center text-sm text-[#1ebbd4]">Resource shared successfully.</p></Dialog>;

  return (
    <Dialog title={`Share: ${resource.name}`} onClose={onClose}>
      <div className="space-y-4">
        {!decryptedSecret && <p className="text-sm text-[#8ba3b8]">Reveal the secret first to share it.</p>}

        {/* Existing shares summary */}
        <div>
          <label className="mb-1 block text-xs text-[#8ba3b8]">Currently shared with</label>
          {loadingPerms ? (
            <p className="text-sm text-[#8ba3b8]">Loading…</p>
          ) : existingPerms.length === 0 ? (
            <p className="text-sm text-[#8ba3b8]">Only you.</p>
          ) : (
            <div className="space-y-1.5">
              {existingPerms.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#2a4055] bg-[#213548]/30 px-3 py-2">
                  <div className="text-sm">
                    {p.aroType === "GROUP" ? (
                      <span><span className="font-medium">{p.groupName}</span> <span className="text-xs text-[#8ba3b8]">(group)</span></span>
                    ) : (
                      <span><span className="font-medium">{p.firstName} {p.lastName}</span> <span className="text-xs text-[#8ba3b8]">{p.email}</span></span>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.level === "OWNER" ? "bg-[#f89c11]/20 text-[#f89c11]" : p.level === "UPDATE" ? "bg-[#1ebbd4]/20 text-[#1ebbd4]" : "bg-[#213548] text-[#8ba3b8]"}`}>{p.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex border-b border-[#2a4055]">
          <button
            onClick={() => setActiveTab("people")}
            className={`px-4 py-2 text-sm ${activeTab === "people" ? "border-b-2 border-brand-500 text-[#c4d4e0]" : "text-[#8ba3b8]"}`}
          >
            Share with people
          </button>
          {deploymentMode === "organization" && (
            <button
              onClick={() => setActiveTab("group")}
              className={`px-4 py-2 text-sm ${activeTab === "group" ? "border-b-2 border-brand-500 text-[#c4d4e0]" : "text-[#8ba3b8]"}`}
            >
              Share with group
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-[#8ba3b8]">Permission level</label>
          <select value={permission} onChange={(e) => setPermission(e.target.value as "READ" | "UPDATE" | "OWNER")} className={inputClass}>
            <option value="READ">Read only</option>
            <option value="UPDATE">Can update</option>
            <option value="OWNER">Co-owner (full access)</option>
          </select>
        </div>

        {activeTab === "people" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-[#8ba3b8]">Add recipient by email or name</label>
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipientByEmail(); } }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="alice@company.com"
                    className={inputClass}
                  />
                  <button onClick={addRecipientByEmail} className={secondaryBtnClass}>Add</button>
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#2a4055] bg-[#1a3349] shadow-xl">
                    <div className="max-h-48 overflow-y-auto">
                      {suggestions.map((u) => {
                        const alreadyAdded = recipients.some((r) => r.userId === u.id);
                        const isChecked = selectedSuggestions.has(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => !alreadyAdded && toggleSuggestion(u.id)}
                            disabled={alreadyAdded}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${alreadyAdded ? "opacity-40" : "hover:bg-[#213548]"}`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isChecked ? "border-brand-500 bg-brand-500" : "border-[#2a4055]"}`}>
                              {isChecked && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            <span className="font-medium">{u.firstName} {u.lastName}</span>
                            <span className="text-xs text-[#8ba3b8]">{u.email}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedSuggestions.size > 0 && (
                      <div className="border-t border-[#2a4055] px-3 py-2">
                        <button onClick={addSelected} className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                          Add {selectedSuggestions.size} selected
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {recipients.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-[#8ba3b8]">Recipients ({recipients.length})</label>
                <div className="flex flex-wrap gap-2">
                  {recipients.map((r, idx) => (
                    <span key={idx} className="flex items-center gap-1.5 rounded-full border border-[#2a4055] bg-[#213548] px-3 py-1 text-xs">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[#8ba3b8]">{r.email}</span>
                      <button onClick={() => removeRecipient(idx)} className="text-[#8ba3b8] hover:text-[#f89c11]"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-[#8ba3b8]">Select group</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.memberCount} members)</option>
              ))}
            </select>
            {selectedGroupId && groups.find((g) => g.id === selectedGroupId)?.memberCount === 0 && (
              <p className="mt-1 text-xs text-[#f89c11]">This group has no members. Add members before sharing.</p>
            )}
          </div>
        )}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleShare}
            disabled={sharing || !decryptedSecret || (activeTab === "people" ? recipients.length === 0 : !selectedGroupId || !groupHasMembers)}
            className={primaryBtnClass}
          >
            {sharing ? "Sharing…" : activeTab === "people" ? `Share with ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}` : "Share with group"}
          </button>
          <button onClick={onClose} className={secondaryBtnClass}>Cancel</button>
        </div>
      </div>
    </Dialog>
  );
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const mins = Math.floor(diff / 60000);
  if (mins > 0) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
  return "Just now";
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#2a4055]/50 last:border-0">
      <span className="text-xs font-medium uppercase text-[#8ba3b8]">{label}</span>
      <div className="text-right text-sm text-[#c4d4e0]">{children}</div>
    </div>
  );
}

function InfoDialog({ resource, onClose }: { resource: ResourceListItem; onClose: () => void }) {
  const createdDate = new Date(resource.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const modifiedDate = new Date(resource.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const typeLabel = resource.resourceType === "totp" ? "TOTP" : resource.resourceType === "note" ? "Note" : "Password";

  return (
    <Dialog title={`Information: ${resource.name}`} onClose={onClose}>
      <div className="space-y-1">
        <InfoRow label="Created">
          <div>{timeAgo(resource.createdAt)}</div>
          <div className="text-xs text-[#8ba3b8]">{createdDate}</div>
        </InfoRow>
        <InfoRow label="Created by">
          {resource.createdBy ? (
            <div>
              <div>{resource.createdBy.name}</div>
              <div className="text-xs text-[#8ba3b8]">{resource.createdBy.email}</div>
            </div>
          ) : <span className="text-[#8ba3b8]">—</span>}
        </InfoRow>
        <InfoRow label="Modified">
          <div>{timeAgo(resource.updatedAt)}</div>
          <div className="text-xs text-[#8ba3b8]">{modifiedDate}</div>
        </InfoRow>
        <InfoRow label="Modified by">
          {resource.modifiedBy ? (
            <div>
              <div>{resource.modifiedBy.name}</div>
              <div className="text-xs text-[#8ba3b8]">{resource.modifiedBy.email}</div>
            </div>
          ) : <span className="text-[#8ba3b8]">—</span>}
        </InfoRow>
        <InfoRow label="Location">
          {resource.folder ? resource.folder.name : "No folder"}
        </InfoRow>
        <InfoRow label="Type">{typeLabel}</InfoRow>
        {resource.uri && <InfoRow label="URI"><span className="break-all">{resource.uri}</span></InfoRow>}
        {resource.tags.length > 0 && (
          <InfoRow label="Tags">
            <div className="flex flex-wrap justify-end gap-1">
              {resource.tags.map((t) => (
                <span key={t.id} className="rounded-full bg-[#213548] px-2 py-0.5 text-xs text-[#8ba3b8]">{t.name}</span>
              ))}
            </div>
          </InfoRow>
        )}
      </div>
      <div className="pt-4">
        <button onClick={onClose} className={`${secondaryBtnClass} w-full`}>Back</button>
      </div>
    </Dialog>
  );
}

function PermissionsDialog({ resource, onClose }: { resource: ResourceListItem; onClose: () => void; }) {
  const [perms, setPerms] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadPerms(); }, [resource.id]);

  async function loadPerms() {
    setLoading(true);
    try {
      const data = await apiClient.listPermissions(resource.id);
      setPerms(data);
      setError(null);
    } catch {
      setError("Failed to load. You may need OWNER permission.");
    } finally { setLoading(false); }
  }

  async function handleRevoke(userId: string) {
    try { await apiClient.revokeShare(resource.id, userId); setPerms(perms.filter((p) => p.aroId !== userId)); } catch { setError("Failed to revoke."); }
  }

  async function handleRevokeGroup(groupId: string) {
    try { await apiClient.revokeGroupShare(resource.id, groupId); setPerms(perms.filter((p) => !(p.aroType === "GROUP" && p.aroId === groupId))); } catch { setError("Failed to revoke group share."); }
  }

  return (
    <Dialog title={`Permissions: ${resource.name}`} onClose={onClose}>
      <div className="space-y-3">
        {loading && <p className="text-sm text-[#8ba3b8]">Loading…</p>}
        {error && <ErrorMsg msg={error} />}
        {perms.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-[#2a4055] bg-[#1a3349]/50 px-3 py-2">
            <div className="text-sm">
              {p.aroType === "GROUP" ? (
                <span><span className="font-medium">{p.groupName}</span> <span className="text-xs text-[#8ba3b8]">(group)</span></span>
              ) : (
                <span><span className="font-medium">{p.firstName} {p.lastName}</span> <span className="text-xs text-[#8ba3b8]">{p.email}</span></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.level === "OWNER" ? "bg-[#f89c11]/20 text-[#f89c11]" : p.level === "UPDATE" ? "bg-[#1ebbd4]/20 text-[#1ebbd4]" : "bg-[#213548] text-[#8ba3b8]"}`}>{p.level}</span>
              {p.level !== "OWNER" && (
                <button onClick={() => p.aroType === "GROUP" ? handleRevokeGroup(p.aroId) : handleRevoke(p.aroId)} className="text-xs text-[#f89c11] hover:text-[#f89c11]">
                  {p.aroType === "GROUP" ? "Revoke group" : "Revoke"}
                </button>
              )}
            </div>
          </div>
        ))}
        <button onClick={onClose} className={`${secondaryBtnClass} w-full`}>Close</button>
      </div>
    </Dialog>
  );
}

const inputClass = "w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";
const primaryBtnClass = "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
const secondaryBtnClass = "rounded-lg border border-[#2a4055] px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#213548]";

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="text-[#8ba3b8] hover:text-[#c4d4e0]"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode; }) {
  return <div><label className="mb-1 block text-sm text-[#c4d4e0]">{label}{required && <span className="text-[#f89c11]"> *</span>}</label>{children}</div>;
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="flex items-center gap-2 text-sm text-[#f89c11]"><AlertCircle className="h-4 w-4" />{msg}</p>;
}

function SecretField({ label, value, masked, copied, onCopy, onToggleReveal }: { label: string; value: string; masked?: boolean; copied: boolean; onCopy: () => void; onToggleReveal?: () => void; }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[#8ba3b8]">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-[#213548]/50 px-3 py-2 text-sm text-[#c4d4e0]">{masked ? "••••••••••••" : value}</code>
        {onToggleReveal && <button onClick={onToggleReveal} className="rounded-md p-2 text-[#8ba3b8] hover:bg-[#213548]">{masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>}
        <button onClick={onCopy} className="rounded-md p-2 text-[#8ba3b8] hover:bg-[#213548]">{copied ? <span className="text-xs text-[#1ebbd4]">Copied!</span> : <Copy className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}
