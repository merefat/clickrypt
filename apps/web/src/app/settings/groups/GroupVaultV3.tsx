// @ts-nocheck
/* eslint-disable */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Folder,
  FolderPlus,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  encryptMessage,
  decryptMessage,
  getPublicKeyFromPrivateKey,
} from "@clickrypt/crypto";
import { apiClient, ApiError, getAccessToken, type Folder, type ResourceListItem, type Tag } from "@/lib/api/client";
import { useSync } from "@/lib/api/sync";
import { useSessionStore } from "@/stores/session";
import { useSessionRestore } from "@/hooks/useSessionRestore";
import { SortableFolderTree } from "@/components/SortableFolderTree";

function formatApiError(err: unknown): string {
  if (err instanceof ApiError) return err.message || "Request failed";
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export default function GroupVaultV3() {
  const router = useRouter();
  const { unlocked, privateKey, userId } = useSessionStore();

  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const [newGroupName, setNewGroupName] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderFormName, setFolderFormName] = useState("");
  const [folderFormParent, setFolderFormParent] = useState<string | null>(null);

  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [movingFolder, setMovingFolder] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResource, setEditingResource] = useState<ResourceListItem | null>(null);
  const [decryptedSecret, setDecryptedSecret] = useState<Record<string, string> | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<ResourceListItem | null>(null);

  const [formName, setFormName] = useState("");
  const [formUri, setFormUri] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formFolderId, setFormFolderId] = useState("");

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [decryptingPasswordId, setDecryptingPasswordId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [movingResource, setMovingResource] = useState<ResourceListItem | null>(null);
  const [moveResourceTarget, setMoveResourceTarget] = useState("");

  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { status: restoreStatus } = useSessionRestore();
  useEffect(() => { if (restoreStatus === "unauthenticated") { router.push("/login"); } }, [restoreStatus, router]);
  useEffect(() => { loadGroups(); loadTags(); }, []);
  useEffect(() => {
    if (!selectedGroup) return;
    setSelectedFolderId(null);
    setDecryptedSecret(null);
    setEditingResource(null);
    loadGroupFolders(selectedGroup.id);
    loadGroupResources(selectedGroup.id, null);
    // Sync members for existing groups (admins can call this; fails silently for regular users)
    apiClient.syncGroupMembers(selectedGroup.id).catch(() => {});
  }, [selectedGroup?.id]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2000); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    if (!selectedGroup) return;
    loadGroupResources(selectedGroup.id, selectedFolderId);
  }, [selectedFolderId]);
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openMenuId]);

  const { isConnected: syncConnected } = useSync({
    token: getAccessToken(),
    onResourceCreate: (resource) => {
      if ((resource as any).groupId !== selectedGroup?.id) return;
      if (selectedGroup) loadGroupResources(selectedGroup.id, selectedFolderId);
    },
    onResourceUpdate: (resource) => {
      if ((resource as any).groupId !== selectedGroup?.id) return;
      if (selectedGroup) loadGroupResources(selectedGroup.id, selectedFolderId);
    },
    onResourceDelete: () => {
      if (selectedGroup) loadGroupResources(selectedGroup.id, selectedFolderId);
    },
    onFolderCreate: () => {
      if (selectedGroup) loadGroupFolders(selectedGroup.id);
    },
    onFolderUpdate: () => {
      if (selectedGroup) loadGroupFolders(selectedGroup.id);
    },
    onFolderDelete: () => {
      if (selectedGroup) loadGroupFolders(selectedGroup.id);
    },
  });

  async function loadGroups() {
    try { setLoading(true); setGroups(await apiClient.listGroups()); }
    catch (err) { setError(formatApiError(err)); }
    finally { setLoading(false); }
  }
  async function loadTags() { try { setTags(await apiClient.listTags()); } catch {} }
  async function loadGroupFolders(groupId: string) {
    try { setFolders(await apiClient.listGroupFolders(groupId)); } catch (err) { setError(formatApiError(err)); }
  }
  async function loadGroupResources(groupId: string, folderId: string | null) {
    try {
      const data = await apiClient.listGroupResources(groupId, folderId === null ? undefined : folderId);
      setResources(data);
      setFavoriteIds(new Set(data.filter((r: any) => r.isFavorite).map((r: any) => r.id)));
    } catch (err) { setError(formatApiError(err)); }
  }
  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault(); if (!newGroupName.trim()) return;
    setBusy(true);
    try { await apiClient.createGroup(newGroupName.trim()); setNewGroupName(""); setShowCreateGroup(false); await loadGroups(); }
    catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this group and all of its resources?")) return;
    setBusy(true);
    try { await apiClient.deleteGroup(id); if (selectedGroup?.id === id) setSelectedGroup(null); await loadGroups(); }
    catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleSelectGroup(id: string) {
    try { setSelectedGroup(await apiClient.getGroup(id)); } catch (err) { setError(formatApiError(err)); }
  }

  function openFolderForm(parentId: string | null) { setFolderFormParent(parentId); setFolderFormName(""); setShowFolderForm(true); }
  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault(); if (!selectedGroup || !folderFormName.trim()) return;
    setBusy(true);
    try {
      await apiClient.createFolder({ name: folderFormName.trim(), groupId: selectedGroup.id, parentFolderId: folderFormParent ?? undefined });
      setShowFolderForm(false); setFolderFormName(""); setFolderFormParent(null);
      if (folderFormParent) setExpandedFolders(p => new Set(p).add(folderFormParent));
      await loadGroupFolders(selectedGroup.id);
    } catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleRenameFolder(id: string) {
    if (!renameName.trim() || !selectedGroup) return;
    setBusy(true);
    try { await apiClient.updateFolder(id, { name: renameName.trim() }); setRenamingFolder(null); setRenameName(""); await loadGroupFolders(selectedGroup.id); }
    catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleMoveFolder(id: string) {
    if (!selectedGroup) return;
    setBusy(true);
    try {
      const target = moveTarget === "" ? null : moveTarget;
      await apiClient.updateFolder(id, { parentFolderId: target });
      setMovingFolder(null); setMoveTarget("");
      if (target) setExpandedFolders(p => new Set(p).add(target));
      await loadGroupFolders(selectedGroup.id);
    } catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleDeleteFolder(id: string) {
    if (!confirm("Delete this folder? Resources must be moved or deleted first.")) return;
    if (!selectedGroup) return;
    setBusy(true);
    try { await apiClient.deleteFolder(id); if (selectedFolderId === id) setSelectedFolderId(null); await loadGroupFolders(selectedGroup.id); await loadGroupResources(selectedGroup.id, selectedFolderId); }
    catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }

  function openCreateResource() {
    setEditingResource(null);
    setDecryptedSecret(null);
    setRevealPassword(false);
    setFormName(""); setFormUri(""); setFormUsername(""); setFormPassword(""); setFormNotes("");
    setFormFolderId(selectedFolderId ?? "");
    setShowResourceForm(true);
  }
  async function openEditResource(resource: ResourceListItem) {
    if (!privateKey || !selectedGroup) return;
    setEditingResource(resource);
    setFormName(resource.name); setFormUri(resource.uri ?? ""); setFormFolderId(resource.folder?.id ?? "");
    setRevealPassword(false);
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      const result = await decryptMessage(encryptedData, privateKey);
      const secret = JSON.parse(result.plaintext);
      setDecryptedSecret(secret);
      setFormUsername(secret.username ?? ""); setFormPassword(secret.password ?? ""); setFormNotes(secret.notes ?? "");
      setShowResourceForm(true);
    } catch { setError("Failed to decrypt password"); }
  }
  async function handleSaveResource(e: React.FormEvent) {
    e.preventDefault(); if (!selectedGroup || !privateKey) return;
    setBusy(true);
    try {
      const payload = JSON.stringify({ username: formUsername, password: formPassword, notes: formNotes });
      const publicKey = await getPublicKeyFromPrivateKey(privateKey);
      const encryptedData = await encryptMessage(payload, [publicKey]);
      // Encrypt for ALL org members with public keys (not just group members)
      let recipients;
      try {
        recipients = await apiClient.getGroupRecipients(selectedGroup.id);
      } catch (recipientsErr) {
        throw new Error("Failed to fetch group member keys. Cannot encrypt password for the group.");
      }
      const otherMembers = recipients.filter((r: any) => r.userId !== userId);
      const membersWithKeys = otherMembers.filter((r: any) => r.publicKey);
      if (otherMembers.length > 0 && membersWithKeys.length === 0) {
        console.warn("[GroupVault] No other org members have set up their encryption keys yet — password will only be visible to you until they set up their vault.");
      }
      if (otherMembers.length > 0 && membersWithKeys.length < otherMembers.length) {
        console.warn(`[GroupVault] ${otherMembers.length - membersWithKeys.length} org member(s) missing GPG keys — password will not be encrypted for them`);
      }
      const additionalSecrets: Record<string, string> = {};
      await Promise.all(
        membersWithKeys
          .map(async (r: any) => {
            additionalSecrets[r.userId] = await encryptMessage(payload, [r.publicKey]);
          })
      );
      if (editingResource) {
        const current = decryptedSecret || {};
        const secretChanged = formUsername !== (current.username ?? "") || formPassword !== (current.password ?? "") || formNotes !== (current.notes ?? "");
        const update: any = { name: formName.trim(), uri: formUri.trim() || undefined, folderId: formFolderId || undefined, metadata: { username: formUsername } };
        if (secretChanged) {
          update.encryptedData = encryptedData;
          update.additionalSecrets = additionalSecrets;
        }
        await apiClient.updateResource(editingResource.id, update);
        setToast("Password updated");
      } else {
        await apiClient.createResource({
          name: formName.trim(),
          uri: formUri.trim() || undefined,
          groupId: selectedGroup.id,
          folderId: formFolderId || undefined,
          encryptedData,
          additionalSecrets,
          resourceType: "password",
          metadata: { username: formUsername },
        });
        setToast("Password created");
      }
      setShowResourceForm(false);
      setEditingResource(null);
      setDecryptedSecret(null);
      await loadGroupResources(selectedGroup.id, selectedFolderId);
    } catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleReveal(resource: ResourceListItem) {
    if (!privateKey) return;
    setRevealPassword(false);
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      const result = await decryptMessage(encryptedData, privateKey);
      const secret = JSON.parse(result.plaintext);
      setDecryptedSecret(secret);
      setEditingResource(resource);
    } catch { setError("Failed to reveal password"); }
  }
  async function handleCopy(field: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopiedField(field); if (clipboardTimer.current) clearTimeout(clipboardTimer.current); clipboardTimer.current = setTimeout(() => { setCopiedField(null); navigator.clipboard.writeText("").catch(() => {}); }, 30_000); }
    catch { setError("Failed to copy"); }
  }
  async function handleToggleFavorite(resourceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await apiClient.toggleFavorite(resourceId);
      setFavoriteIds(p => { const n = new Set(p); if (res.isFavorite) n.add(resourceId); else n.delete(resourceId); return n; });
      if (selectedGroup) await loadGroupResources(selectedGroup.id, selectedFolderId);
    } catch {}
  }
  async function handleRevealPassword(resource: ResourceListItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!privateKey) return;
    if (revealedPasswords[resource.id]) {
      setRevealedPasswords(prev => { const n = { ...prev }; delete n[resource.id]; return n; });
      return;
    }
    setDecryptingPasswordId(resource.id);
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      const result = await decryptMessage(encryptedData, privateKey);
      const secret = JSON.parse(result.plaintext);
      setRevealedPasswords(prev => ({ ...prev, [resource.id]: secret.password ?? "" }));
    } catch { setToast("Failed to decrypt password"); }
    finally { setDecryptingPasswordId(null); }
  }
  async function handleMoveResource() {
    if (!movingResource || !selectedGroup) return;
    setBusy(true);
    try {
      const target = moveResourceTarget === "" ? undefined : moveResourceTarget;
      await apiClient.updateResource(movingResource.id, { folderId: target });
      setMovingResource(null); setMoveResourceTarget("");
      await loadGroupResources(selectedGroup.id, selectedFolderId);
      setToast("Resource moved");
    } catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function confirmDeleteResource() {
    if (!resourceToDelete || !selectedGroup) return;
    setBusy(true);
    try { await apiClient.deleteResource(resourceToDelete.id); setResourceToDelete(null); await loadGroupResources(selectedGroup.id, selectedFolderId); setToast("Password deleted"); }
    catch (err) { setError(formatApiError(err)); } finally { setBusy(false); }
  }
  async function handleSyncAll() {
    if (!selectedGroup || !privateKey) return;
    setSyncingAll(true);
    setError(null);
    try {
      const allResources = await apiClient.listGroupResources(selectedGroup.id);
      if (allResources.length === 0) { setToast("No resources to sync"); return; }
      const recipients = await apiClient.getGroupRecipients(selectedGroup.id);
      const otherMembers = recipients.filter((r: any) => r.userId !== userId);
      const membersWithKeys = otherMembers.filter((r: any) => r.publicKey);
      if (membersWithKeys.length === 0) { setError("No other org members have encryption keys set up."); return; }
      let synced = 0;
      for (const resource of allResources) {
        try {
          const { encryptedData } = await apiClient.getSecret(resource.id);
          const decrypted = await decryptMessage(encryptedData, privateKey);
          const payload = decrypted.plaintext;
          const additionalSecrets: Record<string, string> = {};
          await Promise.all(
            membersWithKeys.map(async (r: any) => {
              additionalSecrets[r.userId] = await encryptMessage(payload, [r.publicKey]);
            })
          );
          await apiClient.updateResource(resource.id, { additionalSecrets });
          synced++;
        } catch (err) {
          console.warn(`[SyncAll] Failed to sync resource ${resource.id}:`, err);
        }
      }
      setToast(`Synced ${synced} of ${allResources.length} passwords to all org members`);
      await loadGroupResources(selectedGroup.id, selectedFolderId);
    } catch (err) { setError(formatApiError(err)); } finally { setSyncingAll(false); }
  }

  function toggleExpandFolder(id: string) { setExpandedFolders(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  const currentFolder = useMemo(() => folders.find(f => f.id === selectedFolderId) ?? null, [folders, selectedFolderId]);
  const breadcrumbs = useMemo(() => {
    const path = []; let current = currentFolder;
    while (current) { path.unshift(current); current = folders.find(f => f.id === current!.parentFolderId); }
    return path;
  }, [currentFolder, folders]);
  const filteredResources = useMemo(() => {
    let list = resources.slice();
    if (search) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q) || (r.uri?.toLowerCase().includes(q) ?? false)); }
    if (selectedTag) list = list.filter(r => r.tags.some(t => t.id === selectedTag));
    if (showFavoritesOnly) list = list.filter(r => favoriteIds.has(r.id));
    return list;
  }, [resources, search, selectedTag, showFavoritesOnly, favoriteIds]);
  async function handleReorderFolder(id: string, parentFolderId: string | null, sortOrder: number) {
    if (!selectedGroup) return;
    setFolders((prev) => {
      const updated = prev.map((f) =>
        f.id === id ? { ...f, parentFolderId, sortOrder } : f
      );
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
      console.error("[GroupVault] reorderFolder failed:", err);
      if (selectedGroup) loadGroupFolders(selectedGroup.id);
    }
  }

  function renderGroupFolderActions(folder: Folder) {
    return (
      <>
        <button onClick={() => openFolderForm(folder.id)} className="px-1.5 py-1 text-[#8ba3b8] hover:text-white" title="New subfolder"><FolderPlus className="h-3 w-3" /></button>
        <button onClick={() => { setRenamingFolder(folder.id); setRenameName(folder.name); }} className="px-1.5 py-1 text-[#8ba3b8] hover:text-white" title="Rename"><Pencil className="h-3 w-3" /></button>
        <button onClick={() => { setMovingFolder(folder.id); setMoveTarget(""); }} className="px-1.5 py-1 text-[#8ba3b8] hover:text-white" title="Move"><ChevronRight className="h-3 w-3" /></button>
        <button onClick={() => handleDeleteFolder(folder.id)} className="px-1.5 py-1 text-[#8ba3b8] hover:text-[#f89c11]" title="Delete"><Trash2 className="h-3 w-3" /></button>
      </>
    );
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#8ba3b8]" /></div>;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
      <button onClick={() => router.push("/vault")} className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"><ArrowLeft className="h-4 w-4" /> Back to Vault</button>
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3"><Users className="h-6 w-6 text-brand-500" /><h1 className="text-2xl font-bold">Groups</h1></div>
        {!selectedGroup && <button onClick={() => setShowCreateGroup(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> New Group</button>}
      </div>

      {error && <div className="mb-4 flex items-center justify-between rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]"><span>{error}</span><button onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

      {showCreateGroup && !selectedGroup && (
        <form onSubmit={handleCreateGroup} className="mb-4 flex gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4">
          <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" className="flex-1 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</button>
          <button type="button" onClick={() => { setShowCreateGroup(false); setNewGroupName(""); }} className="rounded-lg border border-[#2a4055] px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]">Cancel</button>
        </form>
      )}

      {selectedGroup ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full shrink-0 space-y-4 lg:w-72">
            <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedGroup.name}</h2>
                  <p className="text-xs text-[#8ba3b8]">Your role: <span className={`font-medium ${selectedGroup.myRole === "OWNER" ? "text-[#f89c11]" : selectedGroup.myRole === "ADMIN" ? "text-[#1ebbd4]" : ""}`}>{selectedGroup.myRole ?? "None"}</span></p>
                </div>
                <button onClick={() => setSelectedGroup(null)} className="rounded-lg border border-[#2a4055] px-2 py-1 text-xs text-[#c4d4e0] hover:bg-[#213548]">Back</button>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-[#8ba3b8]">Folders</h3>
                <button onClick={() => openFolderForm(null)} className="text-[#8ba3b8] hover:text-white" title="New folder"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <button onClick={() => setSelectedFolderId(null)} className={`mb-1 w-full rounded-md px-3 py-1.5 text-left text-sm ${selectedFolderId === null ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}>All Items</button>
              <div className="space-y-0.5">
                <SortableFolderTree
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                  onReorder={handleReorderFolder}
                  expandedFolders={expandedFolders}
                  onToggleExpand={toggleExpandFolder}
                  actionButtons={renderGroupFolderActions}
                />
              </div>
            </div>
          </aside>

          <main className="flex-1 space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{currentFolder ? currentFolder.name : "All Items"}</h2>
                {currentFolder && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-[#8ba3b8]">
                    <button onClick={() => setSelectedFolderId(null)} className="hover:text-white">Group</button>
                    {breadcrumbs.map(f => <span key={f.id} className="flex items-center gap-1"><span>/</span><button onClick={() => setSelectedFolderId(f.id)} className={`hover:text-white ${f.id === selectedFolderId ? "text-white" : ""}`}>{f.name}</button></span>)}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={openCreateResource} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" /> New Password</button>
                <button onClick={() => openFolderForm(selectedFolderId)} className="flex items-center gap-1.5 rounded-lg border border-[#2a4055] px-3 py-2 text-xs font-semibold text-[#c4d4e0] hover:bg-[#213548]"><FolderPlus className="h-3.5 w-3.5" /> New Folder</button>
                <button onClick={handleSyncAll} disabled={syncingAll || busy || resources.length === 0} className="flex items-center gap-1.5 rounded-lg border border-[#1ebbd4] px-3 py-2 text-xs font-semibold text-[#1ebbd4] hover:bg-[#1ebbd4]/20 disabled:opacity-50">{syncingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} {syncingAll ? "Syncing…" : "Sync All"}</button>
                {selectedGroup.myRole === "OWNER" && <button onClick={() => handleDeleteGroup(selectedGroup.id)} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-[#f89c11] px-3 py-2 text-xs font-semibold text-[#f89c11] hover:bg-[#f89c11]/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete Group</button>}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba3b8]" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search passwords…" className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] py-2 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none" /></div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setSelectedTag(null); setShowFavoritesOnly(false); }} className={`rounded-full px-3 py-1 text-xs ${!selectedTag && !showFavoritesOnly ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}>All</button>
                <button onClick={() => { setSelectedTag(null); setShowFavoritesOnly(true); }} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${showFavoritesOnly ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}><Star className="h-3 w-3" /> Favorites</button>
                {tags.map(t => <button key={t.id} onClick={() => setSelectedTag(selectedTag === t.id ? null : t.id)} className={`rounded-full px-3 py-1 text-xs ${selectedTag === t.id ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}>{t.name}</button>)}
              </div>
            </div>

            {filteredResources.length === 0 ? (
              <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-12 text-center"><p className="text-[#8ba3b8]">{resources.length === 0 ? "No passwords in this location yet." : "No passwords match your filters."}</p></div>
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
                    {filteredResources.map((r, i) => (
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
                            {r.source === "group" ? (r.groupName ?? "Group") : "My Workplace"}
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
                                  setToast("Password copied");
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
                        <td className="max-w-[200px] truncate px-4 py-3 text-[#8ba3b8]">
                          {r.uri ? (
                            <a href={r.uri} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-[#c4d4e0]">
                              {r.uri}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#8ba3b8]">{new Date(r.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={(e) => handleToggleFavorite(r.id, e)} className={`p-1 ${favoriteIds.has(r.id) ? "text-[#f89c11]" : "text-[#5a7a95] hover:text-[#8ba3b8]"}`}>
                            <Star className="h-4 w-4" fill={favoriteIds.has(r.id) ? "currentColor" : "none"} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setResourceToDelete(r); }}
                            className="p-1 text-[#8ba3b8] hover:text-[#f89c11]"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.length === 0 ? <p className="text-[#8ba3b8]">No groups yet. Create one to start sharing with teams.</p> : groups.map(g => (
            <button key={g.id} onClick={() => handleSelectGroup(g.id)} className="flex w-full items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3 text-left hover:bg-[#213548]/50">
              <div><p className="font-medium text-white">{g.name}</p><p className="text-xs text-[#8ba3b8]">{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</p></div>
              <Users className="h-4 w-4 text-[#8ba3b8]" />
            </button>
          ))}
        </div>
      )}

      {showFolderForm && (
        <Dialog title={folderFormParent ? "New Subfolder" : "New Folder"} onClose={() => { setShowFolderForm(false); setFolderFormParent(null); }}>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <Field label="Name" required><input type="text" required value={folderFormName} onChange={e => setFolderFormName(e.target.value)} className={inputClass} autoFocus /></Field>
            <div className="flex gap-2 pt-2"><button type="submit" disabled={busy} className={primaryBtnClass}>{busy ? "Creating…" : "Create"}</button><button type="button" onClick={() => { setShowFolderForm(false); setFolderFormParent(null); }} className={secondaryBtnClass}>Cancel</button></div>
          </form>
        </Dialog>
      )}

      {renamingFolder && (
        <Dialog title="Rename Folder" onClose={() => { setRenamingFolder(null); setRenameName(""); }}>
          <form onSubmit={e => { e.preventDefault(); handleRenameFolder(renamingFolder); }} className="space-y-4">
            <Field label="Name" required><input type="text" required value={renameName} onChange={e => setRenameName(e.target.value)} className={inputClass} autoFocus /></Field>
            <div className="flex gap-2 pt-2"><button type="submit" disabled={busy} className={primaryBtnClass}>{busy ? "Saving…" : "Save"}</button><button type="button" onClick={() => { setRenamingFolder(null); setRenameName(""); }} className={secondaryBtnClass}>Cancel</button></div>
          </form>
        </Dialog>
      )}

      {movingFolder && (
        <Dialog title="Move Folder" onClose={() => { setMovingFolder(null); setMoveTarget(""); }}>
          <div className="space-y-4">
            <Field label="Destination">
              <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className={inputClass}>
                <option value="">— Group root —</option>
                {folders.filter(f => f.id !== movingFolder).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 pt-2"><button onClick={() => handleMoveFolder(movingFolder)} disabled={busy} className={primaryBtnClass}>{busy ? "Moving…" : "Move"}</button><button onClick={() => { setMovingFolder(null); setMoveTarget(""); }} className={secondaryBtnClass}>Cancel</button></div>
          </div>
        </Dialog>
      )}

      {showResourceForm && (
        <Dialog title={editingResource ? `Edit: ${editingResource.name}` : "New Password"} onClose={() => { setShowResourceForm(false); setEditingResource(null); setDecryptedSecret(null); }}>
          <form onSubmit={handleSaveResource} className="space-y-4">
            <Field label="Name" required><input type="text" required value={formName} onChange={e => setFormName(e.target.value)} className={inputClass} /></Field>
            <Field label="URI"><input type="url" value={formUri} onChange={e => setFormUri(e.target.value)} className={inputClass} /></Field>
            <Field label="Username"><input type="text" value={formUsername} onChange={e => setFormUsername(e.target.value)} className={inputClass} autoComplete="off" name="new-group-username" /></Field>
            <Field label="Password" required><input type="password" required value={formPassword} onChange={e => setFormPassword(e.target.value)} className={inputClass} autoComplete="new-password" name="new-group-password" /></Field>
            <Field label="Notes"><textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} /></Field>
            {folders.length > 0 && (
              <Field label="Folder">
                <select value={formFolderId} onChange={e => setFormFolderId(e.target.value)} className={inputClass}>
                  <option value="">— Group root —</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            )}
            <div className="flex gap-2 pt-2"><button type="submit" disabled={busy} className={primaryBtnClass}>{busy ? "Saving…" : editingResource ? "Save Changes" : "Save Password"}</button><button type="button" onClick={() => { setShowResourceForm(false); setEditingResource(null); setDecryptedSecret(null); }} className={secondaryBtnClass}>Cancel</button></div>
          </form>
        </Dialog>
      )}

      {movingResource && (
        <Dialog title="Move Resource" onClose={() => { setMovingResource(null); setMoveResourceTarget(""); }}>
          <div className="space-y-4">
            <Field label="Destination">
              <select value={moveResourceTarget} onChange={e => setMoveResourceTarget(e.target.value)} className={inputClass}>
                <option value="">— Group root —</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 pt-2"><button onClick={handleMoveResource} disabled={busy} className={primaryBtnClass}>{busy ? "Moving…" : "Move"}</button><button onClick={() => { setMovingResource(null); setMoveResourceTarget(""); }} className={secondaryBtnClass}>Cancel</button></div>
          </div>
        </Dialog>
      )}

      {resourceToDelete && (
        <Dialog title="Delete Password" onClose={() => setResourceToDelete(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[#c4d4e0]">Are you sure you want to delete <strong>{resourceToDelete.name}</strong>? This cannot be undone.</p>
            <div className="flex gap-2 pt-2"><button onClick={confirmDeleteResource} disabled={busy} className={dangerBtnClass}>{busy ? "Deleting…" : "Delete"}</button><button onClick={() => setResourceToDelete(null)} className={secondaryBtnClass}>Cancel</button></div>
          </div>
        </Dialog>
      )}

      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#213548] px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="text-[#8ba3b8] hover:text-[#c4d4e0]"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm text-[#c4d4e0]">{label}{required && <span className="text-[#f89c11]"> *</span>}</label>{children}</div>;
}

function SecretField({ label, value, masked, copied, onCopy, onToggleReveal }: any) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[#8ba3b8]">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-hidden text-ellipsis rounded-md bg-[#213548]/50 px-3 py-2 text-sm text-[#c4d4e0]">{masked ? "••••••••••••" : value}</code>
        {onToggleReveal && <button onClick={onToggleReveal} className="rounded-md p-2 text-[#8ba3b8] hover:bg-[#213548]">{masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>}
        <button onClick={onCopy} className="rounded-md p-2 text-[#8ba3b8] hover:bg-[#213548]">{copied ? <span className="text-xs text-[#1ebbd4]"><Check className="inline h-3 w-3" /> Copied</span> : <Copy className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";
const primaryBtnClass = "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
const secondaryBtnClass = "rounded-lg border border-[#2a4055] px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#213548]";
const dangerBtnClass = "rounded-lg bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white hover:bg-[#dc2626] disabled:opacity-50";
