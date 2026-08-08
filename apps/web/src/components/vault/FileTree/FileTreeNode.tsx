"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
} from "lucide-react";
import type { Folder, ResourceListItem } from "@/lib/api/client";
import { FileTreeDragHandle } from "./FileTreeDragHandle";
import { FileTreeDropIndicator } from "./FileTreeDropIndicator";
import type { DropPosition, TreeItem, TreeItemType } from "./types";

interface FileTreeNodeProps {
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
  children?: React.ReactNode;
}

export function FileTreeNode({
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
  children,
}: FileTreeNodeProps) {
  const canMove =
    item.data.myPermission === "OWNER" ||
    item.data.myPermission === "UPDATE" ||
    item.data.myPermission == null;
  const canDelete = item.data.myPermission === "OWNER";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canMove });

  const style = {
    paddingLeft: 8 + depth * 14,
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const expanded = !!item.expanded;
  const isFolder = item.type === "folder";
  const folderData = isFolder ? (item.data as Folder) : null;
  const resourceData = !isFolder ? (item.data as ResourceListItem) : null;
  const Icon = isFolder ? (expanded ? FolderOpen : FolderIcon) : FileText;

  const baseRow = `group w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150`;
  const selectedRow = `bg-blue-500/10 text-blue-200`;
  const normalRow = `text-slate-300 hover:bg-slate-800/60 hover:text-slate-100`;
  const overlayRow = `bg-[#1e3a5f] text-white shadow-lg opacity-90`;

  const rowClasses = dragOverlay
    ? `${baseRow} ${overlayRow}`
    : `${baseRow} ${isSelected ? selectedRow : normalRow}`;

  const handleSelect = (e: React.MouseEvent) => {
    onSelect(item.id, e);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      onToggleExpand(item.id);
    }
  };

  const handleCreate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const folderId = isFolder
      ? item.id
      : resourceData?.folder?.id ?? null;
    onCreate?.("resource", folderId);
  };

  const handleCreateFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFolder) return;
    onCreate?.("folder", item.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete || !onDelete) return;
    if (isFolder) {
      const ok = window.confirm(`Delete folder "${item.name}" and its contents?`);
      if (!ok) return;
    }
    onDelete(item.id, item.type);
  };

  return (
    <FileTreeDropIndicator position={dropPosition}>
      <div
        ref={setNodeRef}
        id={dragOverlay ? undefined : item.id}
        style={style}
        {...attributes}
        onClick={handleSelect}
        className={`${rowClasses} ${isDragging ? "opacity-40" : ""}`}
      >
        {isFolder ? (
          <span
            onClick={handleExpand}
            className={`relative flex items-center justify-center w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform duration-200`}
          >
            <ChevronRight
              className={`w-3 h-3 ${expanded ? "rotate-90" : ""}`}
            />
          </span>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}

        <FileTreeDragHandle listeners={listeners} />

        <Icon
          className={`w-3.5 h-3.5 shrink-0 ${
            isSelected ? "text-blue-300" : "text-slate-500 group-hover:text-slate-300"
          }`}
        />

        <span className="truncate">{item.name}</span>

        {isFolder && typeof folderData?.descendantCount === "number" && folderData.descendantCount > 0 && (
          <span className="ml-auto text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-full">
            {folderData.descendantCount}
          </span>
        )}

        {dragOverlay && selectedCount && selectedCount > 1 && (
          <span className="ml-auto text-[10px] text-white bg-blue-500 px-1.5 py-0.5 rounded-full">
            {selectedCount}
          </span>
        )}

        {onCreate && !dragOverlay && isFolder && groupId && (
          <button
            type="button"
            onClick={handleCreateFolder}
            className="ml-auto p-0.5 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            title="New subfolder"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
        )}

        {onCreate && !dragOverlay && (
          <button
            type="button"
            onClick={handleCreate}
            className={`p-0.5 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${!isFolder || !groupId ? "ml-auto" : ""}`}
            title={isFolder && groupId ? "New password" : undefined}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}

        {onDelete && canDelete && !dragOverlay && (
          <button
            type="button"
            onClick={handleDelete}
            className="p-0.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </FileTreeDropIndicator>
  );
}
