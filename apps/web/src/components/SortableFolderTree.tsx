"use client";

import React, { useState, useRef, useCallback, useMemo, memo } from "react";
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
import { ChevronRight, Folder, FolderOpen, GripVertical } from "lucide-react";
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

function buildLookups(folders: FolderType[]) {
  const byId = new Map<string, FolderType>();
  const children = new Map<string | null, FolderType[]>();
  children.set(null, []);

  for (const folder of folders) {
    byId.set(folder.id, folder);
    const parentKey = folder.parentFolderId ?? null;
    if (!children.has(parentKey)) {
      children.set(parentKey, []);
    }
    children.get(parentKey)!.push(folder);
  }

  for (const list of children.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  return { byId, children };
}

function buildDescendantSet(
  startId: string,
  children: Map<string | null, FolderType[]>
): Set<string> {
  const result = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    const list = children.get(id) ?? [];
    for (const child of list) {
      result.add(child.id);
      stack.push(child.id);
    }
  }
  return result;
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

  const { byId, children } = useMemo(() => buildLookups(folders), [folders]);

  const activeDescendantIds = useMemo(
    () => (activeId ? buildDescendantSet(activeId, children) : new Set<string>()),
    [activeId, children]
  );

  const activeFolder = activeId ? (byId.get(activeId) ?? null) : null;

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

      if (activeDescendantIds.has(targetId)) return;

      const targetFolder = byId.get(targetId);
      if (!targetFolder) return;

      const position = currentDropTarget?.position ?? null;

      let newParentId: string | null;
      let newSortOrder: number;

      if (position === "inside") {
        newParentId = targetId;
        const siblings = (children.get(targetId) ?? []).filter((f) => f.id !== draggedId);
        newSortOrder = siblings.length;
      } else {
        newParentId = targetFolder.parentFolderId ?? null;
        const siblings = (children.get(newParentId) ?? []).filter((f) => f.id !== draggedId);
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
    [activeDescendantIds, byId, children, onReorder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
    pointerOffsetRef.current = null;
  }, []);

  const setItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);

  const renderFolderGroup = useCallback(
    function renderFolderGroup(parentId: string | null, depth: number): React.ReactNode {
      const siblings = children.get(parentId) ?? [];
      if (siblings.length === 0) return null;

      return (
        <SortableContext items={siblings.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {siblings.map((folder) => (
            <MemoizedSortableFolderItem
              key={folder.id}
              folder={folder}
              depth={depth}
              isSelected={selectedFolderId === folder.id}
              isExpanded={expandedFolders.has(folder.id)}
              onSelect={onSelectFolder}
              onToggleExpand={onToggleExpand}
              actionButtons={actionButtons}
              dropTargetId={dropTarget?.id ?? null}
              dropTargetPosition={dropTarget?.position ?? null}
              isDragging={activeId === folder.id}
              isDescendantOfActive={activeDescendantIds.has(folder.id)}
              setItemRef={setItemRef}
              hasChildren={(children.get(folder.id)?.length ?? 0) > 0}
            >
              {expandedFolders.has(folder.id) && (
                <div className="pl-2">{renderFolderGroup(folder.id, depth + 1)}</div>
              )}
            </MemoizedSortableFolderItem>
          ))}
        </SortableContext>
      );
    },
    [
      children,
      selectedFolderId,
      expandedFolders,
      onSelectFolder,
      onToggleExpand,
      actionButtons,
      dropTarget,
      activeId,
      activeDescendantIds,
      setItemRef,
    ]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
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
  dropTargetId: string | null;
  dropTargetPosition: DropPosition;
  isDragging: boolean;
  isDescendantOfActive: boolean;
  setItemRef: (id: string, el: HTMLDivElement | null) => void;
  hasChildren: boolean;
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
  dropTargetId,
  dropTargetPosition,
  isDragging,
  isDescendantOfActive,
  setItemRef,
  children,
  hasChildren,
}: SortableFolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: folder.id });

  // hasChildren is derived from the folder map so the chevron is shown
  // even when the child group is currently collapsed (not rendered).

  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      setItemRef(folder.id, node);
    },
    [setNodeRef, setItemRef, folder.id]
  );

  const isDropTarget = dropTargetId === folder.id;
  const dropPosition = isDropTarget ? dropTargetPosition : null;

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
        className={`group relative flex items-center justify-between rounded-md py-1.5 border-l-2 transition-colors duration-150 ${
          isSelected
            ? "border-[var(--brand)] bg-[#6c6bf5]/10 text-[var(--text)]"
            : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)]/60 hover:text-[var(--text)]"
        } ${showNestHighlight ? "ring-2 ring-[var(--brand)] bg-[#6c6bf5]/10" : ""} ${
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
              className={`shrink-0 px-1 transition-colors ${isSelected ? "text-[var(--brand)]" : "text-[var(--text-muted)]"} hover:text-[var(--text)]`}
            >
              <ChevronRight
                className="h-3 w-3 transition-transform duration-200"
                style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <button
            onClick={() => onSelect(folder.id)}
            className="flex flex-1 items-center gap-2 overflow-hidden text-left text-sm"
          >
            {isExpanded ? (
              <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-[var(--brand)]" : "text-[var(--text-muted)] group-hover:text-[var(--text)]"}`} />
            ) : (
              <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-[var(--brand)]" : "text-[var(--text-muted)] group-hover:text-[var(--text)]"}`} />
            )}
            <span className="truncate">{folder.name}</span>
          </button>
        </div>
        {actionButtons && (
          <div className="flex shrink-0 items-center gap-0.5 rounded bg-[var(--surface-hover)]/0 px-1 py-0.5 opacity-0 transition-opacity duration-150 group-hover:bg-[var(--surface-hover)]/60 group-hover:opacity-100 focus-within:opacity-100">
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

const MemoizedSortableFolderItem = memo(SortableFolderItem);
