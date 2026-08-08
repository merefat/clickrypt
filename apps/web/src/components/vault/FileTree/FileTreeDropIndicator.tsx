"use client";

import { type DropPosition } from "./types";

interface FileTreeDropIndicatorProps {
  position?: DropPosition;
  children: React.ReactNode;
}

export function FileTreeDropIndicator({ position, children }: FileTreeDropIndicatorProps) {
  return (
    <div
      className={`relative ${
        position === "inside" ? "ring-2 ring-blue-500 bg-blue-500/10 rounded-md" : ""
      }`}
    >
      {position === "above" && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 z-10"
          style={{ top: -2 }}
        />
      )}
      {position === "below" && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 z-10"
          style={{ bottom: -2 }}
        />
      )}
      {children}
    </div>
  );
}
