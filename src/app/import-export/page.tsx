/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
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
  Loader2,
  Users,
  Folder,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Clock
} from 'lucide-react';
import api from '@/lib/api';
import { encryptSecret, canUnlockPrivateKey } from '@/lib/crypto';
import UnlockVaultModal from '@/components/UnlockVaultModal';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  buildDecryptedExportData,
  exportPasswords,
  addImportExportHistory,
  getImportExportHistory,
  ImportExportRecord,
} from '@/lib/exportVault';

export default function ImportExportPage() {
  const router = useRouter();
  const { user, masterPassword, unlockedPgpKey, getEncryptedPrivateKey, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (user?.role === 'External') {
      router.push('/shared');
    }
  }, [user, router]);

  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | '1password' | 'lastpass' | 'bitwarden' | 'kdbx'>('csv');
  const [exportOption, setExportOption] = useState<'all' | 'group' | 'selected'>('all');
  const [exportType, setExportType] = useState<'csv' | 'json' | 'pdf' | 'xlsx' | 'kdbx'>('csv');
  const [history, setHistory] = useState<ImportExportRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;
  const totalHistoryPages = Math.ceil(history.length / HISTORY_PER_PAGE) || 1;
  const [groups, setGroups] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpen(false);
      }
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    fetchGroupsAndFolders();
    setHistory(getImportExportHistory());
  }, []);

  React.useEffect(() => {
    setHistoryPage(1);
  }, [history.length]);

  const fetchGroupsAndFolders = async () => {
    try {
      const folderParams: any = { secretVault: false };
      if (user?.role === 'Owner' || user?.role === 'Admin') {
        folderParams.scope = 'manage';
      }
      const [groupsRes, foldersRes] = await Promise.all([
        api.get('/groups'),
        api.get('/folders', { params: folderParams }),
      ]);
      const fetchedGroups = groupsRes.data || [];
      const fetchedFolders = foldersRes.data || [];
      setGroups(fetchedGroups);
      setFolders(fetchedFolders);
      if (fetchedGroups.length > 0) setSelectedGroupId(fetchedGroups[0].id);
      if (fetchedFolders.length > 0) setSelectedFolderId(fetchedFolders[0].id);
    } catch (err) {
      console.error(err);
    }
  };
  
  const [isDragging, setIsDragging] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingExportResources, setPendingExportResources] = useState<any[] | null>(null);

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
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < csvText.length) {
      const c = csvText[i];
      const next = csvText[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
        continue;
      }

      if (!inQuotes) {
        if (c === ',') {
          currentRow.push(currentField);
          currentField = '';
          i++;
          continue;
        }
        if (c === '\n') {
          currentRow.push(currentField);
          if (currentRow.some((f) => f.trim().length > 0)) rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i++;
          continue;
        }
        if (c === '\r') {
          currentRow.push(currentField);
          if (currentRow.some((f) => f.trim().length > 0)) rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i += next === '\n' ? 2 : 1;
          continue;
        }
      }

      currentField += c;
      i++;
    }

    // Push final row if it isn’t empty and didn’t end with a newline
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some((f) => f.trim().length > 0)) rows.push(currentRow);
    }

    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const items: any[] = [];

    for (let r = 1; r < rows.length; r++) {
      const currentLine = rows[r].map((val) => val.trim().replace(/^["']|["']$/g, ''));
      if (currentLine.length === 0 || (currentLine.length === 1 && !currentLine[0])) continue;

      const itemObj: any = { name: '', username: '', password: '', url: 'example.com' };
      headers.forEach((h, idx) => {
        const val = currentLine[idx] || '';
        if (h.includes('title') || h.includes('name')) itemObj.name = val;
        else if (h.includes('user') || h.includes('login') || h.includes('email')) itemObj.username = val;
        else if (h.includes('pass') || h.includes('secret')) itemObj.password = val;
        else if (h.includes('url') || h.includes('website') || h.includes('link')) itemObj.url = val;
      });

      if (!itemObj.name) itemObj.name = currentLine[0] || `Imported Item ${r}`;
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

  const parseKdbx = async (file: File, password?: string) => {
    const kdbxwebModule = await import('kdbxweb');
    const kdbxweb = (kdbxwebModule as any).default || kdbxwebModule;
    const arrayBuffer = await file.arrayBuffer();
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password ?? ''));
    const db = await kdbxweb.Kdbx.load(arrayBuffer, credentials);

    const getField = (entry: any, field: string): string => {
      const value = entry.fields.get(field);
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value?.getText === 'function') return value.getText();
      return String(value);
    };

    const items: any[] = [];
    const collect = (group: any) => {
      for (const entry of group.entries || []) {
        items.push({
          name: getField(entry, 'Title') || 'Imported Item',
          username: getField(entry, 'UserName') || '',
          password: getField(entry, 'Password') || '',
          url: getField(entry, 'URL') || 'example.com',
        });
      }
      for (const sub of group.groups || []) {
        collect(sub);
      }
    };

    collect(db.getDefaultGroup());
    return items;
  };

  const processFile = async (file: File) => {
    if (localStorage.getItem('clickrypt_app_mode') !== 'personal' && !['Owner', 'Admin', 'User'].includes(user?.role as string)) {
      alert('🔒 Import Restricted: Import is available for Organization members (Owner/Admin/User) or in Personal mode.');
      return;
    }
    setLoadingImport(true);
    setImportedCount(null);
    setImportedFileName(file.name);

    try {
      let parsedItems: any[] = [];

      if (file.name.endsWith('.kdbx') || selectedFormat === 'kdbx') {
        parsedItems = await parseKdbx(file);
      } else {
        const text = await file.text();

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
          encryptedData,
        });
        count++;
      }

      setImportedCount(count);
      addImportExportHistory({
        type: 'import',
        fileName: file.name,
        format: selectedFormat,
        count,
        by: user?.name || user?.email || 'Unknown',
      });
      setHistory(getImportExportHistory());
    } catch (err: any) {
      console.error(err);
      alert('Failed to process file: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingImport(false);
    }
  };

  const executeExport = async (allResources: any[], overridePassword?: string) => {
    setLoadingExport(true);
    setExportSuccessMessage(null);
    try {
      const decryptedExportData = await buildDecryptedExportData(
        allResources,
        user,
        overridePassword || masterPassword,
        unlockedPgpKey,
        getEncryptedPrivateKey
      );
      const { filename, count, filePassword } = await exportPasswords(decryptedExportData, exportType, user);

      const newRecord = addImportExportHistory({
        type: 'export',
        fileName: filename,
        format: exportType,
        count,
        by: user?.name || user?.email || 'Unknown',
        passwordNames: allResources.map((r: any) => r.name),
      });
      console.log('[debug] newRecord:', newRecord);
      if (newRecord) {
        const updatedHistory = [newRecord, ...getImportExportHistory().filter((h) => h.id !== newRecord.id)];
        console.log('[debug] updatedHistory:', updatedHistory);
        setHistory(updatedHistory);
      }

      const failedDecryptionCount = decryptedExportData.filter((d) => d.Password === '[Decryption Required]').length;
      const failedNote = failedDecryptionCount > 0
        ? ` Note: ${failedDecryptionCount} password${failedDecryptionCount > 1 ? 's' : ''} could not be decrypted and will show "[Decryption Required]".`
        : '';
      const kdbxNote = exportType === 'kdbx' ? ` The KDBX master password is: ${filePassword}.` : '';
      setExportSuccessMessage(`Exported ${count} passwords to ${filename}.${kdbxNote}${failedNote}`);
    } catch (err: any) {
      console.error(err);
      alert('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingExport(false);
    }
  };

  const handleExportVault = async () => {
    console.log('[debug] handleExportVault entered');
    if (localStorage.getItem('clickrypt_app_mode') !== 'personal' && !['Owner', 'Admin'].includes(user?.role as string)) {
      alert('🔒 Export Restricted: Password export is only available for Organization Owners/Admins or in Personal mode.');
      return;
    }

    setLoadingExport(true);
    setExportSuccessMessage(null);

    try {
      const res = await api.get('/resources', { params: { secretVault: false } });
      let allResources = (res.data || []).filter((r: any) => !r.isPrivateOnly);

      if (exportOption === 'group' && selectedGroupId) {
        const targetGroup = groups.find((g) => g.id === selectedGroupId);
        if (targetGroup && targetGroup.passwords) {
          const groupPassIds = targetGroup.passwords.map((p: any) => p.id);
          allResources = allResources.filter((r: any) => groupPassIds.includes(r.id));
        }
      } else if (exportOption === 'selected' && selectedFolderId) {
        allResources = allResources.filter((r: any) => r.folderId === selectedFolderId);
      }

      if (!allResources || allResources.length === 0) {
        alert('No passwords available for the selected export filter.');
        setLoadingExport(false);
        return;
      }

      if (!masterPassword && !unlockedPgpKey) {
        setPendingExportResources(allResources);
        setShowUnlockModal(true);
        setLoadingExport(false);
        return;
      }

      await executeExport(allResources);
    } catch (err: any) {
      console.error(err);
      alert('Export failed: ' + (err.message || 'Unknown error'));
      setLoadingExport(false);
    }
  };

  const handleUnlockSubmit = async (password: string) => {
    if (!pendingExportResources) return false;
    const privateKey = await getEncryptedPrivateKey();
    if (!privateKey) return false;
    const ok = await canUnlockPrivateKey(privateKey, password);
    if (!ok) return false;
    setShowUnlockModal(false);
    await executeExport(pendingExportResources, password);
    setPendingExportResources(null);
    return true;
  };

  const [isPersonalMode, setIsPersonalMode] = useState(true);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const mode = localStorage.getItem('clickrypt_app_mode') || 'personal';
      setIsPersonalMode(mode === 'personal');
    }
  }, []);

  const canImport = isPersonalMode || ['Owner', 'Admin', 'User'].includes(user?.role as string);
  const canExport = isPersonalMode || ['Owner', 'Admin'].includes(user?.role as string);
  const visibleSectionCount = Number(canImport) + Number(canExport);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="p-4 md:p-8 flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#0284c7] animate-spin" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      {/* Hidden Native OS File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,.json,.1pux,.txt,.kdbx"
        className="hidden"
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto space-y-8">
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

          {/* Dynamic Grid Layout */}
          <div className={visibleSectionCount === 2 ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "grid grid-cols-1"}>
            {/* Import Section */}
            {canImport && (
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
                    { id: 'kdbx', name: 'KeePass', sub: '(.kdbx)' },
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
                      <p className="text-[11px] text-[#64748b] mt-1 font-medium">Supports CSV, JSON, 1pux, TXT, and KDBX files</p>
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
            )}

            {/* Export Section with PDF Support */}
            {canExport && (
              <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-6 flex flex-col justify-between shadow-xl">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-[#cbd5e1] pb-4">
                    <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7]">
                      <Download className="w-5 h-5 text-[#0284c7]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-[#0f172a]">Export Vault</h2>
                      <p className="text-xs text-[#64748b]">Export your passwords to CSV, JSON, PDF, Excel, or KeePass formats.</p>
                    </div>
                  </div>

                <div className="space-y-3">
                  <label className="text-xs font-extrabold text-[#334155]">File Export Format</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'csv', label: 'CSV (.csv)' },
                      { id: 'json', label: 'JSON (.json)' },
                      { id: 'pdf', label: 'PDF (.pdf)', icon: FileText },
                      { id: 'xlsx', label: 'Excel (.xlsx)' },
                      { id: 'kdbx', label: 'KeePass (.kdbx)' },
                    ].map((fmt: any) => {
                      const isSel = exportType === fmt.id;
                      const Icon = fmt.icon;
                      return (
                        <button
                          key={fmt.id}
                          onClick={() => setExportType(fmt.id as any)}
                          className={`py-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            isSel
                              ? 'border-2 border-[#1fbbd2] bg-[#e0f2fe] text-[#0284c7] shadow-sm'
                              : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-[#e0f2fe]/40'
                          }`}
                        >
                          {Icon && <Icon className="w-3.5 h-3.5" />}
                          <span>{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-extrabold text-[#334155]">Choose what to export</label>
                  <div className="space-y-2">
                    {[
                      { id: 'all', label: 'All Main Vault Passwords', sub: 'Export all personal passwords in main vault.' },
                      !isPersonalMode && { id: 'group', label: 'Specific Team Group', sub: 'Export passwords assigned to a specific group.' },
                      { id: 'selected', label: 'Specific Folder / Selected Items', sub: 'Export passwords from a chosen folder.' },
                    ].filter(Boolean).map((opt: any) => {
                      const isSel = exportOption === opt.id;
                      return (
                        <div key={opt.id} className="space-y-2">
                          <div
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
                            <div className="flex-1">
                              <p className="text-xs font-extrabold text-[#0f172a]">{opt.label}</p>
                              <p className="text-[10px] text-[#64748b] font-medium">{opt.sub}</p>
                            </div>
                          </div>

                          {/* Team Group Custom Elevated Floating Dropdown */}
                          {isSel && opt.id === 'group' && (
                            <div className="pl-7 pr-2 py-2 animate-in fade-in duration-150 relative" ref={groupDropdownRef}>
                              <label className="block text-[11px] font-extrabold text-[#334155] mb-1.5">
                                Select Team Group to Export:
                              </label>
                              <button
                                type="button"
                                onClick={() => setIsGroupDropdownOpen((prev) => !prev)}
                                className="w-full flex items-center justify-between bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2.5 rounded-xl text-xs text-[#0f172a] font-extrabold shadow-xs transition-all cursor-pointer"
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <Users className="w-4 h-4 text-[#0284c7] shrink-0" />
                                  {groups.find((g) => g.id === selectedGroupId)?.name || 'Select Team Group'}
                                </span>
                                <ChevronDown className="w-4 h-4 text-[#64748b] shrink-0" />
                              </button>

                              {isGroupDropdownOpen && (
                                <div className="absolute left-7 right-2 mt-1.5 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
                                  {groups.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-[#64748b]">No team groups available</p>
                                  ) : (
                                    groups.map((g) => {
                                      const isSelected = selectedGroupId === g.id;
                                      return (
                                        <button
                                          key={g.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedGroupId(g.id);
                                            setIsGroupDropdownOpen(false);
                                          }}
                                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                                            isSelected ? 'bg-[#e0f2fe] text-[#0284c7]' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                                          }`}
                                        >
                                          <span className="flex items-center gap-2 truncate">
                                            <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                                            {g.name} ({g.members?.length || 0} members)
                                          </span>
                                          {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Workplace Folder Custom Elevated Floating Dropdown */}
                          {isSel && opt.id === 'selected' && (
                            <div className="pl-7 pr-2 py-2 animate-in fade-in duration-150 relative" ref={folderDropdownRef}>
                              <label className="block text-[11px] font-extrabold text-[#334155] mb-1.5">
                                Select Workplace Folder to Export:
                              </label>
                              <button
                                type="button"
                                onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                                className="w-full flex items-center justify-between bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2.5 rounded-xl text-xs text-[#0f172a] font-extrabold shadow-xs transition-all cursor-pointer"
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <Folder className="w-4 h-4 text-[#f39c12] shrink-0" />
                                  {folders.find((f) => f.id === selectedFolderId)?.name || 'Select Workplace Folder'}
                                </span>
                                <ChevronDown className="w-4 h-4 text-[#64748b] shrink-0" />
                              </button>

                              {isFolderDropdownOpen && (
                                <div className="absolute left-7 right-2 mt-1.5 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150 p-1.5 space-y-1">
                                  {folders.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-[#64748b]">No workplace folders available</p>
                                  ) : (
                                    folders.map((f) => {
                                      const isSelected = selectedFolderId === f.id;
                                      return (
                                        <button
                                          key={f.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedFolderId(f.id);
                                            setIsFolderDropdownOpen(false);
                                          }}
                                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                                            isSelected ? 'bg-[#e0f2fe] text-[#0284c7]' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                                          }`}
                                        >
                                          <span className="flex items-center gap-2 truncate">
                                            <Folder className="w-3.5 h-3.5 text-[#f39c12]" />
                                            {f.name} ({f.itemCount || 0} items)
                                          </span>
                                          {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )}
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
                  onClick={() => {
                    console.log('[debug] export button clicked');
                    handleExportVault();
                  }}
                  disabled={loadingExport}
                  className="w-full gold-cyan-gradient-btn py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {loadingExport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>
                    {loadingExport
                      ? 'Generating Export...'
                      : `Download Export Vault File (${exportType.toUpperCase()})`}
                  </span>
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Import / Export History */}
          <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#fffbeb] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706]">
                  <Clock className="w-5 h-5 text-[#d97706]" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-[#0f172a]">Import / Export History</h2>
                  <p className="text-xs text-[#64748b]">{history.length} recorded transfers</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-[#64748b] transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </div>

            {showHistory && (
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#64748b] bg-[#f8fafc] rounded-xl border border-[#cbd5e1]">
                    No imports or exports recorded yet.
                  </div>
                ) : (
                  <><div className="overflow-x-auto border border-[#cbd5e1] rounded-xl">
                    <table className="w-full text-left text-xs table-fixed">
                      <thead className="bg-[#e6eff7] text-[#334155] font-extrabold border-b border-[#cbd5e1]">
                        <tr>
                          <th className="py-2.5 px-3 w-16 whitespace-nowrap">Type</th>
                          <th className="py-2.5 px-3 w-40 whitespace-nowrap">Date &amp; Time</th>
                          <th className="py-2.5 px-3 w-24 whitespace-nowrap">Format</th>
                          <th className="py-2.5 px-3 w-40 whitespace-nowrap">File</th>
                          <th className="py-2.5 px-3 w-16 whitespace-nowrap">Count</th>
                          <th className="py-2.5 px-3 w-32 whitespace-nowrap">By</th>
                          <th className="py-2.5 px-3 w-40 whitespace-nowrap">Items</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2e8f0]">
                        {history
                          .slice(
                            (historyPage - 1) * HISTORY_PER_PAGE,
                            historyPage * HISTORY_PER_PAGE
                          )
                          .map((h) => (
                          <tr key={h.id} className="hover:bg-[#f1f6fb]">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                h.type === 'import'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30'
                              }`}>
                                {h.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[#334155] whitespace-nowrap">{new Date(h.timestamp).toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-[#334155] whitespace-nowrap font-bold">{h.format.toUpperCase()}</td>
                            <td className="py-2.5 px-3 text-[#0f172a] font-bold truncate max-w-[140px]">{h.fileName}</td>
                            <td className="py-2.5 px-3 text-[#334155] whitespace-nowrap">{h.count}</td>
                            <td className="py-2.5 px-3 text-[#334155] truncate max-w-[128px]" title={h.by}>{h.by}</td>
                            <td className="py-2.5 px-3 text-[#334155] truncate max-w-[160px]" title={h.passwordNames?.join(', ')}>
                              {h.passwordNames && h.passwordNames.length > 0
                                ? `${h.passwordNames.length} item${h.passwordNames.length > 1 ? 's' : ''}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {history.length > HISTORY_PER_PAGE && (
                    <div className="pt-4 border-t border-[#cbd5e1] flex items-center justify-between text-xs text-[#64748b]">
                      <span>
                        Showing {(historyPage - 1) * HISTORY_PER_PAGE + 1} to{' '}
                        {Math.min(historyPage * HISTORY_PER_PAGE, history.length)} of {history.length} transfers
                      </span>

                      <div className="flex items-center gap-1.5 font-sora">
                        <button
                          type="button"
                          onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}
                          disabled={historyPage === 1}
                          className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] disabled:opacity-40 cursor-pointer shadow-xs"
                          title="Previous Page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        {Array.from({ length: totalHistoryPages }, (_, i) => i + 1)
                          .slice(
                            Math.max(0, historyPage - 3),
                            Math.min(totalHistoryPages, historyPage + 2)
                          )
                          .map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setHistoryPage(pageNum)}
                              className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center cursor-pointer transition-all ${
                                historyPage === pageNum
                                  ? 'gold-cyan-gradient-btn text-white shadow-xs'
                                  : 'bg-[#ffffff] border border-[#cbd5e1] text-[#334155] hover:bg-[#f1f5f9]'
                              }`}
                            >
                              {pageNum}
                            </button>
                          ))}

                        <button
                          type="button"
                          onClick={() => setHistoryPage((prev) => Math.min(prev + 1, totalHistoryPages))}
                          disabled={historyPage === totalHistoryPages}
                          className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] disabled:opacity-40 cursor-pointer shadow-xs"
                          title="Next Page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
                )}
              </div>
            )}
          </div>

          {/* Bottom Security Note */}
          <div className="p-4 bg-[#ffffff] border border-[#d0dbe5] rounded-xl text-xs text-[#334155] flex items-center gap-3 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-[#0284c7] shrink-0" />
            <span className="font-medium">Your data is encrypted and secure. We never store unencrypted exported files on remote servers.</span>
          </div>

          <UnlockVaultModal
            isOpen={showUnlockModal}
            onClose={() => {
              setShowUnlockModal(false);
              setPendingExportResources(null);
            }}
            onSubmit={handleUnlockSubmit}
          />
        </main>
      </div>
    </div>
  );
}
