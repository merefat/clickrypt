'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Lock,
  KeyRound,
  Shield,
  Users,
  Folder,
  Share2,
  FileSpreadsheet,
  Settings,
  LogOut,
  UserCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const menuItems = [
    { name: 'Passwords', path: '/vault', icon: KeyRound },
    { name: 'Secret Vault', path: '/secret-vault', icon: Lock, badge: 'Private' },
    { name: 'Groups', path: '/groups', icon: Users },
    { name: 'Folders', path: '/folders', icon: Folder },
    { name: 'Shared with me', path: '/shared', icon: Share2 },
    { name: 'Team Members', path: '/admin', icon: UserCheck, role: 'Owner' },
    { name: 'Import / Export', path: '/import-export', icon: FileSpreadsheet },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#e4ecf3] border-r border-[#cbd5e1] flex flex-col justify-between p-5 select-none font-sora min-h-screen">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-start px-1 py-1">
          <img src="/logo.png" alt="Clickrypt Logo" className="h-24 w-full max-w-[210px] object-contain drop-shadow-md" />
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {menuItems.map((item) => {
            if (item.role && user?.role !== 'Owner' && user?.role !== 'Admin') {
              return null;
            }

            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
                  isActive
                    ? 'bg-[#f5f8fb] text-[#0f172a] shadow-md border border-[#d0dbe5] shadow-[#1fbbd2]/10'
                    : 'text-[#475569] hover:text-[#0f172a] hover:bg-[#d8e2ec]'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-[#1fbbd2] rounded-r-full" />
                )}

                <div className="flex items-center gap-3 pl-1">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#1fbbd2]' : 'text-[#64748b]'}`} />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span className="bg-[#f39c12]/15 text-[#d97706] text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-[#f39c12]/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="pt-4 border-t border-[#cbd5e1] space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-xs font-extrabold text-[#0f172a]">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            <div>
              <p className="text-xs font-bold text-[#0f172a] leading-tight">{user?.name || 'Alex Morgan'}</p>
              <p className="text-[10px] text-[#1fbbd2] font-extrabold leading-tight">{user?.role || 'Owner'}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
