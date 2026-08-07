"use client";

import { useEffect, useRef, useState } from "react";

interface InlineRenameFieldProps {
  id: string;
  initialName: string;
  isEditing: boolean;
  onCommit: (id: string, newName: string) => Promise<void>;
  onCancel: () => void;
  canRename: boolean;
}

export function InlineRenameField({
  id,
  initialName,
  isEditing,
  onCommit,
  onCancel,
  canRename,
}: InlineRenameFieldProps) {
  const [value, setValue] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setValue(initialName);
      setError(null);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing, initialName]);

  if (!isEditing) {
    return <span className="truncate text-sm text-[#EDEFF5]">{initialName}</span>;
  }

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCommit(id, trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        value={value}
        disabled={saving || !canRename}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className={`w-full rounded-md border bg-[#191C25] px-1.5 py-0.5 text-sm text-[#EDEFF5] outline-none
          ${error ? "border-red-500" : "border-[#6C6BF5]"}`}
      />
      {error && (
        <span className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-[#2A2E3C] px-2 py-1 text-xs text-red-400 shadow-lg">
          {error}
        </span>
      )}
    </div>
  );
}
