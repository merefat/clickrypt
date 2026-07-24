"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileDown } from "lucide-react";
import { apiClient, type ExportItem } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";
import { decryptMessage, decryptGroupKey, decryptWithGroupKey } from "@clickrypt/crypto";

export default function ExportPage() {
  const router = useRouter();
  const { unlocked, privateKey } = useSessionStore();
  const [format, setFormat] = useState<"csv" | "bitwarden">("csv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
    }
  }, [unlocked, router]);

  async function handleExport() {
    if (!privateKey) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setCount(0);

    try {
      const items = await apiClient.exportResources();

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
          let plaintext = "";
          if (item.groupId) {
            const { encryptedGroupKey } = await apiClient.getGroupKey(item.groupId);
            if (!encryptedGroupKey) continue;
            const groupKey = await decryptGroupKey(encryptedGroupKey, privateKey);
            const { iv, ciphertext } = JSON.parse(item.encryptedData);
            plaintext = await decryptWithGroupKey({ iv, ciphertext }, groupKey);
          } else {
            const result = await decryptMessage(item.encryptedData, privateKey);
            plaintext = result.plaintext;
          }
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
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          {busy ? "Exporting…" : "Export & Download"}
        </button>
      </div>
    </div>
  );
}
