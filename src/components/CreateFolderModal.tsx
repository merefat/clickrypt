'use client';

import React, { useState } from 'react';
import { FolderPlus, X, Folder } from 'lucide-react';
import api from '@/lib/api';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  isPrivateOnly?: boolean;
}

export default function CreateFolderModal({
  isOpen,
  onClose,
  onCreated,
  isPrivateOnly = false,
}: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await api.post('/folders', {
        name: name.trim(),
        description: description.trim() || (isPrivateOnly ? 'Private secret vault folder' : 'Vault folder'),
        isPrivateOnly: !!isPrivateOnly,
      });

      setName('');
      setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora select-none animate-in fade-in duration-200">
      <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-xs">
              <FolderPlus className="w-5 h-5 text-[#d97706]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0f172a]">
                {isPrivateOnly ? 'Create Private Folder' : 'Create New Folder'}
              </h3>
              <p className="text-[11px] text-[#64748b] font-medium">
                Organize your passwords and credentials efficiently
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-[#0f172a] rounded-lg transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-extrabold text-[#334155] mb-1.5">Folder Name</label>
            <input
              type="text"
              placeholder="e.g. Card Details, Infrastructure, Production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-3 text-xs text-[#0f172a] font-bold placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-xs transition-all"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block font-extrabold text-[#334155] mb-1.5">Description (Optional)</label>
            <input
              type="text"
              placeholder="Brief description of folder contents"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-3 text-xs text-[#0f172a] font-bold placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-xs transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#cbd5e1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="gold-cyan-gradient-btn px-6 py-2.5 rounded-xl text-xs font-extrabold text-white shadow-md disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? 'Creating Folder...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
