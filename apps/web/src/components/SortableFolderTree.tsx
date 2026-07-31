"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Folder, GripVertical } from "lucide-react";
import type { Folder as FolderType } from "@/lib/api/client";

type DropPosition = "before" | "after" | "inside" | null;

interface SortableFolderTreeProps {
  folders: FolderType[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onReorder: (id: string, parentFolderId: string | null, sortOrder: number) => void;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  actionButtons?: (folder: FolderType) => React.ReactNode;
}

export function SortableFolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onReorder,
  expandedFolders,
  onToggleExpand,
  actionButtons,
}: SortableFolderTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const dropTargetRef = useRef<{ id: string; position: DropPosition } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pointerOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const rootFolders = folders
    .filter((f) => !f.parentFolderId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const activeFolder = activeId ? folders.find((f) => f.id === activeId) ?? null : null;

  function getChildren(parentId: string): FolderType[] {
    return folders
      .filter((f) => f.parentFolderId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  function isDescendant(ancestorId: string, candidateId: string): boolean {
    let current: string | null = candidateId;
    while (current) {
      if (current === ancestorId) return true;
      const folder = folders.find((f) => f.id === current);
      if (!folder || !folder.parentFolderId) break;
      current = folder.parentFolderId;
    }
    return false;
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setDropTarget(null);
    dropTargetRef.current = null;
    const ae = event.activatorEvent as PointerEvent;
    pointerOffsetRef.current = { x: ae.clientX, y: ae.clientY };
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { over, delta } = event;
    if (!over || !pointerOffsetRef.current) {
      setDropTarget(null);
      dropTargetRef.current = null;
      return;
    }

    const overId = over.id as string;
    const el = itemRefs.current.get(overId);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pointerY = pointerOffsetRef.current.y + delta.y - rect.top;
    const h = rect.height;
    const third = h / 3;

    let position: DropPosition;
    if (pointerY < third) {
      position = "before";
    } else if (pointerY > h - third) {
      position = "after";
    } else {
      position = "inside";
    }

    setDropTarget({ id: overId, position });
    dropTargetRef.current = { id: overId, position };
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const currentDropTarget = dropTargetRef.current;

      setActiveId(null);
      setDropTarget(null);
      dropTargetRef.current = null;
      pointerOffsetRef.current = null;

      if (!over || active.id === over.id) return;

      const draggedId = active.id as string;
      const targetId = over.id as string;

      if (isDescendant(draggedId, targetId)) return;

      const targetFolder = folders.find((f) => f.id === targetId);
      if (!targetFolder) return;

      const position = currentDropTarget?.position ?? null;

      let newParentId: string | null;
      let newSortOrder: number;

      if (position === "inside") {
        newParentId = targetId;
        const siblings = getChildren(targetId).filter((f) => f.id !== draggedId);
        newSortOrder = siblings.length;
      } else {
        newParentId = targetFolder.parentFolderId;
        const siblings = getChildren(newParentId ?? "__root__").filter((f) => f.id !== draggedId);
        const targetIndex = siblings.findIndex((f) => f.id === targetId);
        if (targetIndex === -1) {
          newSortOrder = siblings.length;
        } else if (position === "before") {
          newSortOrder = targetIndex;
        } else {
          newSortOrder = targetIndex + 1;
        }
      }

      onReorder(draggedId, newParentId, newSortOrder);
    },
    [folders, onReorder]
  );

  const setItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);

  function renderFolderGroup(parentId: string | null, depth: number): React.ReactNode {
    const siblings = parentId
      ? getChildren(parentId)
      : rootFolders;

    if (siblings.length === 0) return null;

    return (
      <SortableContext items={siblings.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        {siblings.map((folder) => (
          <SortableFolderItem
            key={folder.id}
            folder={folder}
            depth={depth}
            isSelected={selectedFolderId === folder.id}
            isExpanded={expandedFolders.has(folder.id)}
            onSelect={onSelectFolder}
            onToggleExpand={onToggleExpand}
            actionButtons={actionButtons}
            dropTarget={dropTarget}
            isDragging={activeId === folder.id}
            isDescendantOfActive={activeId ? isDescendant(activeId, folder.id) : false}
            setItemRef={setItemRef}
          >
            {expandedFolders.has(folder.id) && (
              <div className="pl-2">{renderFolderGroup(folder.id, depth + 1)}</div>
            )}
          </SortableFolderItem>
        ))}
      </SortableContext>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDropTarget(null);
        dropTargetRef.current = null;
        pointerOffsetRef.current = null;
      }}
    >
      <div ref={containerRef}>
        {renderFolderGroup(null, 0)}
      </div>
      <DragOverlay>
        {activeFolder ? (
          <div className="flex items-center gap-2 rounded-md bg-[#1e3a5f] px-2 py-1.5 text-sm text-white shadow-lg opacity-90">
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activeFolder.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableFolderItemProps {
  folder: FolderType;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  actionButtons?: (folder: FolderType) => React.ReactNode;
  dropTarget: { id: string; position: DropPosition } | null;
  isDragging: boolean;
  isDescendantOfActive: boolean;
  setItemRef: (id: string, el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}

function SortableFolderItem({
  folder,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  actionButtons,
  dropTarget,
  isDragging,
  isDescendantOfActive,
  setItemRef,
  children,
}: SortableFolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: folder.id });

  const hasChildren = React.Children.count(children) > 0;

  const handleRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    setItemRef(folder.id, node);
  }, [setNodeRef, setItemRef, folder.id]);

  const isDropTarget = dropTarget?.id === folder.id;
  const dropPosition = isDropTarget ? dropTarget!.position : null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const showLineBefore = isDropTarget && dropPosition === "before";
  const showLineAfter = isDropTarget && dropPosition === "after";
  const showNestHighlight = isDropTarget && dropPosition === "inside";

  return (
    <div ref={handleRef} style={style}>
      {showLineBefore && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-1 mb-0.5" />
      )}
      <div
        className={`group relative flex items-center justify-between rounded-md py-1.5 ${
          isSelected ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"
        } ${showNestHighlight ? "ring-2 ring-blue-500 bg-blue-500/10" : ""} ${
          isDescendantOfActive ? "opacity-50 pointer-events-none" : ""
        }`}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
        {...attributes}
      >
        <div className="flex flex-1 items-center overflow-hidden">
          <button
            {...listeners}
            className="shrink-0 cursor-grab px-0.5 text-[#8ba3b8] hover:text-white active:cursor-grabbing"
            title="Drag to reorder or nest"
          >
            <GripVertical className="h-3 w-3" />
          </button>
          {hasChildren ? (
            <button
              onClick={() => onToggleExpand(folder.id)}
              className="shrink-0 px-1 text-[#8ba3b8] hover:text-white"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <button
            onClick={() => onSelect(folder.id)}
            className="flex flex-1 items-center gap-2 overflow-hidden text-left text-sm"
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        </div>
        {actionButtons && (
          <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
            {actionButtons(folder)}
          </div>
        )}
      </div>
      {showLineAfter && (
        <div className="h-0.5 bg-blue-500 rounded-full mx-1 mt-0.5" />
      )}
      {children}
    </div>
  );
}
