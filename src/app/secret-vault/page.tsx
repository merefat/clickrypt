/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability */
'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PasswordDrawer from '@/components/PasswordDrawer';
import ShareModal from '@/components/ShareModal';
import { SortableTableRow } from '@/components/SortableItem';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Share2,
  Edit2,
  Trash2,
  Globe
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { decryptBestSecret } from '@/lib/crypto';
import { resolveBestSecret } from '@/lib/secretResolver';
import { useAuth } from '@/context/AuthContext';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

function parseCardSecret(text: string) {
  if (!text || !text.startsWith('Card Holder Name:')) return null;
  const lines = text.split('\n');
  const get = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? line.replace(prefix, '').trim() : '';
  };
  return {
    cardHolderName: get('Card Holder Name:'),
    cardNumber: get('Card Number:'),
    expiry: get('Expiry Date:'),
    cvv: get('CVV / CVC:'),
  };
}

export default function SecretVaultPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, unlockVault, getEncryptedPrivateKey } = useAuth();
  const [resources, setResources] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [shareResourceId, setShareResourceId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});
  const [loading, setLoading] = useState(false);

  // Route Guard: Restrict Secret Vault to organization-mode accounts with Owner role
  useEffect(() => {
    if (user && (user.accountMode !== 'organization' || user.role !== 'Owner')) {
      router.push('/vault');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.accountMode === 'organization' && user?.role === 'Owner') {
      fetchResources();
    }
  }, [searchTerm, user]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params: any = { search: searchTerm, secretVault: true };
      const res = await api.get('/resources', { params });
      setResources(res.data);
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
      if (!masterPassword && !unlockedPgpKey) {
        const enteredPassword = window.prompt('Enter your master password to reveal card details');
        if (!enteredPassword) return;
        const unlocked = await unlockVault(enteredPassword);
        if (!unlocked) {
          alert('Incorrect master password');
          return;
        }
      }

      const privateKey = await getEncryptedPrivateKey();
      const userSecret = resolveBestSecret(item, user?.id, user?.role);

      if (!privateKey || !userSecret) {
        alert('Key or encrypted data missing.');
        return;
      }

      const plainText = await decryptBestSecret(
        userSecret,
        item.secrets,
        user?.role,
        privateKey,
        unlockedPgpKey ? undefined : masterPassword || undefined
      );

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      console.error('Reveal failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to decrypt card details.');
    }
  };

  const handleCopy = async (item: any) => {
    if (!revealedPasswords[item.id]) {
      await handleRevealToggle(item);
      return;
    }

    const pass = revealedPasswords[item.id];
    navigator.clipboard.writeText(pass);
    alert(`Copied card details for ${item.name} to clipboard!`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this card item?')) return;
    try {
      await api.delete(`/resources/${id}`);
      fetchResources();
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over) return;
    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'resource' && overType === 'resource') {
      if (active.id === over.id) return;
      const oldIndex = resources.findIndex((r) => r.id === active.id);
      const newIndex = resources.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const previous = [...resources];
      const reordered = arrayMove(previous, oldIndex, newIndex);
      setResources(reordered);
      try {
        await api.put('/resources/reorder', { ids: reordered.map((r) => r.id) });
      } catch (err) {
        setResources(previous);
        alert('Failed to save card item order');
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#dfe6ed] text-[#0f172a] font-sora select-none overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto space-y-6">
          {/* Top Title & Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-sm">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-extrabold text-[#0f172a]">Card Vault</h1>
                  <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-xs font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                    Owner only
                  </span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Card details stored here can only be viewed by the Owner unless shared.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Circular Refresh Button with Working Spin Handler */}
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  await fetchResources();
                  setTimeout(() => setLoading(false), 500);
                }}
                className="p-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-[#0f172a] transition-all shadow-sm cursor-pointer active:scale-95"
                title="Refresh Card Vault Data"
              >
                <RefreshCw className={`w-4 h-4 text-[#0284c7] ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsDrawerOpen(true);
                }}
                className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Card Item</span>
              </button>
            </div>
          </div>

          {/* 2-COLUMN SIDE-BY-SIDE LAYOUT: Folders on Left Side | Table on Right Side */}
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
              <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
                <div className="p-4 border-b border-[#cbd5e1] flex items-center gap-2 text-xs font-extrabold text-[#0284c7]">
                  <CreditCard className="w-4 h-4 text-[#0284c7]" />
                  <span>Card Items ({resources.length})</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                      <tr>
                        <th className="py-3.5 px-2 w-10" />
                        <th className="py-3.5 px-6">Card Holder Name</th>
                        <th className="py-3.5 px-4">Card Number</th>
                        <th className="py-3.5 px-4">Expiry Date (MM/YY)</th>
                        <th className="py-3.5 px-4">CVV / CVC</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#e2e8f0]">
                      {resources.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-[#64748b] text-xs">
                            No card items found in this view.
                          </td>
                        </tr>
                      ) : (
                        <SortableContext items={resources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                          {resources.map((res) => {
                            const isRevealed = !!revealedPasswords[res.id];
                            const cardDetails = isRevealed ? parseCardSecret(revealedPasswords[res.id]) : null;

                            return (
                              <SortableTableRow
                                key={res.id}
                                id={res.id}
                                data={{ type: 'resource' }}
                                className="hover:bg-[#f1f6fb] transition-all group border-b border-gray-100"
                              >
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow">
                                    {res.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-[#0f172a] text-sm group-hover:text-[#1fbbd2] transition-colors">
                                        {res.name}
                                      </p>
                                      {res.isExternalShared && (
                                        <span
                                          className="p-1 rounded-lg bg-amber-50 border border-amber-300 text-[#d97706] inline-flex items-center justify-center shadow-sm"
                                          title="Shared externally with a non-application member"
                                        >
                                          <Globe className="w-3.5 h-3.5 text-[#d97706]" />
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-4 px-4 font-mono">
                                {cardDetails ? cardDetails.cardNumber : '•••• •••• •••• ••••'}
                              </td>

                              <td className="py-4 px-4">
                                {cardDetails ? cardDetails.expiry : '••/••'}
                              </td>

                              <td className="py-4 px-4">
                                {cardDetails ? cardDetails.cvv : '•••'}
                              </td>

                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleRevealToggle(res)}
                                    className="p-1.5 text-gray-500 hover:text-[#0284c7] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                    title={isRevealed ? 'Hide card details' : 'Reveal card details'}
                                  >
                                    {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>

                                  <button
                                    onClick={() => handleCopy(res)}
                                    className="p-1.5 text-gray-500 hover:text-[#d97706] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                    title="Copy card details to clipboard"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>

                                  {res.ownerId === user?.id && (
                                    <button
                                      onClick={() => setShareResourceId(res.id)}
                                      className="p-1.5 text-gray-500 hover:text-[#1fbbd2] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                      title="Share card item with members, groups, or external users"
                                    >
                                      <Share2 className="w-4 h-4" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      setEditingItem(res);
                                      setIsDrawerOpen(true);
                                    }}
                                    className="p-1.5 text-gray-500 hover:text-[#d97706] hover:bg-[#e2e8f0] rounded-lg transition-all cursor-pointer"
                                    title="Edit item"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => handleDelete(res.id)}
                                    className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                    title="Delete item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </SortableTableRow>
                          );
                        })}
                        </SortableContext>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </DndContext>
        </main>
      </div>

      <PasswordDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSaved={fetchResources}
        editItem={editingItem}
        isSecretVault={true}
      />

      <ShareModal
        resourceId={shareResourceId}
        onClose={() => setShareResourceId(null)}
      />


    </div>
  );
}
