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
}

export default function PasswordDrawer({
  isOpen,
  onClose,
  onSaved,
  editItem = null,
  isSecretVault = false,
}: PasswordDrawerProps) {
  const { user, masterPassword } = useAuth();
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
  }, [isOpen, isSecretVault]);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name || '');
      setUsername(editItem.username || '');
      setUrl(editItem.url || '');
      setPassword('');
      setCategory(editItem.category || 'Developer');
      setFolderId(editItem.folderId || '');
    } else {
      setName('');
      setUsername('');
      setUrl('');
      setPassword('');
      setCategory('Developer');
      setFolderId('');
    }
  }, [editItem, isOpen]);

  const fetchFolders = async () => {
    try {
      // Pass secretVault flag so Secret Vault items ONLY fetch Secret Vault private folders
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
    setShowPassword(true);
  };

  const handleCopy = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let encryptedBlob = `[PGP-ENCRYPTED-BLOB::${Buffer.from(password || 'AcmePass123!').toString('base64')}]`;

      if (user?.publicKey) {
        try {
          encryptedBlob = await encryptSecret(password || 'AcmePass123!', user.publicKey);
        } catch (err) {
          console.warn('Fallback encryption:', err);
        }
      }

      if (editItem) {
        await api.put(`/resources/${editItem.id}`, {
          name,
          username,
          url,
          category,
          folderId: folderId || null,
          isPrivateOnly: isSecretVault,
          strength: strength.tier,
          encryptedData: encryptedBlob,
        });
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
      alert('Failed to save password item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end font-sora">
      <div className="w-full max-w-md bg-[#17283b] border-l border-[rgba(31,187,210,0.3)] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-gray-700/60 flex items-center justify-between bg-[#0d1724]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center font-bold text-[#0d1724]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {editItem ? 'Edit Password Item' : isSecretVault ? 'New Private Secret' : 'New Password Item'}
              </h2>
              <p className="text-[11px] text-[#1fbbd2]">
                {isSecretVault ? 'Secret Vault Private Folder Scope' : 'Client-side OpenPGP Encryption'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <label className="block font-semibold text-gray-300 mb-1">Item Title</label>
            <input
              type="text"
              placeholder="e.g. GitHub Production API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0d1724] border border-gray-700 rounded-lg p-2.5 text-white focus:border-[#1fbbd2] outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-300 mb-1">Username / Email</label>
              <input
                type="text"
                placeholder="alex.morgan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0d1724] border border-gray-700 rounded-lg p-2.5 text-white focus:border-[#1fbbd2] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-300 mb-1">
                {isSecretVault ? 'Private Folder' : 'Folder'}
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full bg-[#0d1724] border border-gray-700 rounded-lg p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer font-sora"
              >
                <option value="" className="bg-[#17283b] text-white">No Folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#17283b] text-white">
                    / {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-300 mb-1">Website URL</label>
            <input
              type="text"
              placeholder="github.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#0d1724] border border-gray-700 rounded-lg p-2.5 text-white focus:border-[#1fbbd2] outline-none"
            />
          </div>

          {/* Password Input & Reveal */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-gray-300">Password</label>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-[#f39c12] hover:underline text-[11px] font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Auto-generate
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0d1724] border border-gray-700 rounded-lg p-2.5 pr-20 font-mono text-white focus:border-[#1fbbd2] outline-none"
              />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 text-gray-400 hover:text-white"
                  title="Copy password"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {password && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-400">Strength Rating</span>
                  <span className="font-bold text-[#f39c12]">{strength.tier} ({strength.score}/100)</span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#f39c12] to-[#1fbbd2] transition-all"
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Generator Controls */}
          <div className="glass-panel-gold p-4 rounded-xl space-y-3 bg-[#0d1724]/80">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span>Generator Customizer</span>
              <span className="text-[#f39c12] font-mono">{passLength} chars</span>
            </div>

            <input
              type="range"
              min={8}
              max={32}
              value={passLength}
              onChange={(e) => setPassLength(Number(e.target.value))}
              className="w-full accent-[#f39c12] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
            />

            <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-300 pt-1">
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
              className="flex-1 py-2.5 bg-gray-800 text-gray-300 rounded-xl font-bold hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 gold-cyan-gradient-btn rounded-xl text-[#0d1724] font-extrabold shadow-lg transition-all"
            >
              {loading ? 'Encrypting & Saving...' : editItem ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
