"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  decryptWithPassphrase,
  getPublicKeyFromPrivateKey,
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
import { useSessionStore, clearCallbackUrl } from "@/stores/session";
import { useSessionRestore } from "@/hooks/useSessionRestore";
import { useSync } from "@/lib/api/sync";
import { ReUnlockDialog } from "@/components/ReUnlockDialog";
import { SortableFolderTree } from "@/components/SortableFolderTree";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { ErrorMsg } from "@/components/ui/ErrorMsg";
import { inputClass, primaryBtnClass, secondaryBtnClass } from "@/components/ui/buttonClasses";
import { SecretText } from "@/components/vault/SecretText";
import { CopyButton } from "@/components/vault/CopyButton";
import { Section } from "@/components/vault/Section";
import VaultApp from "@/components/vault/VaultApp";

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
  const [showCreateCustom, setShowCreateCustom] = useState(false);
  const [showCreatePin, setShowCreatePin] = useState(false);
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

  // Lightweight refresh: only re-fetch resources (folders/tags unchanged)
  const refreshResources = useCallback(async () => {
    try {
      const r = await apiClient.listResources();
      setResources(r);
      setFavoriteIds(new Set(r.filter((res) => (res as any).isFavorite).map((res) => res.id)));
    } catch (err) {
      console.error("[Vault] refreshResources failed:", err);
      if (err && typeof err === "object" && "status" in err && err.status === 401) {
        router.push("/login");
      }
    }
  }, [router]);

  // A private (non-group) folder belongs in this vault only if the current user owns it
  const isOwnPrivateFolder = useCallback((folder: Folder) => {
    if ((folder as any).groupId) return false;
    const ownerId = (folder as any).ownerId;
    const currentUserId = useSessionStore.getState().userId;
    return !ownerId || !currentUserId || ownerId === currentUserId;
  }, []);

  // Cross-device sync via WebSocket
  const { isConnected: syncConnected, connectionError: syncError } = useSync({
    token: getAccessToken(),
    onResourceCreate: () => {
      refreshResources();
    },
    onResourceUpdate: () => {
      refreshResources();
    },
    onResourceDelete: (resourceId) => {
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
    },
    onFolderCreate: (folder) => {
      // Only add the caller's own private folders to the main workspace
      if (!isOwnPrivateFolder(folder)) return;
      setFolders((prev) => {
        if (prev.some((f) => f.id === folder.id)) return prev;
        return [...prev, folder];
      });
    },
    onFolderUpdate: (folder) => {
      if (!isOwnPrivateFolder(folder)) return;
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    },
    onFolderDelete: (folderId) => {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
    },
  });

  const { status: restoreStatus } = useSessionRestore();

  useEffect(() => {
    if (restoreStatus === "ready") {
      setShowReUnlock(false);
      clearCallbackUrl();
      loadData();
    } else if (restoreStatus === "locked") {
      setShowReUnlock(true);
    }
  }, [restoreStatus, loadData]);

  // Fetch deployment mode config once on mount
  useEffect(() => {
    apiClient.getDeploymentConfig().then((cfg) => setDeploymentMode(cfg.deploymentMode)).catch(() => {});
  }, [setDeploymentMode]);

  // Restore orgRole and userId if missing (e.g., after page reload)
  useEffect(() => {
    if (!orgRole || !useSessionStore.getState().userId) {
      apiClient.me().then((profile) => {
        if (profile.orgRole) useSessionStore.getState().setOrgRole(profile.orgRole);
        if (profile.id) useSessionStore.getState().setUserId(profile.id);
      }).catch(() => {});
    }
  }, [orgRole]);

  // Debounce search for server-side filtering
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!unlocked) return;
    const handleActivity = () => resetLockTimer();
    const handleBeforeUnload = () => {
      // Private key is memory-only and is lost on unload.
      // Do NOT call lock() here — it wipes cp_email from sessionStorage,
      // which breaks session restoration on reload.
      useSessionStore.setState({ privateKey: null, unlocked: false });
      useSessionStore.getState().resetLockTimer();
    };
    document.addEventListener("mousemove", handleActivity);
    document.addEventListener("keydown", handleActivity);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("mousemove", handleActivity);
      document.removeEventListener("keydown", handleActivity);
      window.removeEventListener("beforeunload", handleBeforeUnload);
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

  const toggleExpandFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  async function handleLogout() {
    try { await apiClient.logout(); } catch {}
    setAccessToken(null);
    lock();
    router.push("/login");
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
      const result = await decryptMessage(encryptedData, privateKey);
      const plaintext = result.plaintext;
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
      const result = await decryptMessage(encryptedData, privateKey);
      const plaintext = result.plaintext;
      const secret = JSON.parse(plaintext);
      setRevealedPasswords((prev) => ({ ...prev, [resource.id]: secret.password ?? "" }));
    } catch (err) {
      console.error("[handleRevealPassword] Failed to decrypt password for resource:", resource.id, err);
      showToast("Failed to decrypt password.");
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

  const filtered = useMemo(() => {
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
    return filtered;
  }, [resources, selectedFolder, selectedTag, showFavoritesOnly, favoriteIds, debouncedSearch]);

  const handleReorderFolder = useCallback(async (id: string, parentFolderId: string | null, sortOrder: number) => {
    setFolders((prev) => {
      const updated = prev.map((f) =>
        f.id === id ? { ...f, parentFolderId, sortOrder } : f
      );
      const siblings = updated
        .filter((f) => (f.parentFolderId ?? null) === (parentFolderId ?? null) && f.id !== id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      let idx = 0;
      return updated.map((f) => {
        if (f.id === id) return { ...f, sortOrder };
        if ((f.parentFolderId ?? null) === (parentFolderId ?? null) && f.id !== id) {
          if (idx === sortOrder) idx++;
          return { ...f, sortOrder: idx++ };
        }
        return f;
      });
    });
    try {
      await apiClient.reorderFolder(id, { parentFolderId, sortOrder });
    } catch (err) {
      console.error("[Vault] reorderFolder failed:", err);
      loadData();
    }
  }, [loadData]);

  const renderFolderActions = useCallback((folder: Folder) => {
    const canEdit = folder.myPermission === "OWNER" || folder.myPermission === "UPDATE";
    const canOwn = folder.myPermission === "OWNER";
    return (
      <>
        {canEdit && (
          <button
            onClick={() => { setSelectedFolder(folder.id); setShowCreate(true); }}
            className="px-1.5 py-1 text-[var(--text-muted)] hover:text-white"
            title="New resource in this folder"
          >
            <Key className="h-3 w-3" />
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => { setCreateFolderParent(folder.id); setCreateFolderGroupId(folder.groupId ?? null); setShowCreateFolder(true); }}
            className="px-1.5 py-1 text-[var(--text-muted)] hover:text-white"
            title="New subfolder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
        )}
        {canOwn && (
          <button
            onClick={async () => {
              if (!confirm(`Delete folder "${folder.name}"? This cannot be undone.`)) return;
              try {
                await apiClient.deleteFolder(folder.id);
                setSelectedFolder((prev) => (prev === folder.id ? null : prev));
                loadData();
              } catch (err) {
                setError(formatApiError(err));
              }
            }}
            className="px-1.5 py-1 text-[var(--text-muted)] hover:text-red-400"
            title="Delete folder"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </>
    );
  }, [loadData]);

  if (showReUnlock) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ReUnlockDialog onClose={() => { setShowReUnlock(false); router.push("/login"); }} onUnlocked={() => { setShowReUnlock(false); }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-200">
      <VaultApp
        folders={folders}
        resources={filtered}
        tags={tags}
        selectedFolderId={selectedFolder}
        onSelectFolder={setSelectedFolder}
        selectedResource={selectedResource}
        onSelectResource={(resource) => { if (resource) handleReveal(resource); }}
        revealedPasswords={revealedPasswords}
        decryptingPasswordId={decryptingPasswordId}
        onToggleReveal={handleRevealPassword}
        decryptedSecret={decryptedSecret}
        revealPassword={revealPassword}
        onToggleDetailReveal={() => setRevealPassword((v) => !v)}
        query={search}
        onQueryChange={setSearch}
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
        onCreate={(type, folderId) => {
          setSelectedFolder(folderId ?? selectedFolder);
          if (type === "folder") {
            setCreateFolderParent(folderId ?? selectedFolder);
            setShowCreateFolder(true);
          } else {
            setShowCreate(true);
          }
        }}
        onEdit={() => setDialogMode("edit")}
        onShare={() => setDialogMode("share")}
        onDelete={() => selectedResource && handleDeleteClick(selectedResource)}
        onInfo={() => setDialogMode("info")}
        onLock={handleLock}
        onLogout={handleLogout}
        onRefresh={loadData}
        email={email}
        syncConnected={syncConnected}
      />
      {selectedResource && dialogMode === "edit" && (
        <EditDialog resource={selectedResource} decryptedSecret={decryptedSecret} folders={folders} privateKey={privateKey} onClose={closeDetail} onUpdated={() => { setDialogMode("detail"); refreshResources(); if (selectedResource) handleReveal(selectedResource); }} />
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
            <p className="text-sm text-[var(--text)]">
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
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
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

function CreateDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; }) {
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
      const additionalSecrets: Record<string, string> = {};
      const sharingMode = "RESTRICTED" as const;
      await apiClient.createResource({ name, uri: uri || undefined, folderId: folderId || undefined, encryptedData, metadata: { username }, additionalSecrets, sharingMode });
      onCreated();
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
        <Field label="Username"><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} autoComplete="off" name="new-username" /></Field>
        <Field label="Password" required><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" name="new-password" /></Field>
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

function CreateTotpDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; }) {
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
      const additionalSecrets: Record<string, string> = {};
      const sharingMode = "RESTRICTED" as const;
      await apiClient.createResource({ name, encryptedData, metadata: { issuer }, resourceType: "totp", folderId: folderId || undefined, additionalSecrets, sharingMode });
      onCreated();
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

function CreateNoteDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; }) {
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
      const additionalSecrets: Record<string, string> = {};
      const sharingMode = "RESTRICTED" as const;
      await apiClient.createResource({ name, encryptedData, resourceType: "note", folderId: folderId || undefined, additionalSecrets, sharingMode });
      onCreated();
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

function CreateCustomFieldsDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; }) {
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [fields, setFields] = useState<{ label: string; value: string; hidden: boolean }[]>([{ label: "", value: "", hidden: false }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields([...fields, { label: "", value: "", hidden: false }]);
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx));
  }

  function updateField(idx: number, patch: Partial<{ label: string; value: string; hidden: boolean }>) {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    const filled = fields.filter((f) => f.label.trim() || f.value.trim());
    if (filled.length === 0) {
      setError("At least one field is required.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const secretPayload = JSON.stringify({ fields: filled });
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);
      const additionalSecrets: Record<string, string> = {};
      const sharingMode = "RESTRICTED" as const;
      await apiClient.createResource({ name, encryptedData, resourceType: "custom_fields", folderId: folderId || undefined, additionalSecrets, sharingMode });
      onCreated();
    } catch (err) {
      console.error("[CreateCustomFieldsDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title="New Custom Fields" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Bank details" /></Field>
        <div className="space-y-3">
          {fields.map((f, idx) => (
            <div key={idx} className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Field {idx + 1}</span>
                {fields.length > 1 && <button type="button" onClick={() => removeField(idx)} className="text-xs text-[var(--warning)] hover:text-[var(--warning)]">Remove</button>}
              </div>
              <Field label="Label"><input type="text" value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} className={inputClass} placeholder="e.g. Account number" /></Field>
              <Field label="Value"><input type={f.hidden ? "password" : "text"} value={f.value} onChange={(e) => updateField(idx, { value: e.target.value })} className={inputClass} /></Field>
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input type="checkbox" checked={f.hidden} onChange={(e) => updateField(idx, { hidden: e.target.checked })} className="rounded border-[var(--border)] bg-[var(--surface)]" />
                Hidden by default
              </label>
            </div>
          ))}
          <button type="button" onClick={addField} className={`${secondaryBtnClass} w-full`}>+ Add field</button>
        </div>
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function CreatePinDialog({ folders, privateKey, defaultFolderId, orgRole, onClose, onCreated }: { folders: Folder[]; privateKey: string | null; defaultFolderId: string | null; orgRole: string | null; onClose: () => void; onCreated: () => void; }) {
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [pin, setPin] = useState("");
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
    if (!pin) {
      setError("PIN code is required.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const secretPayload = JSON.stringify({ pin, notes });
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);
      const additionalSecrets: Record<string, string> = {};
      const sharingMode = "RESTRICTED" as const;
      await apiClient.createResource({ name, uri: uri || undefined, folderId: folderId || undefined, encryptedData, metadata: {}, resourceType: "pin_code", additionalSecrets, sharingMode });
      onCreated();
    } catch (err) {
      console.error("[CreatePinDialog] failed:", err);
      setError(formatApiError(err));
    } finally { setSaving(false); }
  }

  return (
    <Dialog title="New PIN Code" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Phone lock" /></Field>
        <Field label="URI"><input type="url" value={uri} onChange={(e) => setUri(e.target.value)} className={inputClass} placeholder="https://example.com" /></Field>
        <Field label="PIN" required><input type="password" required value={pin} onChange={(e) => setPin(e.target.value)} className={inputClass} autoComplete="off" /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} /></Field>
        {folders.length > 0 && <Field label="Folder"><select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {error && <ErrorMsg msg={error} />}
        <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={primaryBtnClass}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

function EditDialog({ resource, decryptedSecret, folders, privateKey, onClose, onUpdated }: { resource: ResourceListItem; decryptedSecret: Record<string, any> | null; folders: Folder[]; privateKey: string | null; onClose: () => void; onUpdated: () => void; }) {
  const isNote = resource.resourceType === "note";
  const isPin = resource.resourceType === "pin_code";
  const isCustom = resource.resourceType === "custom_fields";
  const [name, setName] = useState(resource.name);
  const [uri, setUri] = useState(resource.uri ?? "");
  const [username, setUsername] = useState(decryptedSecret?.username ?? "");
  const [password, setPassword] = useState(decryptedSecret?.password ?? "");
  const [notes, setNotes] = useState(decryptedSecret?.notes ?? "");
  const [noteContent, setNoteContent] = useState(decryptedSecret?.note ?? "");
  const [pin, setPin] = useState((decryptedSecret as any)?.pin ?? "");
  const [pinNotes, setPinNotes] = useState((decryptedSecret as any)?.notes ?? "");
  const initialFields = (decryptedSecret as any)?.fields ?? [];
  const [fields, setFields] = useState<{ label: string; value: string; hidden: boolean }[]>(initialFields);
  const [folderId, setFolderId] = useState(resource.folder?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addField() { setFields([...fields, { label: "", value: "", hidden: false }]); }
  function removeField(idx: number) { setFields(fields.filter((_, i) => i !== idx)); }
  function updateField(idx: number, patch: Partial<{ label: string; value: string; hidden: boolean }>) { setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f))); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey) return;
    setSaving(true); setError(null);
    try {
      const publicKey = await getPublicKeyFromPrivateKeyLocal(privateKey);
      let updateData: Record<string, unknown> = { name, uri: uri || undefined, folderId: folderId || undefined };
      let reencryptSecret: string | null = null;

      if (isNote) {
        updateData = { name, folderId: folderId || undefined };
        if ((decryptedSecret?.note ?? "") !== noteContent) {
          reencryptSecret = JSON.stringify({ note: noteContent });
        }
      } else if (isPin) {
        if (((decryptedSecret as any)?.pin ?? "") !== pin || ((decryptedSecret as any)?.notes ?? "") !== pinNotes) {
          reencryptSecret = JSON.stringify({ pin, notes: pinNotes });
        }
      } else if (isCustom) {
        if (JSON.stringify(fields) !== JSON.stringify(initialFields)) {
          reencryptSecret = JSON.stringify({ fields });
        }
      } else {
        updateData = { ...updateData, metadata: { username } };
        if ((decryptedSecret?.username ?? "") !== username || (decryptedSecret?.password ?? "") !== password || (decryptedSecret?.notes ?? "") !== notes) {
          reencryptSecret = JSON.stringify({ username, password, notes });
        }
      }

      if (reencryptSecret) {
        updateData.encryptedData = await encryptMessage(reencryptSecret, [publicKey]);
        if (resource.source !== "workplace") {
          const currentUserId = useSessionStore.getState().userId;
          updateData.additionalSecrets = await encryptForAllOrgMembers(reencryptSecret, publicKey, currentUserId);
        }
      }

      await apiClient.updateResource(resource.id, updateData);
      onUpdated();
    } catch { setError("Failed to update."); } finally { setSaving(false); }
  }

  return (
    <Dialog title={`Edit: ${resource.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        {isNote ? (
          <Field label="Note" required><textarea required value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className={`${inputClass} min-h-[120px] resize-y`} /></Field>
        ) : isPin ? (
          <>
            <Field label="URI"><input type="url" value={uri} onChange={(e) => setUri(e.target.value)} className={inputClass} /></Field>
            <Field label="PIN" required><input type="password" required value={pin} onChange={(e) => setPin(e.target.value)} className={inputClass} /></Field>
            <Field label="Notes"><textarea value={pinNotes} onChange={(e) => setPinNotes(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} /></Field>
          </>
        ) : isCustom ? (
          <div className="space-y-3">
            {fields.map((f, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Field {idx + 1}</span>
                  {fields.length > 1 && <button type="button" onClick={() => removeField(idx)} className="text-xs text-[var(--warning)] hover:text-[var(--warning)]">Remove</button>}
                </div>
                <Field label="Label"><input type="text" value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} className={inputClass} /></Field>
                <Field label="Value"><input type={f.hidden ? "password" : "text"} value={f.value} onChange={(e) => updateField(idx, { value: e.target.value })} className={inputClass} /></Field>
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <input type="checkbox" checked={f.hidden} onChange={(e) => updateField(idx, { hidden: e.target.checked })} className="rounded border-[var(--border)] bg-[var(--surface)]" />
                  Hidden by default
                </label>
              </div>
            ))}
            <button type="button" onClick={addField} className={`${secondaryBtnClass} w-full`}>+ Add field</button>
          </div>
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

  if (success) return <Dialog title="Shared!" onClose={onClose}><p className="py-6 text-center text-sm text-[var(--accent)]">Resource shared successfully.</p></Dialog>;

  return (
    <Dialog title={`Share: ${resource.name}`} onClose={onClose}>
      <div className="space-y-4">
        {!decryptedSecret && <p className="text-sm text-[var(--text-muted)]">Reveal the secret first to share it.</p>}

        {/* Existing shares summary */}
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Currently shared with</label>
          {loadingPerms ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : existingPerms.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Only you.</p>
          ) : (
            <div className="space-y-1.5">
              {existingPerms.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/30 px-3 py-2">
                  <div className="text-sm">
                    {p.aroType === "GROUP" ? (
                      <span><span className="font-medium">{p.groupName}</span> <span className="text-xs text-[var(--text-muted)]">(group)</span></span>
                    ) : (
                      <span><span className="font-medium">{p.firstName} {p.lastName}</span> <span className="text-xs text-[var(--text-muted)]">{p.email}</span></span>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.level === "OWNER" ? "bg-[var(--warning)]/20 text-[var(--warning)]" : p.level === "UPDATE" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--surface-hover)] text-[var(--text-muted)]"}`}>{p.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab("people")}
            className={`px-4 py-2 text-sm ${activeTab === "people" ? "border-b-2 border-brand-500 text-[var(--text)]" : "text-[var(--text-muted)]"}`}
          >
            Share with people
          </button>
          {deploymentMode === "organization" && (
            <button
              onClick={() => setActiveTab("group")}
              className={`px-4 py-2 text-sm ${activeTab === "group" ? "border-b-2 border-brand-500 text-[var(--text)]" : "text-[var(--text-muted)]"}`}
            >
              Share with group
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">Permission level</label>
          <select value={permission} onChange={(e) => setPermission(e.target.value as "READ" | "UPDATE" | "OWNER")} className={inputClass}>
            <option value="READ">Read only</option>
            <option value="UPDATE">Can update</option>
            <option value="OWNER">Co-owner (full access)</option>
          </select>
        </div>

        {activeTab === "people" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Add recipient by email or name</label>
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
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                    <div className="max-h-48 overflow-y-auto">
                      {suggestions.map((u) => {
                        const alreadyAdded = recipients.some((r) => r.userId === u.id);
                        const isChecked = selectedSuggestions.has(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => !alreadyAdded && toggleSuggestion(u.id)}
                            disabled={alreadyAdded}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${alreadyAdded ? "opacity-40" : "hover:bg-[var(--surface-hover)]"}`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isChecked ? "border-brand-500 bg-brand-500" : "border-[var(--border)]"}`}>
                              {isChecked && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            <span className="font-medium">{u.firstName} {u.lastName}</span>
                            <span className="text-xs text-[var(--text-muted)]">{u.email}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedSuggestions.size > 0 && (
                      <div className="border-t border-[var(--border)] px-3 py-2">
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
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Recipients ({recipients.length})</label>
                <div className="flex flex-wrap gap-2">
                  {recipients.map((r, idx) => (
                    <span key={idx} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-1 text-xs">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[var(--text-muted)]">{r.email}</span>
                      <button onClick={() => removeRecipient(idx)} className="text-[var(--text-muted)] hover:text-[var(--warning)]"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Select group</label>
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
              <p className="mt-1 text-xs text-[var(--warning)]">This group has no members. Add members before sharing.</p>
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
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--border)]/50 last:border-0">
      <span className="text-xs font-medium uppercase text-[var(--text-muted)]">{label}</span>
      <div className="text-right text-sm text-[var(--text)]">{children}</div>
    </div>
  );
}

function InfoDialog({ resource, onClose }: { resource: ResourceListItem; onClose: () => void }) {
  const createdDate = new Date(resource.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const modifiedDate = new Date(resource.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const typeLabel = resource.resourceType === "totp" ? "TOTP" : resource.resourceType === "note" ? "Note" : resource.resourceType === "pin_code" ? "PIN" : resource.resourceType === "custom_fields" ? "Custom" : "Password";

  return (
    <Dialog title={`Information: ${resource.name}`} onClose={onClose}>
      <div className="space-y-1">
        <InfoRow label="Created">
          <div>{timeAgo(resource.createdAt)}</div>
          <div className="text-xs text-[var(--text-muted)]">{createdDate}</div>
        </InfoRow>
        <InfoRow label="Created by">
          {resource.createdBy ? (
            <div>
              <div>{resource.createdBy.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{resource.createdBy.email}</div>
            </div>
          ) : <span className="text-[var(--text-muted)]">—</span>}
        </InfoRow>
        <InfoRow label="Modified">
          <div>{timeAgo(resource.updatedAt)}</div>
          <div className="text-xs text-[var(--text-muted)]">{modifiedDate}</div>
        </InfoRow>
        <InfoRow label="Modified by">
          {resource.modifiedBy ? (
            <div>
              <div>{resource.modifiedBy.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{resource.modifiedBy.email}</div>
            </div>
          ) : <span className="text-[var(--text-muted)]">—</span>}
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
                <span key={t.id} className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{t.name}</span>
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
        {loading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {error && <ErrorMsg msg={error} />}
        {perms.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2">
            <div className="text-sm">
              {p.aroType === "GROUP" ? (
                <span><span className="font-medium">{p.groupName}</span> <span className="text-xs text-[var(--text-muted)]">(group)</span></span>
              ) : (
                <span><span className="font-medium">{p.firstName} {p.lastName}</span> <span className="text-xs text-[var(--text-muted)]">{p.email}</span></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.level === "OWNER" ? "bg-[var(--warning)]/20 text-[var(--warning)]" : p.level === "UPDATE" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--surface-hover)] text-[var(--text-muted)]"}`}>{p.level}</span>
              {p.level !== "OWNER" && (
                <button onClick={() => p.aroType === "GROUP" ? handleRevokeGroup(p.aroId) : handleRevoke(p.aroId)} className="text-xs text-[var(--warning)] hover:text-[var(--warning)]">
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

function SecretField({ label, value, masked, copied: _copied, onCopy, onToggleReveal }: { label: string; value: string; masked?: boolean; copied: boolean; onCopy: () => void; onToggleReveal?: () => void; }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--text-muted)]">{label}</label>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-md bg-[var(--surface-hover)]/50 px-3 py-2 text-sm text-[var(--text)] truncate">
          <SecretText value={value} revealed={!masked} />
        </span>
        {onToggleReveal && (
          <button
            onClick={onToggleReveal}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}
        <CopyButton value={value} onCopy={onCopy} />
      </div>
    </div>
  );
}
