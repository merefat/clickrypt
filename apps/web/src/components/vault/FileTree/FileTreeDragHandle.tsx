"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

interface FileTreeDragHandleProps {
  listeners?: DraggableSyntheticListeners | undefined;
  attributes?: DraggableAttributes | undefined;
}

export function FileTreeDragHandle({ listeners, attributes }: FileTreeDragHandleProps) {
  return (
    <button
      type="button"
      className="p-0.5 text-slate-500 hover:text-slate-300 focus:outline-none touch-none cursor-grab"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3" />
    </button>
  );
}
