'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  Key,
  Lock,
  Users,
  Folder,
  Share2,
  Import,
  Settings,
  Building2,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  const navItems = [
    { name: 'Passwords', path: '/vault', icon: Key },
    { name: 'Secret Vault', path: '/secret-vault', icon: Lock, badge: 'Private' },
    { name: 'Groups', path: '/groups', icon: Users },
    { name: 'Folders', path: '/folders', icon: Folder },
    { name: 'Shared with me', path: '/shared', icon: Share2 },
    { name: 'Team Members', path: '/admin', icon: Building2 },
    { name: 'Import / Export', path: '/import-export', icon: Import },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#17283b] border-r border-[rgba(31,187,210,0.2)] flex flex-col justify-between p-4 h-screen sticky top-0 select-none z-40 font-sora">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center shadow-lg shadow-[#f39c12]/20">
            <Shield className="w-6 h-6 text-[#0d1724]" />
          </div>
          <div>
            <span className="text-lg font-extrabold text-white tracking-tight glow-gold">Clickrypt</span>
            <p className="text-[10px] text-[#1fbbd2] font-semibold">Zero-Knowledge OpenPGP</p>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#f39c12]/20 to-[#1fbbd2]/20 border border-[#f39c12]/40 text-white shadow-md'
                    : 'text-gray-300 hover:bg-[#0d1724]/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#f39c12]' : 'text-gray-400'}`} />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] bg-[#f39c12]/20 text-[#f39c12] border border-[#f39c12]/40 px-2 py-0.5 rounded font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Footer Profile & Logout */}
      <div className="pt-4 border-t border-gray-700/60 space-y-2">
        <div className="flex items-center justify-between p-2 rounded-xl bg-[#0d1724]/80 border border-gray-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center font-bold text-xs text-[#0d1724]">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            <div className="truncate max-w-[110px]">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Alex Morgan'}</p>
              <p className="text-[10px] text-[#1fbbd2] truncate">{user?.email || 'alex@acme.com'}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-gray-800 rounded-lg transition-all"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
