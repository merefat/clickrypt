"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileDown } from "lucide-react";
import { apiClient, type ExportItem, type GroupInfo } from "@/lib/api/client";
import { useSessionStore, clearCallbackUrl } from "@/stores/session";
import { useSessionRestore } from "@/hooks/useSessionRestore";
import { ReUnlockDialog } from "@/components/ReUnlockDialog";
import { decryptMessage } from "@clickrypt/crypto";

export default function ExportPage() {
  const router = useRouter();
  const { unlocked, privateKey } = useSessionStore();
  const [format, setFormat] = useState<"csv" | "bitwarden">("csv");
  const [scope, setScope] = useState<"all" | "workplace" | "groups">("all");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [showReUnlock, setShowReUnlock] = useState(false);

  const { status: restoreStatus } = useSessionRestore();

  useEffect(() => {
    if (restoreStatus === "locked") {
      setShowReUnlock(true);
    }
  }, [restoreStatus]);

  useEffect(() => {
    if (unlocked) {
      setGroupsLoading(true);
      apiClient.listGroups().then(setGroups).catch(() => {}).finally(() => setGroupsLoading(false));
    }
  }, [unlocked]);

  async function handleExport() {
    if (!privateKey) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setCount(0);

    try {
      const exportParams = scope === "groups"
        ? { scope: "groups" as const, groupIds: [...selectedGroupIds] }
        : scope === "workplace"
          ? { scope: "workplace" as const }
          : undefined;
      const items = await apiClient.exportResources(exportParams);

      if (items.length === 0) {
        setError("No resources to export.");
        return;
      }

      const decrypted: {
        name: string;
        username: string;
        password: string;
        notes: string;
        uri: string;
      }[] = [];

      for (const item of items) {
        if (!item.encryptedData) continue;
        try {
          const result = await decryptMessage(item.encryptedData, privateKey);
          const plaintext = result.plaintext;
          const secret = JSON.parse(plaintext);
          decrypted.push({
            name: item.name,
            username: secret.username ?? "",
            password: secret.password ?? "",
            notes: secret.notes ?? "",
            uri: item.uri ?? "",
          });
        } catch {
          // Skip entries that fail to decrypt
        }
      }

      if (decrypted.length === 0) {
        setError("Failed to decrypt any resources. Your private key may not have access to these secrets.");
        return;
      }

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === "csv") {
        const header = "name,username,password,notes,uri";
        const rows = decrypted.map((d) => {
          const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
          return [escape(d.name), escape(d.username), escape(d.password), escape(d.notes), escape(d.uri)].join(",");
        });
        content = [header, ...rows].join("\n");
        filename = `clickrypt-export-${new Date().toISOString().slice(0, 10)}.csv`;
        mimeType = "text/csv";
      } else {
        const bitwardenExport = {
          encrypted: false,
          folders: [],
          items: decrypted.map((d) => ({
            id: crypto.randomUUID(),
            type: 1,
            name: d.name,
            notes: d.notes,
            favorite: false,
            login: {
              username: d.username,
              password: d.password,
              uris: d.uri ? [{ uri: d.uri }] : [],
            },
          })),
        };
        content = JSON.stringify(bitwardenExport, null, 2);
        filename = `clickrypt-export-${new Date().toISOString().slice(0, 10)}.json`;
        mimeType = "application/json";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setCount(decrypted.length);
      setSuccess(`Exported ${decrypted.length} ${decrypted.length === 1 ? "resource" : "resources"} as ${format === "csv" ? "CSV" : "Bitwarden JSON"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (showReUnlock) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ReUnlockDialog onClose={() => { setShowReUnlock(false); router.push("/login"); }} onUnlocked={() => { setShowReUnlock(false); clearCallbackUrl(); }} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
      <button
        onClick={() => router.push("/vault")}
        className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Vault
      </button>

      <div className="mb-8 flex items-center gap-3">
        <Download className="h-6 w-6 text-brand-500" />
        <h1 className="text-2xl font-bold">Export Passwords</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3">
          <p className="font-semibold text-[#1ebbd4]">{success}</p>
          <p className="mt-1 text-xs text-[#8ba3b8]">
            Your file has been downloaded. Store it securely — it contains plaintext passwords.
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
        <div className="rounded-lg border border-[#f89c11]/30 bg-[#f89c11]/10 px-4 py-3 text-sm text-[#f89c11]">
          <strong>Warning:</strong> Exported files contain decrypted passwords in plaintext.
          Delete the file after importing to another password manager.
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#c4d4e0]">Scope</label>
          <div className="flex gap-2">
            <button
              onClick={() => setScope("all")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${scope === "all" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
            >
              Everything
            </button>
            <button
              onClick={() => setScope("workplace")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${scope === "workplace" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
            >
              My Workplace
            </button>
            <button
              onClick={() => setScope("groups")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${scope === "groups" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
            >
              Selected Groups
            </button>
          </div>
        </div>

        {scope === "groups" && (
          <div>
            <label className="mb-2 block text-sm text-[#c4d4e0]">Select Groups</label>
            {groupsLoading ? (
              <p className="text-sm text-[#8ba3b8]">Loading groups…</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-[#8ba3b8]">No groups available.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#2a4055] p-2">
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#213548]/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(g.id)}
                      onChange={(e) => {
                        setSelectedGroupIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(g.id);
                          else next.delete(g.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-[#2a4055] accent-[#1ebbd4]"
                    />
                    <span className="text-[#c4d4e0]">{g.name}</span>
                    <span className="ml-auto text-xs text-[#8ba3b8]">{g.memberCount} members</span>
                  </label>
                ))}
              </div>
            )}
            {scope === "groups" && selectedGroupIds.size === 0 && !groupsLoading && groups.length > 0 && (
              <p className="mt-1 text-xs text-[#f89c11]">Select at least one group to export.</p>
            )}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm text-[#c4d4e0]">Format</label>
          <div className="flex gap-2">
            <button
              onClick={() => setFormat("csv")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${format === "csv" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
            >
              CSV
            </button>
            <button
              onClick={() => setFormat("bitwarden")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${format === "bitwarden" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
            >
              Bitwarden JSON
            </button>
          </div>
        </div>

        <div className="text-sm text-[#8ba3b8]">
          <p className="mb-1">
            <strong className="text-[#c4d4e0]">CSV format:</strong> Compatible with most password managers.
            Columns: name, username, password, notes, uri.
          </p>
          <p>
            <strong className="text-[#c4d4e0]">Bitwarden JSON:</strong> Direct import into Bitwarden.
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={busy || (scope === "groups" && selectedGroupIds.size === 0)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          {busy ? "Exporting…" : "Export & Download"}
        </button>
      </div>
    </div>
  );
}
