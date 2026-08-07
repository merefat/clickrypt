"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface VaultContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function VaultContextMenu({ x, y, items, onClose }: VaultContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Keep menu inside viewport as a quick best-effort offset
  const top = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 220 : y);
  const left = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 180 : x);

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-52 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors
              ${item.disabled ? "text-slate-600" : item.danger ? "text-red-300 hover:bg-red-500/10" : "text-slate-200 hover:bg-indigo-500/20 hover:text-white"}`}
          >
            {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
