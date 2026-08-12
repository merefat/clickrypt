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
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2] shadow">
                <Share2 className="w-5 h-5 text-[#1fbbd2]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Shared with Me</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Passwords and secrets shared with your OpenPGP public key by team members.
                </p>
              </div>
            </div>

            <button
              onClick={fetchSharedResources}
              className="p-2.5 bg-[#17283b] hover:bg-[#1e2638] border border-[rgba(31,187,210,0.3)] rounded-xl text-gray-300 transition-all shadow"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="glass-panel rounded-2xl border border-[rgba(31,187,210,0.25)] overflow-hidden shadow-2xl bg-[#17283b]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d1724]/90 text-gray-300 font-bold uppercase tracking-wider border-b border-gray-700">
                  <tr>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4">Shared By</th>
                    <th className="py-3.5 px-4">Permissions</th>
                    <th className="py-3.5 px-4">Last Modified</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-700/60">
                  {resources.map((res) => (
                    <tr key={res.id} className="hover:bg-[#0d1724]/60 transition-all border-b border-gray-700/40">
                      <td className="py-4 px-6 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span>{res.name}</span>
                          {res.isExternalShared && (
                            <span
                              className="p-1 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-400 inline-flex items-center justify-center shadow"
                              title="Shared externally with a non-application member"
                            >
                              <Globe className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-300">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-[#f39c12]" />
                          <span>Alex Morgan</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-[#0d1724] text-[#1fbbd2] border border-[#1fbbd2]/30 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                          Decrypt & View
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-400">{res.lastModified}</td>
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
