'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Download, Upload, FileText, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';

export default function ImportExportPage() {
  const [selectedFormat, setSelectedFormat] = useState('CSV');
  const [exportOption, setExportOption] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  const formats = [
    { name: 'CSV', label: '(Comma Separated)', icon: FileText, color: 'text-emerald-400' },
    { name: 'JSON', label: '(Clickrypt Format)', icon: FileText, color: 'text-purple-400' },
    { name: '1Password', label: '(.1pux)', icon: FileText, color: 'text-blue-400' },
    { name: 'LastPass', label: '(.csv)', icon: FileText, color: 'text-amber-400' },
    { name: 'Bitwarden', label: '(.json)', icon: FileText, color: 'text-indigo-400' },
  ];

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      alert('Encrypted export file downloaded successfully!');
    }, 1200);
  };

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header Title */}
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <Download className="w-8 h-8 text-purple-400" />
              Import & Export
            </h1>
            <p className="text-xs text-gray-400">Transfer your passwords securely between Clickrypt and other platforms.</p>
          </div>

          {/* Import / Export Grid (Screenshot i7Ghi.jpg) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Left Box: Import */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-700/60 flex items-center justify-center text-purple-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Import</h2>
                    <p className="text-xs text-gray-400">Import passwords from other password managers or files.</p>
                  </div>
                </div>

                {/* Format Badges Grid */}
                <p className="text-xs font-semibold text-gray-300 mb-2">Supported file types</p>
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {formats.map((fmt) => (
                    <button
                      key={fmt.name}
                      onClick={() => setSelectedFormat(fmt.name)}
                      className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center transition-all ${
                        selectedFormat === fmt.name
                          ? 'bg-purple-950/80 border-purple-500 text-white shadow-md shadow-purple-950'
                          : 'bg-[#0b0f17] border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <fmt.icon className={`w-5 h-5 mb-1 ${fmt.color}`} />
                      <span className="text-[11px] font-bold">{fmt.name}</span>
                      <span className="text-[9px] text-gray-500 truncate max-w-full">{fmt.label}</span>
                    </button>
                  ))}
                </div>

                {/* Drag and Drop Zone */}
                <div className="border-2 border-dashed border-purple-800/50 hover:border-purple-500/80 bg-[#0b0f17]/60 rounded-2xl p-8 text-center cursor-pointer transition-all mb-6">
                  <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-white mb-1">Drag your file here or click to browse</p>
                  <p className="text-[10px] text-gray-400">Supports CSV, JSON, .1pux, and more.</p>
                </div>

                {/* Warning Callout Box */}
                <div className="p-3.5 bg-rose-950/30 border border-rose-900/40 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-200">Import Security Note</p>
                    <p className="text-[11px] text-rose-300/80">
                      Imported plaintext passwords will be encrypted immediately client-side using your OpenPGP public key.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Box: Export */}
            <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/90 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-700/60 flex items-center justify-center text-purple-400">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Export</h2>
                    <p className="text-xs text-gray-400">Export your passwords and data to a secure file.</p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-gray-300 mb-3">Choose what to export</p>
                <div className="space-y-3 mb-6">
                  {[
                    { id: 'all', title: 'All Passwords', desc: 'Export all personal and shared passwords.' },
                    { id: 'workplace', title: 'My Workplace', desc: 'Export items from your workplace vault.' },
                    { id: 'group', title: 'Specific Group', desc: 'Export passwords from a specific group.' },
                    { id: 'selected', title: 'Selected Items only', desc: 'Export only items you have selected.' },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                        exportOption === opt.id
                          ? 'bg-[#1e2638] border-purple-500 text-white'
                          : 'bg-[#0b0f17] border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="exportOpt"
                        checked={exportOption === opt.id}
                        onChange={() => setExportOption(opt.id)}
                        className="accent-purple-500"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">{opt.title}</p>
                        <p className="text-[10px] text-gray-400">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Exporting Encrypted Archive...' : 'Export Vault'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Encryption Footer Note (Screenshot i7Ghi.jpg) */}
          <div className="glass-panel p-4 rounded-xl border border-purple-900/30 flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Your data is encrypted and secure. We never store your exported files on servers.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
