"use client";

import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useFileTree } from "./useFileTree";
import { FileTreeFileNode } from "./FileTreeFileNode";
import { FileTreeFolderNode } from "./FileTreeFolderNode";
import { FileTreeNode } from "./FileTreeNode";
import { getChildren, type DropPosition, type TreeItem, type TreeItemType } from "./types";
import type { Folder, ResourceListItem } from "@/lib/api/client";

interface FileTreeProps {
  folders: Folder[];
  resources: ResourceListItem[];
  selectedId?: string | null;
  expandedIds?: string[];
  groupId?: string | null;
  onSelect: (id: string, type: TreeItemType) => void;
  onToggleExpand: (id: string) => void;
  onChange?: (items: Record<string, TreeItem>) => void;
  onCreate?: (type: "resource" | "folder", folderId?: string | null) => void;
  onDelete?: (id: string, type: TreeItemType) => void;
}

export function FileTree({
  folders,
  resources,
  selectedId,
  expandedIds,
  groupId,
  onSelect,
  onToggleExpand,
  onChange,
  onCreate,
  onDelete,
}: FileTreeProps) {
  const { items, selectedIds, toggleExpand, select, move } = useFileTree({
    folders,
    resources,
    initialExpanded: expandedIds,
    initialSelected: selectedId ? [selectedId] : undefined,
    onChange,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);
  const dropTargetRef = useRef<{ id: string; position: DropPosition } | null>(null);
  const pointerOffsetRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 2 },
    })
  );

  const handleSelect = useCallback(
    (id: string, event?: React.MouseEvent) => {
      select(id, event);
      onSelect(id, items[id]?.type ?? "resource");
    },
    [select, onSelect, items]
  );

  const handleToggleExpand = useCallback(
    (id: string) => {
      toggleExpand(id);
      onToggleExpand(id);
    },
    [toggleExpand, onToggleExpand]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setDropTarget(null);
    dropTargetRef.current = null;
    const ae = event.activatorEvent as any;
    const clientY =
      ae?.clientY ?? ae?.touches?.[0]?.clientY ?? ae?.changedTouches?.[0]?.clientY ?? null;
    const initial = event.active.rect.current?.initial;
    if (clientY !== null && initial) {
      pointerOffsetRef.current = clientY - initial.top;
    } else if (initial) {
      pointerOffsetRef.current = initial.height / 2;
    } else {
      pointerOffsetRef.current = null;
    }
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { over, delta, active } = event;
    if (!over) {
      setDropTarget(null);
      dropTargetRef.current = null;
      return;
    }

    const overId = over.id as string;
    const el = document.getElementById(overId);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const initial = active.rect.current?.initial;
    if (!initial) return;
    const offset = pointerOffsetRef.current ?? initial.height / 2;
    const pointerY = initial.top + offset + delta.y - rect.top;

    const h = rect.height;
    const fifth = h / 5;
    const overType = items[overId]?.type;

    let position: DropPosition;
    if (pointerY < fifth) {
      position = "above";
    } else if (pointerY > h - fifth) {
      position = "below";
    } else if (overType === "folder") {
      position = "inside";
    } else {
      position = pointerY < h / 2 ? "above" : "below";
    }

    setDropTarget({ id: overId, position });
    dropTargetRef.current = { id: overId, position };
  }, [items]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const current = dropTargetRef.current;

      setActiveId(null);
      setDropTarget(null);
      dropTargetRef.current = null;
      pointerOffsetRef.current = null;

      if (!over || !current) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      if (activeId === overId) return;

      console.log("[DnD] end", { activeId, overId, position: current.position });
      move(activeId, overId, current.position);

      if (current.position === "inside" && !items[overId]?.expanded) {
        handleToggleExpand(overId);
      }
    },
    [move, items, handleToggleExpand]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
    pointerOffsetRef.current = null;
  }, []);

  const renderNodes = (parentId: string | null, depth: number): React.ReactNode => {
    const children = getChildren(items, parentId);
    const ids = children.map((item) => item.id);

    return (
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children.map((item) => {
          const dropPosition =
            dropTarget?.id === item.id ? dropTarget.position : undefined;

          if (item.type === "folder") {
            return (
              <FileTreeFolderNode
                key={item.id}
                item={item}
                depth={depth}
                isSelected={!!item.selected}
                dropPosition={dropPosition}
                groupId={groupId}
                onSelect={handleSelect}
                onToggleExpand={handleToggleExpand}
                onCreate={onCreate}
                onDelete={onDelete}
              >
                {renderNodes(item.id, depth + 1)}
              </FileTreeFolderNode>
            );
          }

          return (
            <FileTreeFileNode
              key={item.id}
              item={item}
              depth={depth}
              isSelected={!!item.selected}
              dropPosition={dropPosition}
              groupId={groupId}
              onSelect={handleSelect}
              onToggleExpand={handleToggleExpand}
              onCreate={onCreate}
              onDelete={onDelete}
            />
          );
        })}
      </SortableContext>
    );
  };

  const activeItem = activeId ? items[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="relative">
        {renderNodes(null, 0)}
      </div>
      <DragOverlay>
        {activeItem ? (
          <SortableContext
            items={[activeItem.id]}
            strategy={verticalListSortingStrategy}
          >
            <FileTreeNode
              item={activeItem}
              depth={0}
              isSelected={!!activeItem.selected}
              dragOverlay
              selectedCount={
                selectedIds.has(activeItem.id) ? selectedIds.size : undefined
              }
              onSelect={() => {}}
              onToggleExpand={() => {}}
            />
          </SortableContext>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
