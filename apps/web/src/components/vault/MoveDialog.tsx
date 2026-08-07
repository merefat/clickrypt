"use client";

import { useMemo, useState } from "react";
import { Folder, FolderOpen, Home, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { Folder as FolderType } from "@/lib/api/client";

function buildFolderPath(folders: FolderType[], id: string | null): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let current = id ? byId.get(id) : undefined;
  while (current) {
    parts.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return parts.length > 0 ? parts.join(" / ") : "Home";
}

function isDescendant(folders: FolderType[], ancestorId: string, maybeDescendantId: string): boolean {
  const byParent = new Map<string | null, string[]>();
  for (const f of folders) {
    const key = f.parentFolderId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f.id);
  }
  const queue = [...(byParent.get(ancestorId) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === maybeDescendantId) return true;
    queue.push(...(byParent.get(current) ?? []));
  }
  return false;
}

interface MoveDialogProps {
  title: string;
  folders: FolderType[];
  currentId: string | null;
  excludedIds: string[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<void>;
}

export default function MoveDialog({ title, folders, currentId, excludedIds, onClose, onMove }: MoveDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...folders].sort((a, b) => buildFolderPath(folders, a.id).localeCompare(buildFolderPath(folders, b.id))),
    [folders]
  );

  const canChoose = (f: FolderType) => {
    if (excludedIds.includes(f.id)) return false;
    if (f.myPermission && f.myPermission !== "READ") return true;
    return false;
  };

  const handleMove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onMove(selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        <button
          onClick={() => setSelected(null)}
          className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors
            ${selected === null ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/30" : "text-slate-300 hover:bg-slate-800/60"}`}
        >
          <Home className="h-3.5 w-3.5 text-slate-500" /> Home
        </button>
        {sorted.map((f) => {
          const disabled = !canChoose(f);
          const active = selected === f.id;
          const path = buildFolderPath(folders, f.id);
          return (
            <button
              key={f.id}
              disabled={disabled}
              onClick={() => !disabled && setSelected(f.id)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors
                ${active ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/30" : disabled ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-800/60"}`}
            >
              <Folder className="h-3.5 w-3.5 text-slate-500" />
              <span className="truncate">{path}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-700/50 pt-4">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-3 py-2 text-[13px] text-slate-300 hover:bg-slate-800/70 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleMove}
          disabled={busy}
          className="rounded-lg bg-indigo-500 px-3 py-2 text-[13px] font-medium text-white hover:bg-indigo-400 transition-colors disabled:opacity-50"
        >
          {busy ? "Moving…" : "Move"}
        </button>
      </div>
    </Dialog>
  );
}
