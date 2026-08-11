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
  CreditCard,
  Building,
  LogOut,
  UserCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const menuItems = [
    { name: 'Passwords', path: '/vault', icon: KeyRound },
    { name: 'Secret Vault', path: '/secret-vault', icon: Lock, badge: 'Private', role: 'OwnerOnly' },
    { name: 'Groups', path: '/groups', icon: Users },
    { name: 'Folders', path: '/folders', icon: Folder },
    { name: 'Shared with me', path: '/shared', icon: Share2 },
    { name: 'Team Members', path: '/admin', icon: UserCheck, role: 'AdminOrOwner' },
    { name: 'Import / Export', path: '/import-export', icon: FileSpreadsheet },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#17283b] border-r border-[rgba(31,187,210,0.2)] flex flex-col justify-between p-5 select-none font-sora min-h-screen">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center shadow-lg text-[#0d1724]">
            <Shield className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="font-extrabold text-lg text-white tracking-wide block leading-none">
              Clickrypt
            </span>
            <span className="text-[10px] text-[#1fbbd2] font-semibold tracking-wider uppercase leading-none mt-1 block">
              Zero-Knowledge OpenPGP
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            if (item.role === 'OwnerOnly' && user?.role !== 'Owner') {
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
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#0d1724] text-white border border-[#f39c12] shadow-md'
                    : 'text-gray-300 hover:text-white hover:bg-[#0d1724]/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#f39c12]' : 'text-gray-400'}`} />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span className="bg-[#f39c12]/20 text-[#f39c12] text-[10px] font-bold px-2 py-0.5 rounded-md border border-[#f39c12]/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="pt-4 border-t border-gray-700/60 space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-xs font-bold text-[#0d1724]">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-tight">{user?.name || 'Alex Morgan'}</p>
              <p className="text-[10px] text-[#f39c12] font-semibold leading-tight">{user?.role || 'Owner'}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-rose-400 hover:bg-[#0d1724] rounded-lg transition-all"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
