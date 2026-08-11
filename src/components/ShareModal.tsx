'use client';

import React, { useState, useEffect } from 'react';
import { X, Share2, Users, Shield, Check, Search } from 'lucide-react';
import api from '@/lib/api';

interface ShareModalProps {
  resourceId: string | null;
  onClose: () => void;
}

export default function ShareModal({ resourceId, onClose }: ShareModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (resourceId) {
      fetchUsers();
    }
  }, [resourceId]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.filter((u: any) => u.id !== 'u-1'));
    } catch (err) {
      console.error(err);
    }
  };

  if (!resourceId) return null;

  const toggleUserSelect = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleShare = async () => {
    setLoading(true);
    try {
      await api.post(`/resources/${resourceId}/share`, { recipientIds: selectedUserIds });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      alert('Sharing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#17283b] border border-[rgba(31,187,210,0.3)] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-700/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center font-bold text-[#0d1724]">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">E2EE Secret Sharing</h3>
              <p className="text-[10px] text-[#1fbbd2]">OpenPGP Key Re-Encryption</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-300">Select Recipient Members</label>
          <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
            {users.map((u) => {
              const isSelected = selectedUserIds.includes(u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => toggleUserSelect(u.id)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-[#0d1724] border-[#f39c12] text-white shadow'
                      : 'bg-[#0d1724]/60 border-gray-700 text-gray-300 hover:bg-[#0d1724]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[10px] font-bold text-[#0d1724]">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white leading-tight">{u.name}</p>
                      <p className="text-[10px] text-gray-400 leading-tight">{u.email}</p>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-[#f39c12]" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleShare}
            disabled={loading || selectedUserIds.length === 0}
            className="flex-1 py-2 gold-gradient-btn text-xs font-bold rounded-lg disabled:opacity-50"
          >
            {loading ? 'Re-Encrypting...' : success ? 'Shared Success!' : 'Share Secret'}
          </button>
        </div>
      </div>
    </div>
  );
}
