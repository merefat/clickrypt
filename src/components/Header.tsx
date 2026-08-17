'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Bell,
  Shield,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  X,
  Check,
  ExternalLink,
  Share2,
  Clock,
  KeyRound,
  Folder,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface HeaderProps {
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

interface VaultNotification {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'leak' | 'outdated' | 'shared';
  unread: boolean;
  actionUrl: string;
  actionText: string;
}

export default function Header({ searchTerm = '', onSearchChange }: HeaderProps) {
  const { user, logout } = useAuth();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [subscription, setSubscription] = useState<any | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Notifications state strictly constrained to the 3 user-requested categories:
  // 1. Leaked / Compromised Passwords
  // 2. Passwords older than 6 months
  // 3. Shared passwords or folders with other people
  const [notifications, setNotifications] = useState<VaultNotification[]>([
    {
      id: 'notif-leak-1',
      title: '🚨 Leaked Password Detected!',
      desc: 'Master credential for "AWS Production API Key" was found in a recent public data breach database. Change this password immediately.',
      time: 'Just now',
      type: 'leak',
      unread: true,
      actionUrl: '/vault',
      actionText: 'Change Leaked Password',
    },
    {
      id: 'notif-old-1',
      title: '⏳ Outdated Password Alert (>6 Months)',
      desc: 'Your master password for "Corporate Email Portal" was last updated 7 months ago (Jan 12, 2025). Please rotate it for optimal security.',
      time: '2h ago',
      type: 'outdated',
      unread: true,
      actionUrl: '/vault',
      actionText: 'Rotate Outdated Password',
    },
    {
      id: 'notif-share-1',
      title: '🔗 Secret & Folder Shared Alert',
      desc: 'Folder "Engineering Credentials" and secret "Production DB Secret" were shared with Sarah Johnson & Mark Wilson via OpenPGP.',
      time: '1d ago',
      type: 'shared',
      unread: true,
      actionUrl: '/shared',
      actionText: 'Manage Shared Access',
    },
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    fetchSubscription();
    evaluateRealVaultNotifications();
  }, []);

  // Listen for outside clicks to auto-close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/subscription');
      setSubscription(res.data);

      const isWarning = res.data?.status === 'Warning' || res.data?.daysRemaining <= 30;
      const noticeCount = Number(sessionStorage.getItem('clickrypt_notice_count') || 0);

      if (isWarning && noticeCount < 3) {
        setShowBanner(true);
        sessionStorage.setItem('clickrypt_notice_count', (noticeCount + 1).toString());

        const timer = setTimeout(() => {
          setShowBanner(false);
        }, 7000);

        return () => clearTimeout(timer);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const evaluateRealVaultNotifications = async () => {
    try {
      const [resResources, resFolders] = await Promise.all([
        api.get('/resources').catch(() => ({ data: [] })),
        api.get('/folders').catch(() => ({ data: [] })),
      ]);

      const resources: any[] = resResources.data || [];
      const folders: any[] = resFolders.data || [];
      const dynamicNotifs: VaultNotification[] = [];

      // 1. Check for Leaked / Compromised Passwords
      const leakedItems = resources.filter((r) => r.isPwned || r.isCompromised);
      if (leakedItems.length > 0) {
        dynamicNotifs.push({
          id: 'dyn-leak',
          title: `🚨 ${leakedItems.length} Leaked Password(s) Found!`,
          desc: `Secrets such as "${leakedItems[0].name}" were detected in known data breaches. Update them now.`,
          time: 'Active Alert',
          type: 'leak',
          unread: true,
          actionUrl: '/vault',
          actionText: 'Fix Compromised Secrets',
        });
      }

      // 2. Check for Passwords older than 6 months (180 days)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const oldItems = resources.filter((r) => {
        if (!r.lastModified) return false;
        const modDate = new Date(r.lastModified);
        return modDate < sixMonthsAgo;
      });

      if (oldItems.length > 0) {
        dynamicNotifs.push({
          id: 'dyn-old',
          title: `⏳ ${oldItems.length} Password(s) Older Than 6 Months`,
          desc: `Vault item "${oldItems[0].name}" has not been updated in over 6 months. Rotate your passwords regularly.`,
          time: 'Active Alert',
          type: 'outdated',
          unread: true,
          actionUrl: '/vault',
          actionText: 'Rotate Old Passwords',
        });
      }

      // 3. Check for Shared Folders / Passwords
      const sharedItems = resources.filter((r) => r.isExternalShared || (r.secrets && r.secrets.length > 1));
      const sharedFolders = folders.filter((f) => f.isShared || f.groupCount > 0);

      if (sharedItems.length > 0 || sharedFolders.length > 0) {
        dynamicNotifs.push({
          id: 'dyn-share',
          title: '🔗 Active Shared Folders & Passwords',
          desc: `${sharedItems.length} secret(s) and ${sharedFolders.length} folder(s) are actively shared with team members.`,
          time: 'Active Sharing',
          type: 'shared',
          unread: dynamicNotifs.length === 0,
          actionUrl: '/shared',
          actionText: 'Review Shared Access',
        });
      }

      if (dynamicNotifs.length > 0) {
        setNotifications(dynamicNotifs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDismissManual = () => {
    setShowBanner(false);
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <header className="sticky top-0 z-30 bg-[#f5f8fb]/95 backdrop-blur-md border-b border-[#cbd5e1] px-8 py-3.5 flex flex-col gap-2 font-sora">
      {/* Dynamic 7-Second Auto-Dismissing Renewal Notice Banner */}
      {showBanner && subscription && (
        <div className="bg-gradient-to-r from-[#fff7ed] via-[#ffedd5] to-[#fff7ed] border border-[#f39c12] rounded-xl px-4 py-2 flex items-center justify-between text-xs text-[#c2410c] shadow-lg animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 animate-bounce" />
            <span>
              <strong className="text-[#9a3412]">Subscription Renewal Notice:</strong> Your credit is almost finished ({subscription.daysRemaining} days left until {subscription.renewalDate}). Renew now to prevent vault lock out.
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/pay"
              className="px-3 py-1 gold-gradient-btn text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow"
            >
              <span>Renew via Stripe</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <button
              onClick={handleDismissManual}
              className="p-1 text-gray-500 hover:text-black rounded-lg transition-all"
              title="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="flex items-center justify-between">
        {/* Search Input */}
        <div className="relative w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search passwords, resources, tags..."
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-10 py-2 text-xs text-[#0f172a] placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-sm transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#f1f5f9] text-gray-500 text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-300">
            ⌘K
          </kbd>
        </div>

        {/* Status Indicators & Profile */}
        <div className="flex items-center gap-3">
          {/* Interactive Bell Notification Button & Popover Container */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowNotifications((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-[#ffffff] border border-[#cbd5e1] hover:border-[#1fbbd2] flex items-center justify-center text-[#0f172a] shadow-sm transition-all relative cursor-pointer"
              title="Vault Notifications"
            >
              <Bell className="w-4 h-4 text-[#d97706]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f39c12] text-white text-[9px] font-extrabold flex items-center justify-center shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Floating Notifications Popover Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                {/* Popover Header */}
                <div className="p-4 bg-[#f8fafc] border-b border-[#cbd5e1] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#d97706]" />
                    <h3 className="text-xs font-extrabold text-[#0f172a]">Security & Vault Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="bg-[#f39c12] text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                        {unreadCount} New
                      </span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] text-[#0284c7] hover:underline font-extrabold"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notifications List strictly containing 3 categories */}
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#64748b]">
                      No active security or sharing notifications.
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 transition-all hover:bg-[#f1f5f9] ${
                          notif.unread
                            ? notif.type === 'leak'
                              ? 'bg-rose-50/70 border-l-3 border-l-rose-500'
                              : notif.type === 'outdated'
                              ? 'bg-[#fffbeb] border-l-3 border-l-[#f39c12]'
                              : 'bg-[#e0f2fe]/40 border-l-3 border-l-[#1fbbd2]'
                            : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {notif.type === 'leak' && <ShieldAlert className="w-4.5 h-4.5 text-rose-600 shrink-0" />}
                            {notif.type === 'outdated' && <Clock className="w-4.5 h-4.5 text-[#d97706] shrink-0" />}
                            {notif.type === 'shared' && <Share2 className="w-4.5 h-4.5 text-[#0284c7] shrink-0" />}
                            <h4 className="text-xs font-extrabold text-[#0f172a]">{notif.title}</h4>
                          </div>
                          <span className="text-[10px] text-[#64748b] font-medium shrink-0">{notif.time}</span>
                        </div>

                        <p className="text-[11px] text-[#334155] mt-1 pl-6 leading-relaxed font-medium">
                          {notif.desc}
                        </p>

                        {notif.actionUrl && (
                          <div className="pl-6 mt-2">
                            <Link
                              href={notif.actionUrl}
                              onClick={() => setShowNotifications(false)}
                              className={`inline-flex items-center gap-1 text-[11px] font-extrabold transition-colors ${
                                notif.type === 'leak'
                                  ? 'text-rose-700 hover:text-rose-900'
                                  : notif.type === 'outdated'
                                  ? 'text-[#d97706] hover:text-[#b45309]'
                                  : 'text-[#0284c7] hover:text-[#0369a1]'
                              }`}
                            >
                              <span>{notif.actionText}</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Popover Footer */}
                <div className="p-3 bg-[#f8fafc] border-t border-[#cbd5e1] text-center">
                  <Link
                    href="/admin"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs text-[#0284c7] font-extrabold hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>View Audit Logs & System Health</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-[#cbd5e1]" />

          <Link
            href="/settings"
            className="flex items-center gap-3 hover:opacity-90 transition-all cursor-pointer p-1.5 rounded-xl hover:bg-[#ffffff] border border-transparent hover:border-[#cbd5e1] shadow-xs group"
            title="Account & Security Settings"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover shadow-sm border border-[#1fbbd2] group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white p-0.5 border border-[#cbd5e1] flex items-center justify-center shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
                <img src="/logo.png" alt="Clickrypt Logo" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="text-left hidden sm:block">
              <p className="text-xs font-extrabold text-[#0f172a] leading-tight group-hover:text-[#0284c7] transition-colors">
                {user?.name || 'Alex Morgan'}
              </p>
              <p className="text-[10px] text-[#0284c7] font-extrabold leading-tight">{user?.role || 'Owner'}</p>
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
