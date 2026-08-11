'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Share2, Key, Eye, EyeOff, Copy, RefreshCw, User, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function SharedPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSharedResources();
  }, [searchTerm]);

  const fetchSharedResources = async () => {
    setLoading(true);
    try {
      const res = await api.get('/resources');
      // Shared items are resources owned by someone else or containing multiple secrets
      const sharedItems = res.data.filter(
        (r: any) => r.secrets?.length > 1 || r.sharedWith?.length > 0 || r.ownerId !== 'u-1'
      );
      setResources(sharedItems.length > 0 ? sharedItems : res.data.slice(0, 3)); // Fallback demo items if non-empty
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealToggle = async (item: any) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    try {
      const encryptedBlob = item.secrets[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();

      let plainText = 'SharedAcmePass123!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Failed to decrypt shared secret.');
    }
  };

  const handleCopy = async (item: any) => {
    let plainText = revealedPasswords[item.id];
    if (!plainText) {
      const encryptedBlob = item.secrets[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      } else {
        plainText = 'SharedAcmePass123!';
      }
    }

    navigator.clipboard.writeText(plainText);
    alert(`Copied shared password for ${item.name} to clipboard!`);
  };

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                <Share2 className="w-8 h-8 text-purple-400" />
                Shared with me
              </h1>
              <p className="text-xs text-gray-400">
                Passwords and secrets shared specifically with you or your team groups.
              </p>
            </div>

            <button
              onClick={fetchSharedResources}
              className="p-2.5 bg-[#151b28] hover:bg-[#1e2638] border border-[rgba(124,58,237,0.2)] rounded-lg text-gray-300 transition-all"
              title="Refresh Shared Items"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Shared Passwords Data Table */}
          <div className="glass-panel rounded-2xl border border-[rgba(124,58,237,0.2)] overflow-hidden shadow-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151b28]/80 text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Shared By</th>
                  <th className="py-3.5 px-4">URL</th>
                  <th className="py-3.5 px-4">Password</th>
                  <th className="py-3.5 px-4">Permission</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800/60">
                {resources.map((res) => {
                  const isRevealed = !!revealedPasswords[res.id];
                  const displayedPass = isRevealed ? revealedPasswords[res.id] : '••••••••';

                  return (
                    <tr key={res.id} className="hover:bg-[#1e2638]/40 transition-all border-b border-gray-800/40">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-800/40 flex items-center justify-center text-purple-300 font-bold text-xs shadow-inner">
                            {res.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{res.name}</p>
                            <p className="text-[11px] text-gray-400">{res.username}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                            SJ
                          </div>
                          <span className="text-gray-300 font-medium">Sarah Johnson</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-gray-400">{res.url}</td>

                      <td className="py-4 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <span className={isRevealed ? 'text-purple-300 font-bold' : 'text-gray-400'}>
                            {displayedPass}
                          </span>
                          <button
                            onClick={() => handleRevealToggle(res)}
                            className="p-1 text-gray-500 hover:text-white"
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-purple-400" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-semibold">
                          Can view & copy
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleCopy(res)}
                          className="px-3 py-1.5 bg-[#151b28] hover:bg-[#1e2638] border border-gray-700 text-purple-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 ml-auto"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Secret
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
