"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ResourceListItem, Folder } from "./client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

interface SyncEvent {
  type: string;
  entityType: "resource" | "folder";
  entityId: string;
  data?: unknown;
}

interface UseSyncOptions {
  token: string | null;
  onResourceCreate?: (resource: ResourceListItem) => void;
  onResourceUpdate?: (resource: ResourceListItem) => void;
  onResourceDelete?: (resourceId: string) => void;
  onFolderCreate?: (folder: Folder) => void;
  onFolderUpdate?: (folder: Folder) => void;
  onFolderDelete?: (folderId: string) => void;
}

export function useSync({
  token,
  onResourceCreate,
  onResourceUpdate,
  onResourceDelete,
  onFolderCreate,
  onFolderUpdate,
  onFolderDelete,
}: UseSyncOptions) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef({
    onResourceCreate,
    onResourceUpdate,
    onResourceDelete,
    onFolderCreate,
    onFolderUpdate,
    onFolderDelete,
  });
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Keep callbacks ref updated without reconnecting
  callbacksRef.current = {
    onResourceCreate,
    onResourceUpdate,
    onResourceDelete,
    onFolderCreate,
    onFolderUpdate,
    onFolderDelete,
  };

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    const socket = io(API_BASE, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: maxReconnectAttempts,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (!mounted) return;
      console.log("[Sync] WebSocket connected");
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
    });

    socket.on("disconnect", (reason) => {
      if (!mounted) return;
      console.log("[Sync] WebSocket disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      if (!mounted) return;
      console.error("[Sync] WebSocket connection error:", error.message);
      reconnectAttemptsRef.current++;
      setConnectionError(error.message);
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.warn("[Sync] Max reconnection attempts reached, giving up");
      }
    });

    socket.on("sync", (event: SyncEvent) => {
      if (!mounted) return;
      const cb = callbacksRef.current;
      switch (event.type) {
        case "resource:create":
          cb.onResourceCreate?.(event.data as ResourceListItem);
          break;
        case "resource:update":
          cb.onResourceUpdate?.(event.data as ResourceListItem);
          break;
        case "resource:delete":
          cb.onResourceDelete?.(event.entityId);
          break;
        case "folder:create":
          cb.onFolderCreate?.(event.data as Folder);
          break;
        case "folder:update":
          cb.onFolderUpdate?.(event.data as Folder);
          break;
        case "folder:delete":
          cb.onFolderDelete?.(event.entityId);
          break;
      }
    });

    return () => {
      mounted = false;
      socket.disconnect();
      socketRef.current = null;
      reconnectAttemptsRef.current = 0;
      setIsConnected(false);
      setConnectionError(null);
    };
  }, [token]);

  return { isConnected, connectionError };
}
