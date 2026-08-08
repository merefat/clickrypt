import type { Folder, ResourceListItem } from "@/lib/api/client";

export type TreeItemType = "folder" | "resource";

export interface TreeItem {
  id: string;
  name: string;
  type: TreeItemType;
  parentId: string | null;
  sortOrder: number;
  data: Folder | ResourceListItem;
  expanded?: boolean;
  selected?: boolean;
}

export type DropPosition = "above" | "inside" | "below";

export function buildTree(
  folders: Folder[],
  resources: ResourceListItem[]
): Record<string, TreeItem> {
  const items: Record<string, TreeItem> = {};

  for (const folder of folders) {
    items[folder.id] = {
      id: folder.id,
      name: folder.name,
      type: "folder",
      parentId: folder.parentFolderId ?? null,
      sortOrder: folder.sortOrder,
      data: folder,
    };
  }

  for (const resource of resources) {
    items[resource.id] = {
      id: resource.id,
      name: resource.name,
      type: "resource",
      parentId: resource.folder?.id ?? null,
      sortOrder: resource.sortOrder ?? 0,
      data: resource,
    };
  }

  return items;
}

export function getChildren(
  items: Record<string, TreeItem>,
  parentId: string | null
): TreeItem[] {
  const list = Object.values(items).filter((item) => item.parentId === parentId);
  list.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  });
  return list;
}

export function isDescendant(
  items: Record<string, TreeItem>,
  ancestorId: string,
  maybeDescendantId: string
): boolean {
  let current: string | null = maybeDescendantId;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    current = items[current]?.parentId ?? null;
  }
  return false;
}
