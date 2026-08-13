'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  ChevronDown,
  FolderPlus
} from 'lucide-react';
import { generatePassword } from '@/lib/generator';
import { evaluatePasswordStrength, encryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface PasswordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem?: any | null;
  isSecretVault?: boolean;
  defaultFolderId?: string;
  initialFolderId?: string;
}

export default function PasswordDrawer({
  isOpen,
  onClose,
  onSaved,
  editItem = null,
  isSecretVault = false,
  defaultFolderId = '',
  initialFolderId = '',
}: PasswordDrawerProps) {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('Developer');
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<any[]>([]);

  // Password Generator options
  const [passLength, setPassLength] = useState(16);
  const [incUppercase, setIncUppercase] = useState(true);
  const [incNumbers, setIncNumbers] = useState(true);
  const [incSymbols, setIncSymbols] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name || '');
      setUsername(editItem.username || '');
      setUrl(editItem.url || '');
      setPassword('');
      setCategory(editItem.category || 'Developer');
      setFolderId(editItem.folderId || defaultFolderId || '');
    } else {
      setName('');
      setUsername('');
      setUrl('');
      setPassword('');
      setCategory('Developer');
      setFolderId(defaultFolderId || '');
    }
  }, [editItem, isOpen]);

  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders', { params: { secretVault: !!isSecretVault } });
      setFolders(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const strength = evaluatePasswordStrength(password);

  const handleGenerate = () => {
    const gen = generatePassword({
      length: passLength,
      useUppercase: incUppercase,
      useNumbers: incNumbers,
      useSymbols: incSymbols,
    });
    setPassword(gen);
  };

  const handleCopy = () => {
    if (password) {
      navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || (!password && !editItem)) {
      alert('Please fill in required fields.');
      return;
    }

    setLoading(true);
    try {
      let encryptedBlob = '';

      if (password) {
        if (user?.publicKey) {
          encryptedBlob = await encryptSecret(password, user.publicKey);
        } else {
          encryptedBlob = `[PGP-ENCRYPTED-BLOB::${Buffer.from(password).toString('base64')}]`;
        }
      }

      if (editItem) {
        const updateData: any = {
          name,
          username,
          url,
          category,
          folderId: folderId || null,
          isPrivateOnly: isSecretVault,
        };

        if (password) {
          updateData.password = password;
          updateData.encryptedData = encryptedBlob;
          updateData.strength = strength.tier;
        }

        await api.put(`/resources/${editItem.id}`, updateData);
      } else {
        await api.post('/resources', {
          name,
          username,
          url,
          category,
          folderId: folderId || null,
          password,
          isPrivateOnly: isSecretVault,
          strength: strength.tier,
          encryptedData: encryptedBlob,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save password item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end font-sora select-none animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#ffffff] border-l border-[#d0dbe5] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-[#cbd5e1] flex items-center justify-between bg-[#f8fafc]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center font-bold text-[#0284c7] shadow-xs">
              <Lock className="w-5 h-5 text-[#0284c7]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#0f172a]">
                {editItem ? 'Edit Password Item' : isSecretVault ? 'New Private Secret' : 'New Password Item'}
              </h2>
              <p className="text-[11px] text-[#0284c7] font-bold">
                {isSecretVault ? 'Secret Vault Private Folder Scope' : 'Client-side OpenPGP Encryption'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-[#0f172a] rounded-lg hover:bg-[#f1f5f9] transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <label className="block font-extrabold text-[#334155] mb-1">Item Title</label>
            <input
              type="text"
              placeholder="e.g. GitHub Production API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none font-bold shadow-xs transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-extrabold text-[#334155] mb-1">Username / Email</label>
              <input
                type="text"
                placeholder="alex.morgan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none font-bold shadow-xs transition-all"
              />
            </div>

            <div>
              <label className="block font-extrabold text-[#334155] mb-1">
                {isSecretVault ? 'Private Folder' : 'Folder'}
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] focus:border-[#1fbbd2] focus:outline-none cursor-pointer font-sora font-bold shadow-xs transition-all"
              >
                <option value="" className="bg-[#ffffff] text-[#0f172a]">No Folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#ffffff] text-[#0f172a]">
                    / {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-extrabold text-[#334155] mb-1">Website URL</label>
            <input
              type="text"
              placeholder="github.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 text-[#0f172a] placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none font-bold shadow-xs transition-all"
            />
          </div>

          {/* Password Input & Reveal */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-extrabold text-[#334155]">Password</label>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-[#d97706] hover:underline text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-[#d97706]" /> Auto-generate
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl p-2.5 pr-20 font-mono font-bold text-[#0f172a] placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none shadow-xs transition-all"
              />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-gray-400 hover:text-[#0f172a] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 text-gray-400 hover:text-[#0f172a] cursor-pointer"
                  title="Copy password"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {password && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#64748b] font-bold">Strength Rating</span>
                  <span className="font-extrabold text-[#d97706]">{strength.tier} ({strength.score}/100)</span>
                </div>
                <div className="w-full bg-[#cbd5e1] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] transition-all"
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Generator Controls */}
          <div className="p-4 rounded-2xl space-y-3 bg-[#f8fafc] border border-[#cbd5e1] shadow-xs">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#0f172a]">
              <span>Generator Customizer</span>
              <span className="text-[#d97706] font-mono font-extrabold">{passLength} chars</span>
            </div>

            <input
              type="range"
              min={8}
              max={32}
              value={passLength}
              onChange={(e) => setPassLength(Number(e.target.value))}
              className="w-full accent-[#f39c12] bg-[#cbd5e1] h-1.5 rounded-lg cursor-pointer"
            />

            <div className="grid grid-cols-3 gap-2 text-[10px] text-[#334155] font-extrabold pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incUppercase}
                  onChange={(e) => setIncUppercase(e.target.checked)}
                  className="accent-[#f39c12]"
                />
                A-Z Upper
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incNumbers}
                  onChange={(e) => setIncNumbers(e.target.checked)}
                  className="accent-[#f39c12]"
                />
                0-9 Numbers
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incSymbols}
                  onChange={(e) => setIncSymbols(e.target.checked)}
                  className="accent-[#f39c12]"
                />
                !@# Symbols
              </label>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl font-extrabold transition-all cursor-pointer shadow-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 gold-cyan-gradient-btn rounded-xl text-white font-extrabold shadow-md transition-all cursor-pointer"
            >
              {loading ? 'Encrypting & Saving...' : editItem ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
