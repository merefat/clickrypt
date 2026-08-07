"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";

interface SectionProps {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function Section({ title, icon: Icon, open, onToggle, children }: SectionProps) {
  return (
    <div className="border-b border-[var(--border)]/80">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 group"
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text)]">
          {Icon && <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          {title}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div
        className="overflow-hidden transition-[grid-template-rows] duration-200 ease-out grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden pb-4">{children}</div>
      </div>
    </div>
  );
}
