'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Share2, RefreshCw, Eye, EyeOff, Copy, User, Globe } from 'lucide-react';
import api from '@/lib/api';

export default function SharedPage() {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSharedResources();
  }, []);

  const fetchSharedResources = async () => {
    setLoading(true);
    try {
      const res = await api.get('/resources', { params: { search: '' } });
      // Filter items shared with team members
      setResources(res.data.filter((r: any) => r.secrets && r.secrets.length > 1));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm">
                <Share2 className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Shared with Me</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Passwords and secrets shared with your OpenPGP public key by team members.
                </p>
              </div>
            </div>

            <button
              onClick={fetchSharedResources}
              className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl text-[#475569] transition-all shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                  <tr>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4">Shared By</th>
                    <th className="py-3.5 px-4">Permissions</th>
                    <th className="py-3.5 px-4">Last Modified</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#e2e8f0]">
                  {resources.map((res) => (
                    <tr key={res.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                      <td className="py-4 px-6 font-bold text-[#0f172a]">
                        <div className="flex items-center gap-2">
                          <span>{res.name}</span>
                          {res.isExternalShared && (
                            <span
                              className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm"
                              title="Shared externally with a non-application member"
                            >
                              <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-[#334155]">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-[#d97706]" />
                          <span>Alex Morgan</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 px-2 py-0.5 rounded-full font-extrabold text-[10px]">
                          Decrypt & View
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[#64748b]">{res.lastModified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
