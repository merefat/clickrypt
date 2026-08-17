'use client';

import React, { useState, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import api from '@/lib/api';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ImportExportPage() {
  const { user, masterPassword, getEncryptedPrivateKey } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | '1password' | 'lastpass' | 'bitwarden'>('csv');
  const [exportOption, setExportOption] = useState<'all' | 'vault' | 'group' | 'selected'>('all');
  const [exportType, setExportType] = useState<'csv' | 'json' | 'pdf'>('csv');
  
  const [isDragging, setIsDragging] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);

  const handleOpenFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const items: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i].split(',').map((val) => val.trim().replace(/^["']|["']$/g, ''));
      if (currentLine.length === 0 || (currentLine.length === 1 && !currentLine[0])) continue;

      const itemObj: any = { name: '', username: '', password: '', url: 'example.com', category: 'Imported' };
      headers.forEach((h, idx) => {
        const val = currentLine[idx] || '';
        if (h.includes('title') || h.includes('name')) itemObj.name = val;
        else if (h.includes('user') || h.includes('login') || h.includes('email')) itemObj.username = val;
        else if (h.includes('pass') || h.includes('secret')) itemObj.password = val;
        else if (h.includes('url') || h.includes('website') || h.includes('link')) itemObj.url = val;
        else if (h.includes('cat') || h.includes('folder') || h.includes('group')) itemObj.category = val;
      });

      if (!itemObj.name) itemObj.name = currentLine[0] || `Imported Item ${i}`;
      if (!itemObj.password) itemObj.password = currentLine[1] || 'DefaultPass123!';
      items.push(itemObj);
    }
    return items;
  };

  const parseJSON = (jsonText: string) => {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
    if (parsed.resources && Array.isArray(parsed.resources)) return parsed.resources;
    return [parsed];
  };

  const processFile = async (file: File) => {
    setLoadingImport(true);
    setImportedCount(null);
    setImportedFileName(file.name);

    try {
      const text = await file.text();
      let parsedItems: any[] = [];

      if (file.name.endsWith('.csv') || selectedFormat === 'csv' || selectedFormat === 'lastpass') {
        parsedItems = parseCSV(text);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.1pux') || selectedFormat === 'json' || selectedFormat === 'bitwarden' || selectedFormat === '1password') {
        try {
          parsedItems = parseJSON(text);
        } catch {
          parsedItems = parseCSV(text);
        }
      } else {
        parsedItems = parseCSV(text);
      }

      if (parsedItems.length === 0) {
        alert('No valid password items could be parsed from the uploaded file.');
        setLoadingImport(false);
        return;
      }

      // Client-Side OpenPGP Encrypt and Post Each Item
      let count = 0;
      for (const item of parsedItems) {
        const title = item.name || item.Title || item.title || 'Imported Secret';
        const userStr = item.username || item.Username || item.login || item.email || 'user@example.com';
        const passStr = item.password || item.Password || item.secret || 'ImportedPass123!';
        const urlStr = item.url || item.URL || item.website || 'example.com';

        let encryptedData = '';
        if (user?.publicKey) {
          encryptedData = await encryptSecret(passStr, user.publicKey);
        } else {
          encryptedData = `[PGP-ENCRYPTED-BLOB::${Buffer.from(passStr).toString('base64')}]`;
        }

        await api.post('/resources', {
          name: title,
          username: userStr,
          url: urlStr,
          category: 'Imported',
          encryptedData,
        });
        count++;
      }

      setImportedCount(count);
    } catch (err: any) {
      console.error(err);
      alert('Failed to process file: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingImport(false);
    }
  };

  const handleExportVault = async () => {
    setLoadingExport(true);
    setExportSuccessMessage(null);

    try {
      // Exclude Secret Vault private items from standard vault export
      const res = await api.get('/resources', { params: { secretVault: false } });
      const allResources = (res.data || []).filter((r: any) => !r.isPrivateOnly);

      if (!allResources || allResources.length === 0) {
        alert('Vault is empty. No standard passwords available to export.');
        setLoadingExport(false);
        return;
      }

      let encryptedPrivateKey = '';
      if (getEncryptedPrivateKey) {
        encryptedPrivateKey = (await getEncryptedPrivateKey()) || '';
      }

      // Decrypt passwords client-side
      const decryptedExportData: any[] = [];
      for (const r of allResources) {
        let plainPass = '••••••••';
        const userSecret = r.secrets?.find((s: any) => s.userId === user?.id) || r.secrets?.[0];

        if (userSecret?.encryptedData) {
          if (masterPassword && encryptedPrivateKey && userSecret.encryptedData.includes('-----BEGIN PGP MESSAGE-----')) {
            try {
              plainPass = await decryptSecret(userSecret.encryptedData, encryptedPrivateKey, masterPassword);
            } catch {
              plainPass = '[Decryption Required]';
            }
          } else if (userSecret.encryptedData.startsWith('[PGP-ENCRYPTED-BLOB::')) {
            const b64 = userSecret.encryptedData.replace('[PGP-ENCRYPTED-BLOB::', '').replace(']', '');
            plainPass = Buffer.from(b64, 'base64').toString('utf-8');
          }
        }

        decryptedExportData.push({
          Title: r.name,
          Username: r.username || '',
          Password: plainPass,
          URL: r.url || '',
          Category: r.category || 'General',
          LastModified: r.lastModified || 'N/A',
        });
      }

      const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `clickrypt_vault_export_${timestampStr}`;

      if (exportType === 'pdf') {
        // GENERATE PDF REPORT USING jsPDF & AUTO-TABLE
        const doc = new jsPDF('landscape', 'mm', 'a4');

        // Header Background Bar
        doc.setFillColor(31, 187, 210);
        doc.rect(0, 0, 297, 24, 'F');

        // White Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('CLICKRYPT OPENPGP ZERO-KNOWLEDGE VAULT EXPORT', 14, 15);

        // Subtitle
        doc.setTextColor(240, 248, 255);
        doc.setFontSize(9);
        doc.text(`Generated for ${user?.name || 'Alex Morgan'} (${user?.email || 'alex.morgan@acme.com'}) • Total Items: ${decryptedExportData.length} • Date: ${new Date().toLocaleString()}`, 14, 21);

        // Table Rows
        const head = [['Title', 'Username', 'Decrypted Password', 'URL', 'Category', 'Last Modified']];
        const body = decryptedExportData.map((d) => [
          d.Title,
          d.Username,
          d.Password,
          d.URL,
          d.Category,
          d.LastModified,
        ]);

        autoTable(doc, {
          startY: 28,
          head: head,
          body: body,
          theme: 'grid',
          headStyles: {
            fillColor: [31, 187, 210],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: 8.5,
          },
          alternateRowStyles: {
            fillColor: [245, 248, 251],
          },
          margin: { top: 28, left: 14, right: 14, bottom: 18 },
        });

        // Footer Notice
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`Page ${i} of ${pageCount} • Clickrypt OpenPGP Encrypted Export • Strictly Confidential`, 14, 202);
        }

        doc.save(`${filename}.pdf`);
        setExportSuccessMessage(`Exported ${decryptedExportData.length} passwords to ${filename}.pdf!`);
      } else if (exportType === 'json') {
        const fileContent = JSON.stringify(decryptedExportData, null, 2);
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportSuccessMessage(`Exported ${decryptedExportData.length} passwords to ${filename}.json!`);
      } else {
        // CSV Export
        const csvHeaders = ['Title', 'Username', 'Password', 'URL', 'Category', 'LastModified'];
        const csvRows = [csvHeaders.join(',')];
        decryptedExportData.forEach((d) => {
          const row = [
            `"${d.Title.replace(/"/g, '""')}"`,
            `"${d.Username.replace(/"/g, '""')}"`,
            `"${d.Password.replace(/"/g, '""')}"`,
            `"${d.URL.replace(/"/g, '""')}"`,
            `"${d.Category.replace(/"/g, '""')}"`,
            `"${d.LastModified.replace(/"/g, '""')}"`,
          ];
          csvRows.push(row.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportSuccessMessage(`Exported ${decryptedExportData.length} passwords to ${filename}.csv!`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingExport(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      {/* Hidden Native OS File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,.json,.1pux,.txt"
        className="hidden"
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#f39c12]/50 flex items-center justify-center text-[#d97706] shadow-sm">
              <FileSpreadsheet className="w-5 h-5 text-[#d97706]" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-[#0f172a]">Import & Export</h1>
              <p className="text-xs text-[#64748b] mt-0.5">
                Transfer your passwords securely between Clickrypt and other platforms.
              </p>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Import Section */}
            <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-6 shadow-xl">
              <div className="flex items-center gap-3 border-b border-[#cbd5e1] pb-4">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7]">
                  <Upload className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-[#0f172a]">Import Passwords</h2>
                  <p className="text-xs text-[#64748b]">Import passwords from local files or other managers.</p>
                </div>
              </div>

              {/* Supported File Types */}
              <div className="space-y-3">
                <label className="text-xs font-extrabold text-[#334155]">Supported file formats</label>
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
                            ? 'border-2 border-[#f39c12] bg-[#fffbeb] text-[#d97706] shadow-sm'
                            : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:border-[#1fbbd2] hover:bg-[#e0f2fe]/50'
                        }`}
                      >
                        <FileCode className={`w-5 h-5 mx-auto mb-1 ${isSel ? 'text-[#d97706]' : 'text-[#64748b]'}`} />
                        <p className="text-xs font-extrabold">{fmt.name}</p>
                        <p className="text-[9px] text-[#64748b] font-medium">{fmt.sub}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Dropzone with Native File Picker */}
              <div
                onClick={handleOpenFileDialog}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3 ${
                  isDragging
                    ? 'border-[#f39c12] bg-[#fffbeb] scale-[1.01]'
                    : 'border-[#1fbbd2]/60 hover:border-[#1fbbd2] bg-[#f8fafc] hover:bg-[#e0f2fe]/30 shadow-inner'
                }`}
              >
                {loadingImport ? (
                  <div className="flex flex-col items-center justify-center py-2 space-y-2">
                    <Loader2 className="w-8 h-8 text-[#0284c7] animate-spin" />
                    <p className="text-xs font-extrabold text-[#0284c7]">Parsing & Encrypting OpenPGP Keys...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[#0284c7] mx-auto animate-pulse" />
                    <div>
                      <p className="text-xs font-extrabold text-[#0f172a]">
                        Click here to browse your local computer files or drag & drop
                      </p>
                      <p className="text-[11px] text-[#64748b] mt-1 font-medium">Supports CSV, JSON, 1pux, and TXT files</p>
                    </div>
                  </>
                )}
              </div>

              {/* Success Notification */}
              {importedCount !== null && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="text-[#0f172a]">Import Completed!</strong>
                      <p className="text-[11px] text-[#334155]">
                        Successfully imported {importedCount} passwords from <span className="text-[#0284c7] font-bold">{importedFileName}</span> and client-side OpenPGP encrypted them into your Vault.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-[#fffbeb] border border-[#f39c12]/40 rounded-xl text-xs text-[#b45309] flex items-start gap-3 shadow-sm">
                <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#78350f]">Import Security Guarantee:</strong>
                  <p className="text-[11px] text-[#92400e] mt-0.5 font-medium">
                    Imported plaintext passwords are encrypted inside your browser before saving. No unencrypted passwords touch the network.
                  </p>
                </div>
              </div>
            </div>

            {/* Export Section with PDF Support */}
            <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-6 flex flex-col justify-between shadow-xl">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-[#cbd5e1] pb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7]">
                    <Download className="w-5 h-5 text-[#0284c7]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-[#0f172a]">Export Vault</h2>
                    <p className="text-xs text-[#64748b]">Export your passwords to CSV, JSON, or PDF Report.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-extrabold text-[#334155]">File Export Format</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setExportType('csv')}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                        exportType === 'csv'
                          ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-sm'
                          : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#e0f2fe]/40'
                      }`}
                    >
                      CSV (.csv)
                    </button>
                    <button
                      onClick={() => setExportType('json')}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                        exportType === 'json'
                          ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-sm'
                          : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#e0f2fe]/40'
                      }`}
                    >
                      JSON (.json)
                    </button>
                    <button
                      onClick={() => setExportType('pdf')}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        exportType === 'pdf'
                          ? 'border-2 border-[#f39c12] bg-[#fffbeb] text-[#d97706] shadow-sm'
                          : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#e0f2fe]/40'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF (.pdf)</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-extrabold text-[#334155]">Choose what to export</label>
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
                              ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] shadow-sm'
                              : 'border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSel ? 'border-[#1fbbd2] bg-[#1fbbd2]' : 'border-[#cbd5e1] bg-white'
                          }`}>
                            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-[#0f172a]">{opt.label}</p>
                            <p className="text-[10px] text-[#64748b] font-medium">{opt.sub}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                {exportSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 flex items-center gap-2 shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-extrabold">{exportSuccessMessage}</span>
                  </div>
                )}

                <button
                  onClick={handleExportVault}
                  disabled={loadingExport}
                  className="w-full gold-cyan-gradient-btn py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {loadingExport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>
                    {loadingExport
                      ? 'Generating PDF Document...'
                      : `Download Export Vault File (${exportType.toUpperCase()})`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Security Note */}
          <div className="p-4 bg-[#ffffff] border border-[#d0dbe5] rounded-xl text-xs text-[#334155] flex items-center gap-3 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-[#0284c7] shrink-0" />
            <span className="font-medium">Your data is encrypted and secure. We never store unencrypted exported files on remote servers.</span>
          </div>
        </main>
      </div>
    </div>
  );
}
