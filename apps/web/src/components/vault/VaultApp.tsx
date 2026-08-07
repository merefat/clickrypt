"use client";

import { useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  Home,
  Info,
  KeyRound,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Star,
  Tag as TagIcon,
  Trash2,
  Users,
} from "lucide-react";
import { CopyButton } from "./CopyButton";
import { SecretText } from "./SecretText";
import { Section } from "./Section";
import type { Folder, ResourceListItem, Tag as TagType } from "@/lib/api/client";

const PALETTE = [
  { bg: "bg-indigo-500/15", text: "text-indigo-300", ring: "ring-indigo-500/20" },
  { bg: "bg-cyan-500/15", text: "text-cyan-300", ring: "ring-cyan-500/20" },
  { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/20" },
  { bg: "bg-amber-500/15", text: "text-amber-300", ring: "ring-amber-500/20" },
  { bg: "bg-rose-500/15", text: "text-rose-300", ring: "ring-rose-500/20" },
  { bg: "bg-violet-500/15", text: "text-violet-300", ring: "ring-violet-500/20" },
  { bg: "bg-sky-500/15", text: "text-sky-300", ring: "ring-sky-500/20" },
  { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", ring: "ring-fuchsia-500/20" },
];

interface TreeNodeItem {
  id: string;
  label: string;
  icon: "home" | "folder";
  children: TreeNodeItem[];
  myPermission?: "READ" | "UPDATE" | "OWNER" | null;
}

function buildTree(folders: Folder[]): TreeNodeItem[] {
  const byId = new Map<string, TreeNodeItem>();
  const children = new Map<string | null, TreeNodeItem[]>();
  children.set(null, []);

  const home: TreeNodeItem = { id: "home", label: "Home", icon: "home", children: [], myPermission: null };
  children.get(null)!.push(home);

  for (const f of folders) {
    const node: TreeNodeItem = { id: f.id, label: f.name, icon: "folder", children: [], myPermission: f.myPermission };
    byId.set(f.id, node);
    const key = f.parentFolderId ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(node);
  }

  for (const [id, node] of byId) {
    node.children = children.get(id) ?? [];
  }

  // treat root private folders as children of home for display
  home.children = children.get(null)!.filter((n) => n.id !== "home");

  return [home];
}

function TreeNode({
  node,
  depth,
  openMap,
  toggle,
  activeId,
  onSelect,
}: {
  node: TreeNodeItem;
  depth: number;
  openMap: Record<string, boolean>;
  toggle: (id: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = !!openMap[node.id];
  const Icon = node.icon === "home" ? Home : open ? FolderOpen : FolderIcon;
  const isActive = activeId === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`group w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150
          ${isActive ? "bg-indigo-500/10 text-indigo-200" : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(node.id);
          }}
          className={`relative flex items-center justify-center w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform duration-200 ${!hasChildren ? "opacity-0" : ""}`}
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <ChevronDown className="w-3 h-3" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </span>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}`} />
        <span className="truncate">{node.label}</span>
        {isActive && <span className="ml-auto w-1 h-1 rounded-full bg-indigo-400" />}
      </button>
      {hasChildren && (
        <div
          className="overflow-hidden transition-[grid-template-rows] duration-200 ease-out grid"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden relative">
            {depth >= 0 && (
              <span
                className="absolute top-0 bottom-0 w-px bg-slate-800"
                style={{ left: 8 + depth * 14 + 6 }}
              />
            )}
            {node.children.map((c) => (
              <TreeNode
                key={c.id}
                node={c}
                depth={depth + 1}
                openMap={openMap}
                toggle={toggle}
                activeId={activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function rowStyle(id: string) {
  const p = PALETTE[id.length % PALETTE.length];
  return p;
}

function buildBreadcrumbPath(id: string | null, folders: Folder[]) {
  if (!id) return [{ id: "home", name: "Home" }];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: { id: string; name: string }[] = [];
  let current: Folder | undefined = byId.get(id);
  while (current) {
    parts.unshift({ id: current.id, name: current.name });
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return [{ id: "home", name: "Home" }, ...parts];
}

interface VaultAppProps {
  folders: Folder[];
  resources: ResourceListItem[];
  tags: TagType[];
  groups?: { id: string; name: string }[];
  loading?: boolean;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  selectedResource: ResourceListItem | null;
  onSelectResource: (resource: ResourceListItem | null) => void;
  revealedPasswords: Record<string, string>;
  decryptingPasswordId: string | null;
  onToggleReveal: (resource: ResourceListItem) => void;
  decryptedSecret: Record<string, string> | null;
  revealPassword: boolean;
  onToggleDetailReveal: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onCreate: (type: "folder" | "password") => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onLock: () => void;
  onLogout: () => void;
  email: string | null;
  syncConnected: boolean;
}

export default function VaultApp({
  folders,
  resources,
  tags,
  groups,
  selectedFolderId,
  onSelectFolder,
  selectedResource,
  onSelectResource,
  revealedPasswords,
  decryptingPasswordId,
  onToggleReveal,
  decryptedSecret,
  revealPassword,
  onToggleDetailReveal,
  query,
  onQueryChange,
  favoriteIds,
  onToggleFavorite,
  onCreate,
  onEdit,
  onShare,
  onDelete,
  onInfo,
  onLock,
  onLogout,
  email,
  syncConnected,
}: VaultAppProps) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { home: true };
    for (const f of folders) {
      initial[f.id] = false;
    }
    return initial;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<"details" | "activity">("details");
  const [sections, setSections] = useState({
    password: true,
    note: true,
    shared: false,
    info: false,
    description: false,
    tags: false,
    comments: false,
  });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const panelIconRef = useRef<HTMLDivElement>(null);

  const toggleFolder = (id: string) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));

  const tree = useMemo(() => buildTree(folders), [folders]);
  const breadcrumbs = useMemo(() => buildBreadcrumbPath(selectedFolderId, folders), [selectedFolderId, folders]);

  const onPanelMouseMove = (e: React.MouseEvent) => {
    const el = panelIconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    setTilt({ x: dy * -10, y: dx * 10 });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });

  const canEditResource = selectedResource?.myPermission === "OWNER" || selectedResource?.myPermission === "UPDATE";
  const canOwnResource = selectedResource?.myPermission === "OWNER";

  const activeStyle = selectedResource ? rowStyle(selectedResource.id) : PALETTE[0];

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden rounded-xl border border-slate-800" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {/* top bar */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-4 border-b border-slate-800 bg-slate-950/95">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center ring-1 ring-inset ring-indigo-500/30">
            <Shield className="w-4 h-4 text-indigo-300" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-100">Vault</span>
        </div>

        <div className="flex-1 max-w-md relative group">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-indigo-400 transition-colors" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search resources"
            className="w-full bg-slate-900/80 border border-slate-800 focus:border-indigo-500/60 rounded-lg pl-9 pr-14 py-2 text-[13px] text-slate-200 placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-indigo-500/20"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
        </div>

        <div className="flex-1" />
        <button onClick={onLock} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors" title="Lock vault">
          <KeyRound className="w-4 h-4" />
        </button>
        <button onClick={onLogout} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors" title="Sign out">
          <Settings className="w-4 h-4" />
        </button>
        <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-[11px] font-semibold text-white">
          {email ? email.slice(0, 2).toUpperCase() : "??"}
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-950 ${syncConnected ? "bg-emerald-400" : "bg-red-400"}`} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* sidebar */}
        <aside className="w-60 shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/60">
          <div className="p-3">
            <div className="relative">
              <button
                onClick={() => setCreateOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 transition-colors text-white text-[13px] font-medium rounded-lg py-2 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
              >
                <Plus className="w-3.5 h-3.5" /> Create
              </button>
              {createOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                  <button
                    onClick={() => { setCreateOpen(false); onCreate("password"); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-indigo-500/20"
                  >
                    <KeyRound className="w-4 h-4" /> Password
                  </button>
                  <button
                    onClick={() => { setCreateOpen(false); onCreate("folder"); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-indigo-500/20"
                  >
                    <FolderIcon className="w-4 h-4" /> Folder
                  </button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-indigo-500/20">
                    <Download className="w-4 h-4" /> Export
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
            <div>
              {tree.map((n) => (
                <TreeNode
                  key={n.id}
                  node={n}
                  depth={0}
                  openMap={openMap}
                  toggle={toggleFolder}
                  activeId={selectedFolderId}
                  onSelect={(id) => {
                    onSelectFolder(id === "home" ? null : id);
                    onSelectResource(null);
                  }}
                />
              ))}
            </div>

            {groups && groups.length > 0 && (
              <div>
                <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> Groups
                </div>
                {groups.map((g) => (
                  <button key={g.id} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase flex items-center gap-1.5">
                <TagIcon className="w-3 h-3" /> Tags
              </div>
              {tags.length === 0 ? (
                <p className="px-2 text-[12px] text-slate-600">No tags</p>
              ) : (
                tags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectFolder(null)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors"
                  >
                    <TagIcon className="w-3 h-3 text-slate-600" />
                    {t.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* main */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0">
            <div>
              <h1 className="text-[15px] font-semibold text-slate-100">
                {breadcrumbs[breadcrumbs.length - 1]?.name ?? "Home"}
              </h1>
              <p className="text-[12px] text-slate-500 mt-0.5">{resources.length} items</p>
            </div>
            <div className="flex items-center gap-1">
              {selectedResource && (
                <>
                  {canEditResource && (
                    <button onClick={onEdit} className="flex items-center gap-1.5 text-[12px] text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 rounded-md px-2.5 py-1.5 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  {canOwnResource && selectedResource.source !== "workplace" && (
                    <button onClick={onShare} className="flex items-center gap-1.5 text-[12px] text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 rounded-md px-2.5 py-1.5 transition-colors">
                      <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                  )}
                  {canOwnResource && (
                    <button onClick={onDelete} className="flex items-center gap-1.5 text-[12px] text-red-300 hover:text-red-100 hover:bg-red-500/10 rounded-md px-2.5 py-1.5 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                  <button onClick={onInfo} className="flex items-center gap-1.5 text-[12px] text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 rounded-md px-2.5 py-1.5 transition-colors">
                    <Info className="w-3.5 h-3.5" /> Info
                  </button>
                </>
              )}
            </div>
          </div>

          {/* table */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-950">
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Username</th>
                  <th className="py-2 font-medium">Password</th>
                  <th className="py-2 font-medium w-20">TOTP</th>
                  <th className="py-2 font-medium">URI</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => {
                  const isActive = selectedResource?.id === r.id;
                  const isRevealed = !!revealedPasswords[r.id];
                  const isDecrypting = decryptingPasswordId === r.id;
                  const style = rowStyle(r.id);
                  const username = (r.metadata as Record<string, string>)?.username ?? "—";
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onSelectResource(r)}
                      className={`group border-b border-slate-900 cursor-pointer transition-colors
                        ${isActive ? "bg-indigo-500/10" : "hover:bg-slate-900/70"}`}
                      style={{ borderLeft: isActive ? "2px solid #6366f1" : "2px solid transparent" }}
                    >
                      <td className="py-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold shrink-0 ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}>
                            {r.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-slate-100 font-medium truncate">{r.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(r.id); }}
                            className={`text-slate-500 hover:text-amber-400 transition-colors ${favoriteIds.has(r.id) ? "text-amber-400" : ""}`}
                          >
                            <Star className="w-3.5 h-3.5" fill={favoriteIds.has(r.id) ? "currentColor" : "none"} />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 text-slate-400">{username}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          {isDecrypting ? (
                            <span className="text-[12px] text-slate-500">Decrypting…</span>
                          ) : r.resourceType === "totp" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/25 rounded-full px-2 py-0.5">
                              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                              {String(100 + r.id.length * 37).slice(0, 3)} {String(200 + r.id.length * 19).slice(0, 3)}
                            </span>
                          ) : (
                            <>
                              <SecretText value={revealedPasswords[r.id] ?? ""} revealed={isRevealed} />
                              <button
                                onClick={(e) => { e.stopPropagation(); onToggleReveal(r); }}
                                className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-100 hover:bg-slate-800/70 transition-all"
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              {isRevealed && (
                                <CopyButton
                                  value={revealedPasswords[r.id]}
                                  className="opacity-0 group-hover:opacity-100"
                                />
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2">
                        {r.resourceType === "totp" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/25 rounded-full px-2 py-0.5">
                            <Clock className="w-3 h-3" />
                            {String(100 + r.id.length * 37).slice(0, 3)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-slate-500 truncate max-w-[220px]">
                        {r.uri ? (
                          <span className="inline-flex items-center gap-1.5">
                            {r.uri}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>

        {/* detail panel */}
        <aside className="w-80 shrink-0 border-l border-slate-800 flex flex-col bg-slate-950/60">
          {selectedResource ? (
            <>
              <div
                className="p-5 border-b border-slate-800"
                onMouseMove={onPanelMouseMove}
                onMouseLeave={resetTilt}
              >
                <div className="flex items-start gap-3">
                  <div
                    ref={panelIconRef}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 ring-inset shrink-0 ${activeStyle.bg} ${activeStyle.text} ${activeStyle.ring}`}
                    style={{
                      transform: `perspective(300px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                      transition: "transform 120ms ease-out",
                    }}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-semibold text-slate-100 truncate">{selectedResource.name}</h2>
                    <p className="text-[12px] text-slate-500">Password and note</p>
                  </div>
                  <button className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-100 hover:bg-slate-800/70 transition-colors shrink-0">
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1 mt-4 bg-slate-900/60 rounded-lg p-0.5 relative">
                  {["details", "activity"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t as any)}
                      className={`flex-1 relative z-10 text-[12px] font-medium py-1.5 rounded-md capitalize transition-colors ${tab === t ? "text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      {t}
                    </button>
                  ))}
                  <span
                    className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-800 rounded-md transition-transform duration-200 ease-out"
                    style={{ transform: tab === "details" ? "translateX(2px)" : "translateX(calc(100% + 2px))" }}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5">
                {tab === "details" ? (
                  <>
                    <Section title="Password" icon={KeyRound} open={sections.password} onToggle={() => setSections((s) => ({ ...s, password: !s.password }))}>
                      {decryptedSecret ? (
                        <div className="space-y-2.5 text-[13px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 w-16 shrink-0">Username</span>
                            <span className="font-mono text-slate-200 truncate">{decryptedSecret.username ?? "—"}</span>
                            {decryptedSecret.username && (
                              <CopyButton value={decryptedSecret.username} className="shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 w-16 shrink-0">Password</span>
                            <SecretText value={decryptedSecret.password ?? ""} revealed={revealPassword} className="text-slate-200 truncate flex-1 justify-end" />
                            <button onClick={onToggleDetailReveal} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors shrink-0">
                              {revealPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <CopyButton value={decryptedSecret.password ?? ""} className="shrink-0" />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 w-16 shrink-0">URI</span>
                            <span className="text-cyan-300/90 truncate">{selectedResource.uri ?? "—"}</span>
                            {selectedResource.uri && (
                              <CopyButton value={selectedResource.uri} className="shrink-0" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-slate-500">Select a resource to decrypt its secret.</p>
                      )}
                    </Section>

                    <Section title="Note" icon={FileText} open={sections.note} onToggle={() => setSections((s) => ({ ...s, note: !s.note }))}>
                      {decryptedSecret?.notes ? (
                        <p className="text-[13px] text-slate-400 leading-relaxed">{decryptedSecret.notes}</p>
                      ) : (
                        <p className="text-[13px] text-slate-500">No note has been set.</p>
                      )}
                    </Section>

                    <Section title="Shared with" icon={Users} open={sections.shared} onToggle={() => setSections((s) => ({ ...s, shared: !s.shared }))}>
                      {selectedResource.sharingMode === "AUTO" || selectedResource.source === "group" ? (
                        <p className="text-[13px] text-slate-400">Shared with this resource's group or workspace.</p>
                      ) : (
                        <p className="text-[13px] text-slate-500">Only the owner has access to this password.</p>
                      )}
                    </Section>

                    <Section title="Information" icon={Info} open={sections.info} onToggle={() => setSections((s) => ({ ...s, info: !s.info }))}>
                      <div className="space-y-1.5 text-[12px] text-slate-500">
                        <div className="flex justify-between"><span>Created</span><span className="text-slate-400">{new Date(selectedResource.createdAt).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span>Modified</span><span className="text-slate-400">{new Date(selectedResource.updatedAt).toLocaleDateString()}</span></div>
                      </div>
                    </Section>

                    <Section title="Description" icon={FileText} open={sections.description} onToggle={() => setSections((s) => ({ ...s, description: !s.description }))}>
                      <p className="text-[13px] text-slate-500">No description provided.</p>
                    </Section>

                    <Section title="Tags" icon={TagIcon} open={sections.tags} onToggle={() => setSections((s) => ({ ...s, tags: !s.tags }))}>
                      {selectedResource.tags.length === 0 ? (
                        <p className="text-[13px] text-slate-500">No tags on this resource.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {selectedResource.tags.map((t) => (
                            <span key={t.id} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{t.name}</span>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Comments" icon={MessageSquare} open={sections.comments} onToggle={() => setSections((s) => ({ ...s, comments: !s.comments }))}>
                      <p className="text-[13px] text-slate-500">No comments yet.</p>
                    </Section>
                  </>
                ) : (
                  <div className="py-5 space-y-4">
                    {[
                      { icon: Pencil, text: "Password updated", time: "2 weeks ago" },
                      { icon: Share2, text: "Shared with Back End", time: "1 month ago" },
                      { icon: Plus, text: "Resource created", time: "3 months ago" },
                    ].map((a, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-slate-900 ring-1 ring-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                          <a.icon className="w-3 h-3 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] text-slate-300">{a.text}</p>
                          <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" />{a.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 ring-1 ring-slate-800 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-slate-700" />
              </div>
              <p className="text-[13px] text-slate-500">Select a resource to view its details.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
