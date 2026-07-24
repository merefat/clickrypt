"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Key,
  Lock,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  apiClient,
  ApiError,
  type Folder,
  type GroupDetail,
  type GroupInfo,
  type ResourceListItem,
} from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";
import { encryptMessage, getPublicKeyFromPrivateKey } from "@clickrypt/crypto";

interface ResourceForm {
  name: string;
  uri: string;
  username: string;
  password: string;
  notes: string;
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) return err.message || "Request failed";
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export default function GroupVault() {
  const router = useRouter();
  const { unlocked, privateKey, userId } = useSessionStore();

  const [deploymentMode, setDeploymentMode] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [folderStack, setFolderStack] = useState<Folder[]>([]);
  const currentFolder = folderStack[folderStack.length - 1] ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [showCreateResource, setShowCreateResource] = useState(false);
  const [resourceForm, setResourceForm] = useState<ResourceForm>({
    name: "",
    uri: "",
    username: "",
    password: "",
    notes: "",
  });
  const [savingResource, setSavingResource] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
      return;
    }
    apiClient
      .getDeploymentConfig()
      .then((cfg) => setDeploymentMode(cfg.deploymentMode))
      .catch(() => setDeploymentMode("organization"));
    loadGroups();
  }, [unlocked, router]);

  useEffect(() => {
    if (!selectedGroup) return;
    setFolderStack([]);
    loadGroupFolders(selectedGroup.id);
    loadGroupResources(selectedGroup.id, null);
  }, [selectedGroup]);

  async function loadGroups() {
    try {
      setLoading(true);
      const data = await apiClient.listGroups();
      setGroups(data);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    try {
      await apiClient.createGroup(newGroupName.trim());
      setNewGroupName("");
      setShowCreateGroup(false);
      loadGroups();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this group?")) return;
    try {
      await apiClient.deleteGroup(id);
      if (selectedGroup?.id === id) setSelectedGroup(null);
      loadGroups();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleSelectGroup(id: string) {
    try {
      const detail = await apiClient.getGroup(id);
      setSelectedGroup(detail);
      setError(null);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function loadGroupFolders(groupId: string) {
    try {
      const data = await apiClient.listGroupFolders(groupId);
      setFolders(data);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function loadGroupResources(groupId: string, folderId: string | null) {
    try {
      const data = await apiClient.listGroupResources(
        groupId,
        folderId === null ? undefined : folderId
      );
      setResources(data);
    } catch (err) {
      setError(formatError(err));
    }
  }

  const childFolders = useMemo(
    () =>
      folders.filter(
        (f) => (f.parentFolderId ?? null) === (currentFolder?.id ?? null)
      ),
    [folders, currentFolder]
  );

  function enterFolder(folder: Folder) {
    setFolderStack((prev) => [...prev, folder]);
    loadGroupResources(selectedGroup!.id, folder.id);
  }

  function goBack(level = -1) {
    if (level === -1) {
      setFolderStack((prev) => prev.slice(0, -1));
      const next = folderStack.slice(0, -1);
      const nextFolder = next[next.length - 1] ?? null;
      loadGroupResources(selectedGroup!.id, nextFolder?.id ?? null);
    } else {
      const next = folderStack.slice(0, level);
      setFolderStack(next);
      const nextFolder = next[next.length - 1] ?? null;
      loadGroupResources(selectedGroup!.id, nextFolder?.id ?? null);
    }
  }

  async function handleCreateFolder() {
    if (!selectedGroup || !newFolderName.trim()) return;
    try {
      await apiClient.createFolder({
        name: newFolderName.trim(),
        groupId: selectedGroup.id,
        parentFolderId: currentFolder?.id,
      });
      setNewFolderName("");
      setShowCreateFolder(false);
      loadGroupFolders(selectedGroup.id);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleCreateResource(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !currentFolder) {
      setError("Select a folder before creating a resource.");
      return;
    }
    if (!privateKey) {
      setError("Your session is locked. Please unlock your vault first.");
      return;
    }
    if (!resourceForm.name.trim() || !resourceForm.password.trim()) {
      setError("Name and password are required.");
      return;
    }

    setSavingResource(true);
    setError(null);
    try {
      const publicKey = await getPublicKeyFromPrivateKey(privateKey);
      const secretPayload = JSON.stringify({
        username: resourceForm.username,
        password: resourceForm.password,
        notes: resourceForm.notes,
      });
      const encryptedData = await encryptMessage(secretPayload, [publicKey]);

      const recipients = await apiClient.getGroupRecipients(selectedGroup.id);
      const additionalSecrets: Record<string, string> = {};
      const missing: string[] = [];
      await Promise.all(
        recipients
          .filter((r) => r.userId !== userId)
          .map(async (r) => {
            if (!r.publicKey) {
              missing.push(r.email);
              return;
            }
            additionalSecrets[r.userId] = await encryptMessage(secretPayload, [
              r.publicKey,
            ]);
          })
      );
      if (missing.length) {
        throw new Error(`Missing public keys for: ${missing.join(", ")}`);
      }

      await apiClient.createResource({
        name: resourceForm.name.trim(),
        uri: resourceForm.uri.trim() || undefined,
        folderId: currentFolder.id,
        encryptedData,
        metadata: { username: resourceForm.username },
        additionalSecrets,
        sharingMode: "AUTO",
      });

      setResourceForm({ name: "", uri: "", username: "", password: "", notes: "" });
      setShowCreateResource(false);
      loadGroupResources(selectedGroup.id, currentFolder.id);
      loadGroupFolders(selectedGroup.id);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSavingResource(false);
    }
  }

  if (loading && !selectedGroup && groups.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Loading…</p>
      </div>
    );
  }

  if (deploymentMode === "self-hosted") {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
        <button
          onClick={() => router.push("/vault")}
          className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Vault
        </button>
        <div className="flex items-center gap-3 mb-8">
          <Users className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold">Groups</h1>
        </div>
        <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-8 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-[#8ba3b8]" />
          <p className="text-lg font-medium text-[#c4d4e0]">Groups are not available in self-hosted mode</p>
          <p className="mt-2 text-sm text-[#8ba3b8]">Switch to organization mode to manage groups and share with team members.</p>
        </div>
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
        <button
          onClick={() => setShowCreateGroup(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Group
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          {error}
        </div>
      )}

      {showCreateGroup && (
        <div className="mb-4 flex gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="flex-1 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={handleCreateGroup}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Create
          </button>
          <button
            onClick={() => setShowCreateGroup(false)}
            className="rounded-lg border border-[#2a4055] px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]"
          >
            Cancel
          </button>
        </div>
      )}

      {selectedGroup ? (
        <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedGroup.name}</h2>
              <p className="text-xs text-[#8ba3b8]">
                Your role:{" "}
                <span
                  className={`font-medium ${
                    selectedGroup.myRole === "OWNER"
                      ? "text-[#f89c11]"
                      : selectedGroup.myRole === "ADMIN"
                      ? "text-[#1ebbd4]"
                      : "text-[#8ba3b8]"
                  }`}
                >
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

          {folderStack.length > 0 && (
            <div className="mb-4 flex items-center gap-1 text-sm text-[#8ba3b8]">
              <button onClick={() => { setFolderStack([]); loadGroupResources(selectedGroup.id, null); }} className="hover:text-[#e2e8f0]">Root</button>
              {folderStack.map((f, idx) => (
                <span key={f.id} className="flex items-center">
                  <ChevronRight className="h-3.5 w-3.5" />
                  <button
                    onClick={() => goBack(idx + 1)}
                    className="hover:text-[#e2e8f0]"
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#c4d4e0]">
              {currentFolder ? currentFolder.name : "Folders"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateFolder(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </button>
              {currentFolder && (
                <button
                  onClick={() => setShowCreateResource(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <Key className="h-3.5 w-3.5" /> New Password
                </button>
              )}
            </div>
          </div>

          {showCreateFolder && (
            <div className="mb-4 flex gap-2 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={currentFolder ? "Subfolder name" : "Folder name"}
                className="flex-1 rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={handleCreateFolder}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateFolder(false)}
                className="rounded-lg border border-[#2a4055] px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]"
              >
                Cancel
              </button>
            </div>
          )}

          {showCreateResource && (
            <form
              onSubmit={handleCreateResource}
              className="mb-4 space-y-3 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 p-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={resourceForm.name}
                  onChange={(e) =>
                    setResourceForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={resourceForm.uri}
                  onChange={(e) =>
                    setResourceForm((prev) => ({ ...prev, uri: e.target.value }))
                  }
                  placeholder="URI (optional)"
                  className="rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={resourceForm.username}
                  onChange={(e) =>
                    setResourceForm((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                  }
                  placeholder="Username"
                  className="rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="password"
                  required
                  value={resourceForm.password}
                  onChange={(e) =>
                    setResourceForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="Password"
                  className="rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <textarea
                value={resourceForm.notes}
                onChange={(e) =>
                  setResourceForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Notes"
                rows={2}
                className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingResource}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {savingResource ? "Saving…" : "Save Password"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateResource(false)}
                  className="rounded-lg border border-[#2a4055] px-3 py-2 text-sm text-[#c4d4e0] hover:bg-[#213548]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {childFolders.length === 0 ? (
            <div className="rounded-lg border border-[#2a4055] bg-[#213548]/30 p-4">
              <p className="text-sm text-[#8ba3b8]">No folders here. Create a folder to organize resources.</p>
            </div>
          ) : (
            <div className="mb-4 space-y-2">
              {childFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => enterFolder(f)}
                  className="flex w-full items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3 text-left hover:bg-[#213548]/50"
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon className="h-4 w-4 text-[#8ba3b8]" />
                    <span className="text-sm text-[#c4d4e0]">{f.name}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#8ba3b8]" />
                </button>
              ))}
            </div>
          )}

          {currentFolder && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-[#c4d4e0]">Passwords</h3>
              {resources.length === 0 ? (
                <div className="rounded-lg border border-[#2a4055] bg-[#213548]/30 p-4">
                  <p className="text-sm text-[#8ba3b8]">No passwords in this folder yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resources.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-[#8ba3b8]" />
                        <span className="text-sm text-[#c4d4e0]">{r.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-[#8ba3b8]">No groups yet. Create one to start sharing with teams.</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleSelectGroup(g.id)}
                className="flex w-full items-center justify-between rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3 text-left hover:bg-[#213548]/50"
              >
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-[#8ba3b8]">
                    {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                  </p>
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
