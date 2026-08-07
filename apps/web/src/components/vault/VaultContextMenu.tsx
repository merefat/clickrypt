"use client";

import { useEffect, useRef, useState } from "react";
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const menuContent = items.map((item) => {
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
  });

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={onClose}>
        <div
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-slate-700 bg-slate-900 p-2 pb-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-700" />
          {menuContent}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-52 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menuContent}
    </div>
  );
}
