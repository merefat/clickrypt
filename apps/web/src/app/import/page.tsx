"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, FileUp } from "lucide-react";
import { apiClient, type ImportResult } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session";
import { encryptMessage, getPublicKeyFromPrivateKey } from "@clickrypt/crypto";

export default function ImportPage() {
  const router = useRouter();
  const { unlocked, privateKey } = useSessionStore();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"csv" | "bitwarden">("csv");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
    }
  }, [unlocked, router]);

  async function handleImport() {
    if (!file || !privateKey) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const publicKey = await getPublicKeyFromPrivateKey(privateKey);

      // Parse the file client-side to know how many entries there are
      const text = await file.text();
      let entries: { name: string; username?: string; password?: string; notes?: string; uri?: string }[] = [];

      if (format === "csv") {
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) throw new Error("CSV file appears empty");
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim(); });
          entries.push({
            name: row.name || row.title || "Untitled",
            username: row.username || undefined,
            password: row.password || undefined,
            notes: row.notes || undefined,
            uri: row.uri || row.url || undefined,
          });
        }
      } else {
        const data = JSON.parse(text);
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item.type === 1 && item.login) {
              entries.push({
                name: item.name || "Untitled",
                username: item.login.username || undefined,
                password: item.login.password || undefined,
                notes: item.notes || undefined,
                uri: item.login.uris?.[0]?.uri || undefined,
              });
            }
          }
        }
      }

      // Encrypt each entry's secret payload
      const encryptedMap: Record<number, string> = {};
      for (let i = 0; i < entries.length; i++) {
        const payload = JSON.stringify({
          username: entries[i].username ?? "",
          password: entries[i].password ?? "",
          notes: entries[i].notes ?? "",
        });
        encryptedMap[i] = await encryptMessage(payload, [publicKey]);
      }

      const encryptedEntries = JSON.stringify(encryptedMap);
      const res = format === "csv"
        ? await apiClient.importCsv(file, encryptedEntries)
        : await apiClient.importBitwarden(file, encryptedEntries);

      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
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
        <Upload className="h-6 w-6 text-brand-500" />
        <h1 className="text-2xl font-bold">Import Passwords</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3">
          <p className="font-semibold text-[#1ebbd4]">Imported: {result.imported}</p>
          {result.failed > 0 && (
            <p className="text-sm text-[#f89c11]">Failed: {result.failed}</p>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-[#8ba3b8]">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
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

        <div>
          <label className="mb-2 block text-sm text-[#c4d4e0]">File</label>
          <input
            type="file"
            accept={format === "csv" ? ".csv" : ".json"}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-600 file:px-3 file:py-1 file:text-sm file:text-white"
          />
        </div>

        <button
          onClick={handleImport}
          disabled={!file || busy}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <FileUp className="h-4 w-4" />
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
