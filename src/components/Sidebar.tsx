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
  ChevronLeft
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/context/AuthContext';

export default function Sidebar() {
  useRequireAuth();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const storedState = localStorage.getItem('clickrypt_sidebar_collapsed');
    if (storedState !== null) {
      setIsCollapsed(storedState === 'true');
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      localStorage.setItem('clickrypt_sidebar_collapsed', String(nextState));
      return nextState;
    });
  };

  const [appMode, setAppMode] = useState<'personal' | 'organization'>('personal');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedMode = (localStorage.getItem('clickrypt_app_mode') as any) || 'personal';
      setAppMode(storedMode);
    }
  }, []);

  const menuItems = [
    { name: 'Passwords', path: '/vault', icon: KeyRound },
    { name: 'Secret Vault', path: '/secret-vault', icon: Lock, badge: 'Private', role: 'Owner' },
    { name: 'Groups', path: '/groups', icon: Users, role: 'OrganizationOnly' },
    { name: 'Folders', path: '/folders', icon: Folder },
    { name: appMode === 'organization' ? 'Shared with me' : 'Shared by me', path: '/shared', icon: Share2 },
    { name: 'Team Members', path: '/admin', icon: UserCheck, role: 'OrganizationOnly' },
    { name: 'Import / Export', path: '/import-export', icon: FileSpreadsheet },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside
      suppressHydrationWarning
      className={`bg-[#e4ecf3] border-r border-[#cbd5e1] flex flex-col justify-between p-3.5 select-none font-sora min-h-screen transition-[width] duration-300 ease-in-out shrink-0 overflow-hidden ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="space-y-6">
        {/* Brand Header with Vibrant Cyan Collapse Toggle Button */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-3' : 'justify-between'} px-1 py-1`}>
          <img
            src="/logo.png"
            alt="Clickrypt Logo"
            className={`object-contain drop-shadow-md transition-all duration-300 ease-in-out ${
              isCollapsed ? 'h-9 w-9' : 'h-14 w-auto max-w-[150px]'
            }`}
          />

          <button
            type="button"
            onClick={toggleCollapse}
            className="w-8 h-8 rounded-xl bg-[#0284c7]/10 hover:bg-[#0284c7]/20 border border-[#0284c7]/30 text-[#0284c7] flex items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95 shrink-0"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <ChevronLeft
              className={`w-4.5 h-4.5 text-[#0284c7] transition-transform duration-300 ease-in-out ${
                isCollapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
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

            return (
              <Link
                key={item.path}
                href={item.path}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5'
                } rounded-xl text-xs font-bold transition-all duration-200 relative overflow-hidden ${
                  isActive
                    ? 'bg-[#f5f8fb] text-[#0f172a] shadow-md border border-[#d0dbe5] shadow-[#1fbbd2]/10'
                    : 'text-[#475569] hover:text-[#0f172a] hover:bg-[#d8e2ec]'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-[#1fbbd2] rounded-r-full" />
                )}

                <div className="flex items-center gap-3 pl-1 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1fbbd2]' : 'text-[#64748b]'}`} />
                  <span
                    className={`transition-all duration-300 ease-in-out whitespace-nowrap truncate ${
                      isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100'
                    }`}
                  >
                    {item.name}
                  </span>
                </div>

                {item.badge && (
                  <span
                    className={`bg-[#f39c12]/15 text-[#d97706] text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-[#f39c12]/30 shrink-0 transition-all duration-300 ease-in-out ${
                      isCollapsed ? 'max-w-0 opacity-0 pointer-events-none px-0 border-0' : 'max-w-[60px] opacity-100'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="pt-4 border-t border-[#cbd5e1] space-y-2.5">
        <Link
          href="/settings"
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} p-2 rounded-xl hover:bg-[#d8e2ec] transition-all cursor-pointer group overflow-hidden`}
          title={user?.name || user?.email?.split('@')[0] || 'User'}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-xs font-extrabold text-[#0f172a] group-hover:scale-105 transition-transform shadow-xs overflow-hidden shrink-0">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : user?.name ? (
              user.name.slice(0, 2).toUpperCase()
            ) : user?.email ? (
              user.email.slice(0, 2).toUpperCase()
            ) : (
              'RE'
            )}
          </div>

          <div
            className={`transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden ${
              isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100'
            }`}
          >
            <p className="text-xs font-extrabold text-[#0f172a] group-hover:text-[#0284c7] leading-tight transition-colors truncate">
              {user?.name || user?.email?.split('@')[0] || 'Refat'}
            </p>
            <p className="text-[10px] text-[#0284c7] font-extrabold leading-tight truncate">
              {user?.role || 'Owner'}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={logout}
          className={`w-full py-2 ${
            isCollapsed ? 'px-0 justify-center' : 'px-3 justify-center gap-2'
          } bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-xl text-rose-700 text-xs font-extrabold flex items-center transition-all cursor-pointer shadow-xs overflow-hidden`}
          title="Sign Out of Account"
        >
          <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
          <span
            className={`transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden ${
              isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[100px] opacity-100'
            }`}
          >
            Log Out
          </span>
        </button>
      </div>
    </aside>
  );
}
