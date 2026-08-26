'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Lock,
  KeyRound,
  Users,
  Folder,
  Share2,
  FileSpreadsheet,
  Settings,
  LogOut,
  UserCheck,
  ChevronLeft,
  ChevronDown,
  CreditCard,
  X,
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/context/AuthContext';
import { useMobileNav } from '@/components/MobileNavContext';
import api from '@/lib/api';

export default function Sidebar() {
  useRequireAuth();
  const pathname = usePathname();
  const { user, logout, appMode } = useAuth();
  const { isOpen, close } = useMobileNav();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [subGroups, setSubGroups] = useState<any[]>([]);
  const [subFolders, setSubFolders] = useState<any[]>([]);

  useEffect(() => {
    const storedState = localStorage.getItem('clickrypt_sidebar_collapsed');
    if (storedState !== null) {
      setIsCollapsed(storedState === 'true');
    }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isMobile && isOpen) close();
  }, [isMobile, isOpen, close]);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (appMode === 'personal') return;
    const load = async () => {
      try {
        const [groupsRes, foldersRes] = await Promise.all([
          api.get('/groups'),
          api.get('/folders', {
            params: { secretVault: false, ...(user?.role === 'Owner' || user?.role === 'Admin' ? { scope: 'manage' } : {}) },
          }),
        ]);
        setSubGroups(groupsRes.data || []);
        setSubFolders(foldersRes.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [appMode, user?.role]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      localStorage.setItem('clickrypt_sidebar_collapsed', String(nextState));
      return nextState;
    });
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isDesktopCollapsed = !isMobile && isCollapsed;

  const menuItems = [
    { name: 'Passwords', path: '/vault', icon: KeyRound },
    { name: 'Card Vault', path: '/secret-vault', icon: CreditCard, badge: 'Cards', role: 'Owner' },
    { name: 'Groups', path: '/groups', icon: Users, role: 'OrganizationOnly', hasSubmenu: true },
    { name: 'Folders', path: '/folders', icon: Folder, hasSubmenu: true },
    { name: 'Shared Passwords', path: '/shared', icon: Share2 },
    { name: 'Team Members', path: '/admin', icon: UserCheck, role: 'OrganizationOnly' },
    { name: 'Import / Export', path: '/import-export', icon: FileSpreadsheet },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const renderSubmenu = (key: string) => {
    const items = key === 'Groups' ? subGroups : subFolders;
    const Icon = key === 'Groups' ? Users : Folder;
    return (
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isDesktopCollapsed ? 'max-h-0' : 'max-h-[200px] overflow-y-auto'
        }`}
      >
        <div className="pl-3.5 pr-1.5 py-1 space-y-1">
          {items.length === 0 ? (
            <p className="px-3 py-1.5 text-[10px] text-[#64748b] font-medium truncate">No {key.toLowerCase()} available</p>
          ) : (
            items.map((it: any) => (
              <div
                key={it.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold text-[#475569] hover:bg-[#d8e2ec] hover:text-[#0f172a] cursor-pointer truncate"
                title={it.name}
              >
                <Icon className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
                <span className="truncate">{it.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#091528]/40"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        suppressHydrationWarning
        aria-hidden={isMobile ? !isOpen : false}
        className={`bg-[#e4ecf3] border-r border-[#cbd5e1] flex flex-col justify-between p-3.5 select-none font-sora h-screen overflow-hidden transition-all duration-300 ease-in-out shrink-0 ${
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `relative ${isCollapsed ? 'w-20' : 'w-64'}`
        }`}
      >
        <div className="space-y-6 overflow-hidden">
          <div className={`flex items-center justify-between px-1 py-1 ${
            isDesktopCollapsed ? 'md:justify-center md:flex-col md:gap-3' : ''
          }`}>
            <img
              src="/logo.png"
              alt="Clickrypt Logo"
              className={`object-contain drop-shadow-md transition-all duration-300 ease-in-out h-14 w-auto max-w-[150px] ${
                isDesktopCollapsed ? 'md:h-9 md:w-9' : ''
              }`}
            />

            <button
              type="button"
              onClick={toggleCollapse}
              className="hidden md:flex w-8 h-8 rounded-xl bg-[#0284c7]/10 hover:bg-[#0284c7]/20 border border-[#0284c7]/30 text-[#0284c7] items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95 shrink-0"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <ChevronLeft
                className={`w-4.5 h-4.5 text-[#0284c7] transition-transform duration-300 ease-in-out ${
                  isCollapsed ? 'rotate-180' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={close}
              className="md:hidden w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Close menu"
            >
              <X className="w-5 h-5 text-rose-600" />
            </button>
          </div>

          <nav className="space-y-1.5 overflow-y-auto overflow-x-hidden">
            {menuItems.map((item) => {
              if (item.role === 'OrganizationOnly' && appMode === 'personal') {
                return null;
              }
              if (user?.role === 'External' && item.path !== '/shared' && item.path !== '/settings') {
                return null;
              }
              if (item.role === 'Owner' && user?.role !== 'Owner') {
                return null;
              }
              if (item.role === 'AdminOrOwner' && user?.role !== 'Owner' && user?.role !== 'Admin') {
                return null;
              }

              const Icon = item.icon;
              const isActive = pathname === item.path;
              const isExpanded = !!expanded[item.name];

              return (
                <div key={item.path}>
                  <div
                    className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 overflow-hidden ${
                      isDesktopCollapsed ? 'md:justify-center md:p-3' : ''
                    } ${
                      isActive
                        ? 'bg-[#f5f8fb] text-[#0f172a] shadow-md border border-[#d0dbe5] shadow-[#1fbbd2]/10'
                        : 'text-[#475569] hover:text-[#0f172a] hover:bg-[#d8e2ec]'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-[#1fbbd2] rounded-r-full" />
                    )}

                    <Link
                      href={item.path}
                      title={isDesktopCollapsed ? item.name : undefined}
                      className={`flex items-center gap-3 pl-1 min-w-0 ${isDesktopCollapsed ? '' : 'flex-1'}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1fbbd2]' : 'text-[#64748b]'}`} />
                      <span
                        className={`transition-all duration-300 ease-in-out whitespace-nowrap truncate max-w-[140px] opacity-100 ${
                          isDesktopCollapsed ? 'md:max-w-0 md:opacity-0 md:pointer-events-none' : ''
                        }`}
                      >
                        {item.name}
                      </span>
                    </Link>

                    {!isDesktopCollapsed && item.badge && (
                      <span
                        className="bg-[#f39c12]/15 text-[#d97706] text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-[#f39c12]/30 shrink-0"
                      >
                        {item.badge}
                      </span>
                    )}

                    {!isDesktopCollapsed && item.hasSubmenu && appMode !== 'personal' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleExpand(item.name);
                        }}
                        className="p-1 text-[#64748b] hover:text-[#0f172a] transition-colors shrink-0"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {!isDesktopCollapsed && item.hasSubmenu && isExpanded && appMode !== 'personal' && renderSubmenu(item.name)}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-[#cbd5e1]">
          <button
            type="button"
            onClick={logout}
            className={`w-full py-2 px-3 justify-center gap-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-xl text-rose-700 text-xs font-extrabold flex items-center transition-all cursor-pointer shadow-xs overflow-hidden ${
              isDesktopCollapsed ? 'md:px-0 md:gap-0' : ''
            }`}
            title="Sign Out of Account"
          >
            <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
            <span
              className={`transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden max-w-[100px] opacity-100 ${
                isDesktopCollapsed ? 'md:max-w-0 md:opacity-0 md:pointer-events-none' : ''
              }`}
            >
              Log Out
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
