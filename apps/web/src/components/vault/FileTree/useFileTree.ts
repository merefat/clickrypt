"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Folder, ResourceListItem } from "@/lib/api/client";
import { buildTree, getChildren, isDescendant, type DropPosition, type TreeItem } from "./types";

export interface UseFileTreeOptions {
  folders: Folder[];
  resources: ResourceListItem[];
  initialExpanded?: string[];
  initialSelected?: string[];
  onChange?: (items: Record<string, TreeItem>) => void;
}

export function useFileTree(options: UseFileTreeOptions) {
  const { folders, resources, initialExpanded, initialSelected, onChange } = options;

  const initialItems = useMemo(() => buildTree(folders, resources), [folders, resources]);

  const [items, setItems] = useState<Record<string, TreeItem>>(() => {
    const next: Record<string, TreeItem> = {};
    const expandedSet = new Set(initialExpanded ?? []);
    const selectedSet = new Set(initialSelected ?? []);
    for (const [id, item] of Object.entries(initialItems)) {
      next[id] = {
        ...item,
        expanded: expandedSet.has(id),
        selected: selectedSet.has(id),
      };
    }
    return next;
  });

  useEffect(() => {
    setItems((prev) => {
      const expandedSet = new Set(initialExpanded ?? []);
      const selectedSet = new Set(initialSelected ?? []);
      const next: Record<string, TreeItem> = {};
      for (const [id, item] of Object.entries(initialItems)) {
        const existing = prev[id];
        next[id] = {
          ...item,
          expanded: existing ? existing.expanded : expandedSet.has(id),
          selected: existing ? existing.selected : selectedSet.has(id),
        };
      }
      return next;
    });
  }, [initialItems]);

  useEffect(() => {
    const selectedId = initialSelected?.[0] ?? null;
    setItems((prev) => {
      const next: Record<string, TreeItem> = {};
      for (const [id, item] of Object.entries(prev)) {
        next[id] = { ...item, selected: id === selectedId };
      }
      return next;
    });
  }, [initialSelected?.[0] ?? null]);

  const expandedIds = useMemo(
    () => new Set(Object.values(items).filter((item) => item.expanded).map((item) => item.id)),
    [items]
  );

  const selectedIds = useMemo(
    () => new Set(Object.values(items).filter((item) => item.selected).map((item) => item.id)),
    [items]
  );

  const toggleExpand = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev[id];
      if (!item) return prev;
      const next = { ...prev };
      next[id] = { ...item, expanded: !item.expanded };
      return next;
    });
  }, []);

  const select = useCallback(
    (id: string, event?: React.MouseEvent) => {
      setItems((prev) => {
        const next: Record<string, TreeItem> = {};
        for (const [key, item] of Object.entries(prev)) {
          next[key] = { ...item };
        }

        if (event?.ctrlKey || event?.metaKey) {
          next[id] = { ...next[id], selected: !next[id].selected };
        } else {
          for (const key of Object.keys(next)) {
            next[key] = { ...next[key], selected: false };
          }
          next[id] = { ...next[id], selected: true };
        }
        return next;
      });
    },
    []
  );

  const getRootItems = useCallback(() => getChildren(items, null), [items]);

  const getChildrenItems = useCallback(
    (id: string) => getChildren(items, id),
    [items]
  );

  const move = useCallback(
    (activeId: string, targetId: string, position: DropPosition) => {
      console.log("[DnD] move called", { activeId, targetId, position });
      if (activeId === targetId) {
        return;
      }

      const activeItem = items[activeId];
      const targetItem = items[targetId];

      if (!activeItem || !targetItem) {
        return;
      }

      if (position === "inside" && targetItem.type !== "folder") {
        return;
      }

      const idsToMove = selectedIds.has(activeId)
        ? Array.from(selectedIds)
        : [activeId];

      if (idsToMove.includes(targetId)) {
        return;
      }

      for (const id of idsToMove) {
        const item = items[id];
        if (!item) {
          return;
        }
        if (item.type === "folder" && isDescendant(items, id, targetId)) {
          return;
        }
      }

      const movedSet = new Set(idsToMove);
      const movedItems = idsToMove
        .map((id) => items[id])
        .filter((item): item is TreeItem => !!item)
        .sort((a, b) => {
          const pa = a.parentId ?? "";
          const pb = b.parentId ?? "";
          if (pa !== pb) {
            return pa.localeCompare(pb);
          }
          return a.sortOrder - b.sortOrder;
        });

      const newParentId = position === "inside" ? targetId : targetItem.parentId;

      const oldParents = new Set(movedItems.map((item) => item.parentId));
      const nextItems: Record<string, TreeItem> = { ...items };

      for (const parentId of oldParents) {
        if (parentId === newParentId) {
          continue;
        }
        const children = getChildren(nextItems, parentId).filter(
          (item) => !movedSet.has(item.id)
        );
        children.forEach((item, index) => {
          nextItems[item.id] = { ...nextItems[item.id], sortOrder: index };
        });
      }

      const newParentChildren = getChildren(items, newParentId).map(
        (item) => item.id
      );
      const filtered = newParentChildren.filter((id) => !movedSet.has(id));

      let insertIndex: number;
      if (position === "inside") {
        insertIndex = filtered.length;
      } else {
        const targetIndex = filtered.indexOf(targetId);
        if (targetIndex === -1) {
          return;
        }
        insertIndex = position === "above" ? targetIndex : targetIndex + 1;
      }

      const movedIds = movedItems.map((item) => item.id);
      const finalIds = [
        ...filtered.slice(0, insertIndex),
        ...movedIds,
        ...filtered.slice(insertIndex),
      ];

      finalIds.forEach((id, index) => {
        nextItems[id] = { ...nextItems[id], parentId: newParentId, sortOrder: index };
      });

      setItems(nextItems);
      onChange?.(nextItems);
    },
    [items, onChange]
  );

  return {
    items,
    expandedIds,
    selectedIds,
    toggleExpand,
    select,
    move,
    getRootItems,
    getChildren: getChildrenItems,
  };
}
