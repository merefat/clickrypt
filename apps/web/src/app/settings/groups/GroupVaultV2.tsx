// @ts-nocheck
"use client";
/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Folder,
  FolderPlus,
  Key,
  Loader2,
  Lock,
  Move,
  Pencil,
  Plus,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  generateGroupKey,
  encryptGroupKey,
  encryptWithGroupKey,
  decryptGroupKey,
  decryptWithGroupKey,
  getPublicKeyFromPrivateKey,
} from "@clickrypt/crypto";

interface ResourceForm {
  name: string;
  uri: string;
  username: string;
  password: string;
  notes: string;
  folderId: string;
}

const initialResourceForm: ResourceForm = {
  name: "",
  uri: "",
  username: "",
  password: "",
  notes: "",
  folderId: "",
};

export default function GroupVaultV2() {
  const router = useRouter();
  const { unlocked, privateKey, userId } = useSessionStore();

  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [resourceForm, setResourceForm] = useState<ResourceForm>(initialResourceForm);
  const [showResourceForm, setShowResourceForm] = useState(false);

  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [movingFolder, setMovingFolder] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");

  const [revealed, setRevealed] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
      return;
    }
    loadGroups();
  }, [unlocked, router]);

  useEffect(() => {
    if (selectedGroup) {
      setCurrentFolderId(null);
      setGroupKey(null);
      setKeyError(null);
      loadGroupFolders(selectedGroup.id);
      loadGroupResources(selectedGroup.id);
      ensureGroupKey(selectedGroup);
    }
  }, [selectedGroup?.id]);

  useEffect(() => {
    if (revealed) {
      const t = setTimeout(() => setRevealed(null), 30000);
      return () => clearTimeout(t);
    }
  }, [revealed]);

  async function loadGroups() {
    try {
      setLoading(true);
      const data = await apiClient.listGroups();
      setGroups(data);
    } catch {
      setError("Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  async function loadGroupFolders(groupId: string) {
    try {
      const data = await apiClient.listGroupFolders(groupId);
      setFolders(data);
    } catch {
      setError("Failed to load folders");
    }
  }

  async function loadGroupResources(groupId: string) {
    try {
      const data = await apiClient.listGroupResources(groupId);
      setResources(data);
      setFavoriteIds(new Set(data.filter((r: any) => r.isFavorite).map((r: any) => r.id)));
      // Load tags separately, don't fail if tags fail
      try {
        const t = await apiClient.listTags();
        setTags(t);
      } catch {
        // Tags are optional, continue without them
      }
    } catch {
      setError("Failed to load resources");
    }
  }

  async function ensureGroupKey(group: any) {
    if (!privateKey || !userId) return;
    try {
      setKeyError(null);
      const { encryptedGroupKey } = await apiClient.getGroupKey(group.id);
      if (encryptedGroupKey) {
        const key = await decryptGroupKey(encryptedGroupKey, privateKey);
        setGroupKey(key);
        return;
      }
      if (group.myRole === "OWNER" || group.myRole === "ADMIN") {
        const key = await generateGroupKey();
        const publicKey = await getPublicKeyFromPrivateKey(privateKey);
        const wrapped = await encryptGroupKey(key, [{ userId, publicKey }]);
        await apiClient.setGroupKey(group.id, userId, wrapped[userId]);
        setGroupKey(key);
        return;
      }
      setKeyError("Group key has not been created. Ask the group owner.");
    } catch (e) {
      setKeyError("Could not decrypt group key.");
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setBusy(true);
    try {
      await apiClient.createGroup(newGroupName.trim());
      setNewGroupName("");
      setShowCreateGroup(false);
      await loadGroups();
    } catch {
      setError("Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this group?")) return;
    try {
      await apiClient.deleteGroup(id);
      setSelectedGroup(null);
      await loadGroups();
    } catch {
      setError("Failed to delete group");
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !newFolderName.trim()) return;
    setBusy(true);
    try {
      await apiClient.createFolder({
        name: newFolderName.trim(),
        groupId: selectedGroup.id,
        parentFolderId: currentFolderId ?? undefined,
      });
      setNewFolderName("");
      setShowCreateFolder(false);
      await loadGroupFolders(selectedGroup.id);
    } catch (err: any) {
      setError(err?.message || "Failed to create folder");
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameFolder(folderId: string) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await apiClient.updateFolder(folderId, { name: editName.trim() });
      setEditingFolder(null);
      setEditName("");
      if (selectedGroup) await loadGroupFolders(selectedGroup.id);
    } catch (err: any) {
      setError(err?.message || "Failed to rename folder");
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveFolder(folderId: string) {
    setBusy(true);
    try {
      const target = moveTarget === "" ? null : moveTarget;
      await apiClient.updateFolder(folderId, { parentFolderId: target });
      setMovingFolder(null);
      setMoveTarget("");
      if (selectedGroup) await loadGroupFolders(selectedGroup.id);
    } catch (err: any) {
      setError(err?.message || "Failed to move folder");
    } finally {
      setBusy(false);
    }
  }

  function getFolderPathLabel(folderId: string | null): string {
    if (!folderId) return "— No folder —";
    const names: string[] = [];
    let current = folders.find((f) => f.id === folderId);
    while (current) {
      names.unshift(current.name);
      current = folders.find((f) => f.id === current.parentFolderId);
    }
    return names.join(" / ") || "—";
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
      if (selectedGroup) await loadGroupResources(selectedGroup.id);
    } catch {
      // ignore
    }
  }

  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [
      { id: null, name: selectedGroup?.name || "Group" },
    ];
    let current = folders.find((f) => f.id === currentFolderId);
    const chain: { id: string | null; name: string }[] = [];
    while (current) {
      chain.unshift({ id: current.id, name: current.name });
      current = folders.find((f) => f.id === current.parentFolderId);
    }
    return [...crumbs, ...chain];
  }, [folders, currentFolderId, selectedGroup]);

  const childFolders = useMemo(() => {
    return folders.filter((f) => f.parentFolderId === currentFolderId);
  }, [folders, currentFolderId]);

  const visibleResources = useMemo(() => {
    let filtered = resources.filter((r) =>
      currentFolderId
        ? r.folder?.id === currentFolderId
        : !r.folder
    );
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.uri?.toLowerCase().includes(q) ?? false)
      );
    }
    if (selectedTag) {
      filtered = filtered.filter((r) => r.tags.some((t: any) => t.id === selectedTag));
    }
    if (showFavoritesOnly) {
      filtered = filtered.filter((r) => favoriteIds.has(r.id));
    }
    return filtered;
  }, [resources, currentFolderId, search, selectedTag, showFavoritesOnly, favoriteIds]);

  async function handleCreateResource(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !groupKey) return;
    if (!resourceForm.name.trim() || !resourceForm.password) return;
    setBusy(true);
    try {
      const payload = JSON.stringify({
        username: resourceForm.username,
        password: resourceForm.password,
        notes: resourceForm.notes,
      });
      const { iv, ciphertext } = await encryptWithGroupKey(payload, groupKey);
      const groupEncryptedData = JSON.stringify({ iv, ciphertext });
      const folderId = resourceForm.folderId || undefined;
      await apiClient.createResource({
        name: resourceForm.name.trim(),
        uri: resourceForm.uri.trim() || undefined,
        groupId: selectedGroup.id,
        folderId,
        groupEncryptedData,
        resourceType: "password",
        metadata: { username: resourceForm.username },
      });
      setResourceForm(initialResourceForm);
      setShowResourceForm(false);
      if (selectedGroup) await loadGroupResources(selectedGroup.id);
    } catch (err: any) {
      setError(err?.message || "Failed to create password");
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal(resource: any) {
    if (!selectedGroup || !groupKey || !privateKey) return;
    try {
      const { encryptedData } = await apiClient.getSecret(resource.id);
      const { iv, ciphertext } = JSON.parse(encryptedData);
      const payload = await decryptWithGroupKey({ iv, ciphertext }, groupKey);
      const parsed = JSON.parse(payload);
      setRevealed({ ...parsed, resourceId: resource.id, name: resource.name });
    } catch {
      setError("Failed to reveal password");
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Failed to copy");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8ba3b8]" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
      <button
        onClick={() => router.push("/vault")}
        className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Vault
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold">Groups</h1>
        </div>
        {!selectedGroup && (
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> New Group
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          {error}
          <button onClick={() => setError(null)} className="float-right text-[#f89c11]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showCreateGroup && !selectedGroup && (
        <form onSubmit={handleCreateGroup} className="mb-4 flex gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="flex-1 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowCreateGroup(false); setNewGroupName(""); }}
            className="rounded-lg border border-[#2a4055] px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]"
          >
            Cancel
          </button>
        </form>
      )}

      {selectedGroup ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedGroup.name}</h2>
                <p className="text-xs text-[#8ba3b8]">
                  Your role:{" "}
                  <span className={`font-medium ${selectedGroup.myRole === "OWNER" ? "text-[#f89c11]" : selectedGroup.myRole === "ADMIN" ? "text-[#1ebbd4]" : "text-[#8ba3b8]"}`}>
                    {selectedGroup.myRole ?? "None"}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="rounded-lg border border-[#2a4055] px-3 py-1.5 text-xs text-[#c4d4e0] hover:bg-[#213548]"
                >
                  Back to list
                </button>
                {selectedGroup.myRole === "OWNER" && (
                  <button
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    className="flex items-center gap-1 rounded-lg border border-[#f89c11] px-3 py-1.5 text-xs text-[#f89c11] hover:bg-[#f89c11]/20"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            </div>

            {keyError && (
              <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
                {keyError}
              </div>
            )}

            <div className="mb-4 flex items-center gap-2 text-sm text-[#8ba3b8]">
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                  {idx > 0 && <span className="mx-1">/</span>}
                  <button
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className="hover:text-[#e2e8f0]"
                    disabled={idx === breadcrumbs.length - 1}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#c4d4e0]">Folders</h3>
              <button
                onClick={() => setShowCreateFolder(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </button>
            </div>

            {showCreateFolder && (
              <form onSubmit={handleCreateFolder} className="mb-4 flex gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-3">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="flex-1 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateFolder(false); setNewFolderName(""); }}
                  className="rounded-lg border border-[#2a4055] px-3 py-2 text-xs text-[#c4d4e0] hover:bg-[#213548]"
                >
                  Cancel
                </button>
              </form>
            )}

            {childFolders.length === 0 ? (
              <p className="text-sm text-[#8ba3b8]">No folders in this location.</p>
            ) : (
              <div className="space-y-2">
                {childFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3"
                  >
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="flex items-center gap-2 text-sm text-[#c4d4e0] hover:text-[#e2e8f0]"
                    >
                      <Folder className="h-4 w-4 text-[#8ba3b8]" />
                      {editingFolder === folder.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => handleRenameFolder(folder.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") { setEditingFolder(null); setEditName(""); } }}
                          autoFocus
                          className="rounded border border-[#2a4055] bg-[#0d1b2a] px-2 py-1 text-sm"
                        />
                      ) : (
                        <span>{folder.name}</span>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {editingFolder !== folder.id && (
                        <button
                          onClick={() => { setEditingFolder(folder.id); setEditName(folder.name); }}
                          className="rounded p-1.5 text-[#8ba3b8] hover:bg-[#213548] hover:text-[#e2e8f0]"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {movingFolder === folder.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={moveTarget}
                            onChange={(e) => setMoveTarget(e.target.value)}
                            className="rounded border border-[#2a4055] bg-[#0d1b2a] px-2 py-1 text-xs"
                          >
                            <option value="">— Root —</option>
                            {folders
                              .filter((f) => f.id !== folder.id)
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                          <button onClick={() => handleMoveFolder(folder.id)} className="rounded p-1 text-brand-500 hover:bg-[#213548]">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setMovingFolder(null); setMoveTarget(""); }}
                            className="rounded p-1 text-[#8ba3b8] hover:bg-[#213548]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMovingFolder(folder.id)}
                          className="rounded p-1.5 text-[#8ba3b8] hover:bg-[#213548] hover:text-[#e2e8f0]"
                          title="Move"
                        >
                          <Move className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#c4d4e0]">Passwords</h3>
              <button
                onClick={() => setShowResourceForm((s) => !s)}
                disabled={!groupKey}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> New Password
              </button>
            </div>

            {/* Search and Filters */}
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba3b8]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search passwords..."
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] pl-10 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setSelectedTag(null); setShowFavoritesOnly(false); }}
                  className={`rounded-full px-3 py-1 text-xs ${!selectedTag && !showFavoritesOnly ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}
                >
                  All
                </button>
                <button
                  onClick={() => { setSelectedTag(null); setShowFavoritesOnly(true); }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${showFavoritesOnly ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}
                >
                  <Star className="h-3 w-3" /> Favorites
                </button>
                {tags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTag(selectedTag === t.id ? null : t.id)}
                    className={`rounded-full px-3 py-1 text-xs ${selectedTag === t.id ? "bg-brand-600 text-white" : "bg-[#213548] text-[#8ba3b8] hover:bg-[#213548]"}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {!groupKey && (
              <div className="mb-4 rounded-lg border border-[#1ebbd4] bg-[#1ebbd4]/10 px-4 py-2 text-sm text-[#1ebbd4]">
                <Key className="mr-1 inline h-4 w-4" />
                Group key is not available. You cannot create or reveal passwords until the key is set.
              </div>
            )}

            {showResourceForm && (
              <form onSubmit={handleCreateResource} className="mb-6 space-y-3 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4">
                <input
                  required
                  type="text"
                  value={resourceForm.name}
                  onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                  placeholder="Name"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={resourceForm.uri}
                  onChange={(e) => setResourceForm({ ...resourceForm, uri: e.target.value })}
                  placeholder="URI"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={resourceForm.username}
                  onChange={(e) => setResourceForm({ ...resourceForm, username: e.target.value })}
                  placeholder="Username"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  required
                  type="password"
                  value={resourceForm.password}
                  onChange={(e) => setResourceForm({ ...resourceForm, password: e.target.value })}
                  placeholder="Password"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <textarea
                  value={resourceForm.notes}
                  onChange={(e) => setResourceForm({ ...resourceForm, notes: e.target.value })}
                  placeholder="Notes"
                  rows={3}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <select
                  value={resourceForm.folderId}
                  onChange={(e) => setResourceForm({ ...resourceForm, folderId: e.target.value })}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="">— No folder —</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {getFolderPathLabel(f.id)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowResourceForm(false); setResourceForm(initialResourceForm); }}
                    className="rounded-lg border border-[#2a4055] px-4 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {visibleResources.length === 0 ? (
              <p className="text-sm text-[#8ba3b8]">No passwords in this location yet.</p>
            ) : (
              <div className="space-y-2">
                {visibleResources.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-[#8ba3b8]" />
                        <span className="font-medium text-[#c4d4e0]">{r.name}</span>
                        {r.tags && r.tags.length > 0 && (
                          <div className="flex gap-1">
                            {r.tags.map((t: any) => (
                              <span key={t.id} className="rounded-full bg-[#213548] px-2 py-0.5 text-xs text-[#8ba3b8]">{t.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleFavorite(r.id, e)}
                          className={`p-1 ${favoriteIds.has(r.id) ? "text-[#f89c11]" : "text-[#5a7a95] hover:text-[#8ba3b8]"}`}
                        >
                          <Star className="h-4 w-4" fill={favoriteIds.has(r.id) ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => handleReveal(r)}
                          disabled={!groupKey}
                          className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          <Eye className="h-3 w-3" /> Reveal
                        </button>
                      </div>
                    </div>
                    {r.uri && (
                      <p className="text-xs text-[#8ba3b8]">{r.uri}</p>
                    )}
                    {revealed?.resourceId === r.id && (
                      <div className="mt-2 rounded-lg border border-[#2a4055] bg-[#0d1b2a] p-3 text-sm">
                        <p className="mb-1 text-[#8ba3b8]">
                          <span className="font-semibold text-[#c4d4e0]">Username:</span>{" "}
                          {revealed.username || "—"}
                        </p>
                        <div className="mb-1 flex items-center gap-2 text-[#c4d4e0]">
                          <span className="font-semibold">Password:</span>
                          <span className="font-mono">{revealed.password}</span>
                          <button
                            onClick={() => copyToClipboard(revealed.password)}
                            className="rounded p-1 text-[#8ba3b8] hover:bg-[#213548]"
                            title="Copy"
                          >
                            {copied ? <Check className="h-3.5 w-3.5 text-brand-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {revealed.notes && (
                          <p className="mt-2 whitespace-pre-wrap text-[#8ba3b8]">{revealed.notes}</p>
                        )}
                        <p className="mt-2 text-xs text-[#8ba3b8]">This will be hidden in 30 seconds.</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-[#8ba3b8]">No groups yet. Create one to start sharing with teams.</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g)}
                className="flex w-full items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3 text-left hover:bg-[#213548]/50"
              >
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-[#8ba3b8]">{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</p>
                </div>
                <Users className="h-4 w-4 text-[#8ba3b8]" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
