"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil, X } from "lucide-react";

export interface PasswordFields {
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

interface InlineInspectorEditProps {
  resourceId: string;
  fields: PasswordFields;
  canEdit: boolean;
  onSave: (resourceId: string, next: PasswordFields) => Promise<void>;
}

export function InlineInspectorEdit({ resourceId, fields, canEdit, onSave }: InlineInspectorEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fields);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setDraft(fields); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setShowPassword(false); };

  async function save() {
    setSaving(true);
    try {
      await onSave(resourceId, draft);
      setEditing(false);
      setShowPassword(false);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500";
  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-100">Details</h3>
        {canEdit && !editing && (
          <button onClick={startEdit} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
            <Pencil size={13} /> Edit
          </button>
        )}
        {editing && (
          <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            <X size={13} /> Cancel
          </button>
        )}
      </div>

      <div>
        <label className={labelClass}>Name</label>
        {editing
          ? <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          : <p className="text-sm text-slate-100">{fields.name}</p>}
      </div>

      <div>
        <label className={labelClass}>Username</label>
        {editing
          ? <input className={inputClass} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          : <p className="text-sm text-slate-200">{fields.username}</p>}
      </div>

      <div>
        <label className={labelClass}>Password</label>
        {editing ? (
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className={`${inputClass} pr-8`}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        ) : (
          <p className="font-mono text-sm text-slate-200">••••••••••</p>
        )}
      </div>

      <div>
        <label className={labelClass}>URL</label>
        {editing
          ? <input className={inputClass} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          : <p className="truncate text-sm text-cyan-300/90">{fields.url}</p>}
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        {editing
          ? <textarea className={`${inputClass} min-h-[80px] resize-y`} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          : <p className="whitespace-pre-wrap text-sm text-slate-400">{fields.notes || "—"}</p>}
      </div>

      {editing && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}
