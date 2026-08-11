'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Bell, Shield, AlertTriangle, ArrowRight, X, Database } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface HeaderProps {
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

export default function Header({ searchTerm = '', onSearchChange }: HeaderProps) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<any | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    fetchSubscription();
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

  return (
    <header className="sticky top-0 z-30 bg-[#17283b]/95 backdrop-blur-md border-b border-[rgba(31,187,210,0.2)] px-8 py-3.5 flex flex-col gap-2 font-sora">
      {/* Dynamic 7-Second Auto-Dismissing Renewal Notice Banner */}
      {showBanner && subscription && (
        <div className="bg-gradient-to-r from-[#17283b] via-[#2c1d11] to-[#17283b] border border-[#f39c12]/60 rounded-xl px-4 py-2 flex items-center justify-between text-xs text-[#f39c12] shadow-lg animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#f39c12] shrink-0 animate-bounce" />
            <span>
              <strong className="text-white">Subscription Renewal Notice:</strong> Your credit is almost finished ({subscription.daysRemaining} days left until {subscription.renewalDate}). Renew now to prevent vault lock out.
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
              className="p-1 text-gray-400 hover:text-white rounded-lg transition-all"
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
            className="w-full bg-[#0d1724] border border-[rgba(31,187,210,0.25)] rounded-xl pl-10 pr-10 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#1fbbd2] transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#17283b] text-gray-400 text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-700">
            ⌘K
          </kbd>
        </div>

        {/* Status Indicators & Profile */}
        <div className="flex items-center gap-3">
          {/* Supabase Status Indicator */}
          <div className="flex items-center gap-1.5 bg-[#0d1724] border border-[#f39c12]/40 px-3 py-1.5 rounded-full text-xs text-[#f39c12] font-semibold">
            <Database className="w-3.5 h-3.5 text-[#f39c12]" />
            <span>Supabase Connected</span>
          </div>

          {/* OpenPGP Vault Indicator */}
          <div className="flex items-center gap-2 bg-[#0d1724] border border-[rgba(31,187,210,0.3)] px-3 py-1.5 rounded-full text-xs text-[#1fbbd2] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#1fbbd2] glow-cyan" />
            <span>OpenPGP Vault Ready</span>
          </div>

          <button className="p-2 text-gray-400 hover:text-white relative bg-[#0d1724] border border-gray-700 rounded-xl transition-all">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f39c12] rounded-full" />
          </button>

          <div className="h-6 w-px bg-gray-700" />

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-xs font-bold text-[#0d1724] shadow-md">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-white leading-tight">{user?.name || 'Alex Morgan'}</p>
              <p className="text-[10px] text-[#f39c12] font-semibold leading-tight">{user?.role || 'Owner'}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
