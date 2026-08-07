"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

interface DuplicateMenuItemProps {
  resourceId: string;
  canRead: boolean;
  onDuplicate: () => Promise<{ id: string }>;
  onDuplicated: (newResourceId: string) => void;
}

export function DuplicateMenuItem({
  resourceId,
  canRead,
  onDuplicate,
  onDuplicated,
}: DuplicateMenuItemProps) {
  const [busy, setBusy] = useState(false);

  if (!canRead) return null;

  async function handleClick() {
    setBusy(true);
    try {
      const created = await onDuplicate();
      onDuplicated(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800/60 disabled:opacity-50"
    >
      <Copy size={15} /> {busy ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
