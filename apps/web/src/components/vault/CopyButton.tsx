"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  value: string;
  className?: string;
  onCopy?: () => void;
}

export function CopyButton({ value, className, onCopy }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      onClick={handleClick}
      className={`relative w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors ${className ?? ""}`}
      title="Copy"
    >
      <Copy className={`w-3.5 h-3.5 absolute transition-all duration-200 ${copied ? "opacity-0 scale-50" : "opacity-100 scale-100"}`} />
      <Check className={`w-3.5 h-3.5 absolute text-[var(--success)] transition-all duration-200 ${copied ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
    </button>
  );
}
