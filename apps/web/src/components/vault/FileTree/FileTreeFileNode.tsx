"use client";

import { FileTreeNode } from "./FileTreeNode";
import type { DropPosition, TreeItem, TreeItemType } from "./types";

interface FileTreeFileNodeProps {
  item: TreeItem;
  depth: number;
  isSelected: boolean;
  dropPosition?: DropPosition;
  dragOverlay?: boolean;
  selectedCount?: number;
  groupId?: string | null;
  onSelect: (id: string, event?: React.MouseEvent) => void;
  onToggleExpand: (id: string) => void;
  onCreate?: (type: "resource" | "folder", folderId?: string | null) => void;
  onDelete?: (id: string, type: TreeItemType) => void;
}

export function FileTreeFileNode({
  item,
  depth,
  isSelected,
  dropPosition,
  dragOverlay,
  selectedCount,
  groupId,
  onSelect,
  onToggleExpand,
  onCreate,
  onDelete,
}: FileTreeFileNodeProps) {
  return (
    <FileTreeNode
      item={item}
      depth={depth}
      isSelected={isSelected}
      dropPosition={dropPosition}
      dragOverlay={dragOverlay}
      selectedCount={selectedCount}
      groupId={groupId}
      onSelect={onSelect}
      onToggleExpand={onToggleExpand}
      onCreate={onCreate}
      onDelete={onDelete}
    />
  );
}
