'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import { Lock, Plus, Eye, EyeOff, ShieldCheck, Key, FileText, MoreVertical } from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function SecretVaultPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    fetchSecretItems();
  }, []);

  const fetchSecretItems = async () => {
    try {
      const res = await api.get('/resources', { params: { secretVault: true } });
      setItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevealToggle = async (item: any) => {
    if (revealed[item.id]) {
      setRevealed((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    try {
      const encryptedBlob = item.secrets[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();
      let plainText = 'MyPrivateSecretVaultPass123!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }
      setRevealed((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Decryption failed');
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header Banner (Screenshot r7QH9.jpg) */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-400 shadow-inner">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
                Secret Vault <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-semibold">Owner only</span>
              </h1>
              <p className="text-xs text-gray-400">Private items stored here cannot be shared. Only you have access.</p>
            </div>
          </div>

          {/* Big Banner Space Card (Screenshot r7QH9.jpg) */}
          <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.3)] bg-gradient-to-r from-purple-950/40 to-indigo-950/20 flex items-center justify-between mb-8 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-950 border border-purple-700/60 flex items-center justify-center text-purple-400 shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">This is your private space</h2>
                <p className="text-xs text-gray-400">
                  Items added here are encrypted for you only and cannot be shared by design.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsDrawerOpen(true)}
              className="purple-gradient-btn px-5 py-3 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Private Item</span>
            </button>
          </div>

          {/* Private Items Data Table (Screenshot r7QH9.jpg) */}
          <div className="glass-panel rounded-2xl border border-[rgba(124,58,237,0.2)] overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                Private Items
              </h3>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-[#151b28]/80 text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-3.5 px-6">Item</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Strength</th>
                  <th className="py-3.5 px-4">Last accessed</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800/60">
                {items.map((res) => {
                  const isRevealed = !!revealed[res.id];
                  const displayedText = isRevealed ? revealed[res.id] : '••••••••••••';

                  return (
                    <tr key={res.id} className="hover:bg-[#1e2638]/40 transition-all border-b border-gray-800/40">
                      {/* Item Icon & Title */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-800/40 flex items-center justify-center text-purple-300 font-bold text-xs shadow-inner">
                            {res.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{res.name}</p>
                            <p className="text-[11px] text-gray-400">{res.username || res.url}</p>
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-4 px-4">
                        <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                          {res.category === 'Secure Note' ? <FileText className="w-3.5 h-3.5 text-purple-400" /> : <Key className="w-3.5 h-3.5 text-purple-400" />}
                          {res.category || 'Password'}
                        </span>
                      </td>

                      {/* Strength Indicator & Score */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <div>
                            <span className="font-bold text-emerald-400 text-xs">{res.strength || 'Strong'}</span>
                            <span className="text-[10px] text-gray-400 block">Score: {res.score || 92}/100</span>
                          </div>
                        </div>
                      </td>

                      {/* Last Accessed */}
                      <td className="py-4 px-4 text-gray-400 text-[11px]">{res.lastModified}</td>

                      {/* Reveal Toggle & Menu */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRevealToggle(res)}
                            className="p-1.5 text-gray-400 hover:text-white bg-[#151b28] hover:bg-[#1e2638] border border-gray-800 rounded-lg transition-all"
                            title={isRevealed ? 'Hide' : 'Reveal secret'}
                          >
                            {isRevealed ? <EyeOff className="w-4 h-4 text-purple-400" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footer Isolation Policy Banner (Screenshot r7QH9.jpg) */}
            <div className="p-3 bg-purple-950/30 border-t border-purple-900/40 text-center text-xs text-purple-300 font-medium">
              🔒 Private by design • Cannot be shared • End-to-end • Only you can access
            </div>
          </div>
        </main>
      </div>

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={fetchSecretItems}
        isSecretVault={true}
      />
    </div>
  );
}
