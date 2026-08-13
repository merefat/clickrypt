'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Bell, Shield, AlertTriangle, ArrowRight, X, Database, Check, ExternalLink, Lock, Share2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface HeaderProps {
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

export default function Header({ searchTerm = '', onSearchChange }: HeaderProps) {
  const { user } = useAuth();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [subscription, setSubscription] = useState<any | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);

  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      title: 'Subscription Renewal Notice',
      desc: 'Your credit is almost finished (3 days left). Renew now to prevent vault lock out.',
      time: '10m ago',
      type: 'warning',
      unread: true,
      actionUrl: '/pay',
      actionText: 'Renew via Stripe',
    },
    {
      id: 'notif-2',
      title: 'Secret Shared with You',
      desc: 'Alex Morgan shared GitHub developer credentials with your OpenPGP public key.',
      time: '1h ago',
      type: 'share',
      unread: true,
      actionUrl: '/shared',
      actionText: 'View Shared Secret',
    },
    {
      id: 'notif-3',
      title: 'Supabase PostgreSQL Cloud Connected',
      desc: 'Real-time database sync active with project wnhqpfcahtelehdxnwod.supabase.co.',
      time: '3h ago',
      type: 'supabase',
      unread: true,
    },
    {
      id: 'notif-4',
      title: 'OpenPGP Keyring Verified',
      desc: 'Client-side RSA 2048-bit keypair generated and stored securely in IndexedDB.',
      time: '5h ago',
      type: 'security',
      unread: false,
    },
  ]);

  useEffect(() => {
    fetchSubscription();
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

  const handleDismissManual = () => {
    setShowBanner(false);
  };

  const handleMarkAllAsRead = () => {
    setUnreadCount(0);
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
              className="p-2 text-gray-600 hover:text-black relative bg-[#ffffff] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl transition-all shadow-sm cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#f39c12] rounded-full animate-pulse" />
              )}
            </button>

            {/* Floating Notifications Popover Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                {/* Popover Header */}
                <div className="p-4 bg-[#f8fafc] border-b border-[#cbd5e1] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#d97706]" />
                    <h3 className="text-xs font-extrabold text-[#0f172a]">Vault Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="bg-[#f39c12]/20 text-[#d97706] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#f39c12]/30">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] text-[#0284c7] hover:underline font-bold"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 transition-all hover:bg-[#f1f5f9] ${
                        notif.unread ? 'bg-[#fffbeb] border-l-2 border-l-[#f39c12]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {notif.type === 'warning' && <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0" />}
                          {notif.type === 'share' && <Share2 className="w-4 h-4 text-[#0284c7] shrink-0" />}
                          {notif.type === 'supabase' && <Database className="w-4 h-4 text-[#d97706] shrink-0" />}
                          {notif.type === 'security' && <Shield className="w-4 h-4 text-[#0284c7] shrink-0" />}
                          <h4 className="text-xs font-bold text-[#0f172a]">{notif.title}</h4>
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{notif.time}</span>
                      </div>

                      <p className="text-[11px] text-gray-600 mt-1 pl-6 leading-relaxed">
                        {notif.desc}
                      </p>

                      {notif.actionUrl && (
                        <div className="pl-6 mt-2">
                          <Link
                            href={notif.actionUrl}
                            onClick={() => setShowNotifications(false)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#d97706] hover:text-[#b45309] transition-colors"
                          >
                            <span>{notif.actionText}</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Popover Footer */}
                <div className="p-3 bg-[#f8fafc] border-t border-[#cbd5e1] text-center">
                  <Link
                    href="/admin"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs text-[#0284c7] font-bold hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>View All Security Audit Logs</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-[#cbd5e1]" />

          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover shadow-sm border border-[#1fbbd2]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-xs font-extrabold text-[#0f172a] shadow-sm border border-[#1fbbd2]">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
              </div>
            )}
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-[#0f172a] leading-tight">{user?.name || 'Alex Morgan'}</p>
              <p className="text-[10px] text-[#1fbbd2] font-extrabold leading-tight">{user?.role || 'Owner'}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
