"use client";

import { Star } from "lucide-react";

export interface FavoriteResource {
  id: string;
  name: string;
  kind: "password" | "totp" | "note" | "custom" | "pin";
}

interface FavoritesSidebarSectionProps {
  favorites: FavoriteResource[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function FavoritesSidebarSection({ favorites, activeId, onSelect }: FavoritesSidebarSectionProps) {
  if (favorites.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Favorites
      </div>
      {favorites.map((f) => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors
            ${activeId === f.id ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"}`}
        >
          <Star size={14} className="fill-indigo-500 text-indigo-500" />
          <span className="truncate">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

interface FavoriteToggleProps {
  resourceId: string;
  isFavorite: boolean;
  onToggle: (resourceId: string, next: boolean) => Promise<void>;
}

export function FavoriteToggle({ resourceId, isFavorite, onToggle }: FavoriteToggleProps) {
  return (
    <button
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      onClick={async (e) => {
        e.stopPropagation();
        await onToggle(resourceId, !isFavorite);
      }}
      className="rounded-md p-1 hover:bg-slate-800/60"
    >
      <Star
        size={16}
        className={isFavorite ? "fill-amber-400 text-amber-400" : "text-slate-500"}
      />
    </button>
  );
}
