'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Upload, Download, FileSpreadsheet, FileCode, Lock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ImportExportPage() {
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | '1password' | 'lastpass' | 'bitwarden'>('csv');
  const [exportOption, setExportOption] = useState<'all' | 'vault' | 'group' | 'selected'>('all');
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleImportSimulate = () => {
    setImportSuccess(true);
    setTimeout(() => setImportSuccess(false), 4000);
  };

  const handleExportSimulate = () => {
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 4000);
  };

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#f39c12]/40 flex items-center justify-center text-[#f39c12] shadow">
              <FileSpreadsheet className="w-5 h-5 text-[#f39c12]" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white">Import & Export</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Transfer your passwords securely between Clickrypt and other platforms.
              </p>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Import Section */}
            <div className="glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-6">
              <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
                <div className="w-9 h-9 rounded-xl bg-[#0d1724] border border-[#f39c12]/40 flex items-center justify-center text-[#f39c12]">
                  <Upload className="w-5 h-5 text-[#f39c12]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Import</h2>
                  <p className="text-xs text-gray-400">Import passwords from other password managers or files.</p>
                </div>
              </div>

              {/* Supported File Types */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-300">Supported file types</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {[
                    { id: 'csv', name: 'CSV', sub: '(Comma Separated)' },
                    { id: 'json', name: 'JSON', sub: '(Clickrypt Format)' },
                    { id: '1password', name: '1Password', sub: '(.1pux)' },
                    { id: 'lastpass', name: 'LastPass', sub: '(.csv)' },
                    { id: 'bitwarden', name: 'Bitwarden', sub: '(.json)' },
                  ].map((fmt) => {
                    const isSel = selectedFormat === fmt.id;
                    return (
                      <div
                        key={fmt.id}
                        onClick={() => setSelectedFormat(fmt.id as any)}
                        className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                          isSel
                            ? 'border-[#f39c12] bg-[#0d1724] text-[#f39c12] shadow-lg'
                            : 'border-gray-700/60 bg-[#0d1724]/40 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <FileCode className={`w-5 h-5 mx-auto mb-1 ${isSel ? 'text-[#f39c12]' : 'text-gray-500'}`} />
                        <p className="text-xs font-bold">{fmt.name}</p>
                        <p className="text-[9px] text-gray-500">{fmt.sub}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dropzone with Cyan Highlight (0% Purple) */}
              <div
                onClick={handleImportSimulate}
                className="border-2 border-dashed border-[#1fbbd2]/50 hover:border-[#1fbbd2] bg-[#0d1724]/60 hover:bg-[#0d1724] rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3"
              >
                <Upload className="w-8 h-8 text-[#1fbbd2] mx-auto animate-pulse" />
                <div>
                  <p className="text-xs font-bold text-white">Drag your file here or click to browse</p>
                  <p className="text-[11px] text-gray-400 mt-1">Supports CSV, JSON, 1pux, and more.</p>
                </div>
              </div>

              {importSuccess && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-700/60 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Passwords imported successfully and client-side OpenPGP encrypted!</span>
                </div>
              )}

              <div className="p-4 bg-[#0d1724] border border-[#f39c12]/30 rounded-xl text-xs text-[#f39c12] flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-[#f39c12] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Import Security Note:</strong>
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    Imported plaintext passwords will be encrypted immediately client-side using your OpenPGP public key.
                  </p>
                </div>
              </div>
            </div>

            {/* Export Section */}
            <div className="glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#0d1724] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2]">
                    <Download className="w-5 h-5 text-[#1fbbd2]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Export</h2>
                    <p className="text-xs text-gray-400">Export your passwords and data to a secure file.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-300">Choose what to export</label>
                  <div className="space-y-2">
                    {[
                      { id: 'all', label: 'All Passwords', sub: 'Export all personal and shared passwords.' },
                      { id: 'vault', label: 'My Workplace', sub: 'Export items from your workplace vault.' },
                      { id: 'group', label: 'Specific Group', sub: 'Export passwords from a specific group.' },
                      { id: 'selected', label: 'Selected Items only', sub: 'Export only items you have selected.' },
                    ].map((opt) => {
                      const isSel = exportOption === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => setExportOption(opt.id as any)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                            isSel
                              ? 'border-[#1fbbd2] bg-[#0d1724] shadow'
                              : 'border-gray-700/60 bg-[#0d1724]/40 hover:border-gray-600'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSel ? 'border-[#1fbbd2] bg-[#1fbbd2]' : 'border-gray-600'
                          }`}>
                            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-[#0d1724]" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{opt.label}</p>
                            <p className="text-[10px] text-gray-400">{opt.sub}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                {exportSuccess && (
                  <div className="p-3 bg-emerald-950/80 border border-emerald-700/60 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Vault export file downloaded securely!</span>
                  </div>
                )}

                <button
                  onClick={handleExportSimulate}
                  className="w-full gold-cyan-gradient-btn py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-[#0d1724] shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Vault</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Security Note */}
          <div className="p-4 bg-[#17283b] border border-[rgba(31,187,210,0.2)] rounded-xl text-xs text-gray-300 flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-[#1fbbd2] shrink-0" />
            <span>Your data is encrypted and secure. We never store your unencrypted exported files on remote servers.</span>
          </div>
        </main>
      </div>
    </div>
  );
}
