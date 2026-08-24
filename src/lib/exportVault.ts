/* eslint-disable @typescript-eslint/no-explicit-any */
import { decryptSecret } from './crypto';
import { resolveBestSecret } from './secretResolver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportRow {
  Title: string;
  Username: string;
  Password: string;
  URL: string;
  LastModified: string;
}

const HISTORY_KEY = 'clickrypt_import_export_history';
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 100000;
const EXPORT_COLUMNS: (keyof ExportRow)[] = ['Title', 'Username', 'Password', 'URL', 'LastModified'];

export async function buildDecryptedExportData(
  resources: any[],
  user: any,
  masterPassword: string | null | undefined,
  unlockedPgpKey: any,
  getEncryptedPrivateKey: (() => Promise<string | null>) | undefined
): Promise<ExportRow[]> {
  const privateKey = getEncryptedPrivateKey ? (await getEncryptedPrivateKey()) || '' : '';
  const decrypted: ExportRow[] = [];

  for (const r of resources) {
    let plainPass = '';
    const userSecret = resolveBestSecret(r, user?.id, user?.role);

    if (userSecret?.encryptedData) {
      try {
        plainPass = await decryptSecret(
          userSecret.encryptedData,
          privateKey,
          unlockedPgpKey ? undefined : masterPassword || undefined
        );
      } catch {
        plainPass = '[Decryption Required]';
      }
    }

    decrypted.push({
      Title: r.name || '',
      Username: r.username || '',
      Password: plainPass,
      URL: r.url || '',
      LastModified: r.lastModified || 'N/A',
    });
  }

  return decrypted;
}

function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytes(plaintext: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveAesKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as unknown as ArrayBuffer },
    key,
    plaintext.buffer as unknown as ArrayBuffer
  );
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export function generateExportPassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

const FORMULA_START_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutralizeFormulaStart(value: string): string {
  const first = value.charAt(0);
  return FORMULA_START_CHARS.has(first) ? `'${value}` : value;
}

function sanitizeCsvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  const neutral = neutralizeFormulaStart(escaped);
  return `"${neutral}"`;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function buildEncryptedHtmlExport(
  originalBytes: Uint8Array,
  originalFileName: string,
  originalMime: string,
  filePassword: string
): Promise<string> {
  const { salt, iv, ciphertext } = await encryptBytes(originalBytes, filePassword);
  const payload = { salt, iv, ciphertext, filename: originalFileName, mime: originalMime };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(originalFileName)} - Clickrypt Encrypted Export</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }
  .card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 1rem;
    padding: 2rem;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05);
  }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem 0; }
  p { color: #64748b; font-size: 0.85rem; margin: 0.25rem 0; }
  strong { color: #0f172a; }
  input {
    width: 100%;
    padding: 0.75rem;
    margin: 1.25rem 0 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    font-size: 0.9rem;
  }
  button {
    width: 100%;
    padding: 0.75rem;
    background: #0284c7;
    color: #ffffff;
    border: none;
    border-radius: 0.5rem;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button:hover { background: #0369a1; }
  #msg {
    margin-top: 0.75rem;
    font-size: 0.8rem;
    min-height: 1.2rem;
    color: #ef4444;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Clickrypt Encrypted Export</h1>
    <p>Original file: <strong>${escapeHtml(originalFileName)}</strong></p>
    <p>Enter the export password to unlock and download the original file.</p>
    <input type="password" id="pw" placeholder="Export password" autocomplete="off">
    <button id="btn">Open &amp; Download</button>
    <p id="msg"></p>
  </div>
  <script>
    const payload = ${JSON.stringify(payload)};
    function base64ToBytes(b64) {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    async function deriveKey(password, salt) {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    }
    async function openFile() {
      const password = document.getElementById('pw').value;
      const msg = document.getElementById('msg');
      try {
        const key = await deriveKey(password, base64ToBytes(payload.salt));
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
          key,
          base64ToBytes(payload.ciphertext)
        );
        const blob = new Blob([pt], { type: payload.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = payload.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        msg.style.color = '#10b981';
        msg.textContent = 'Unlocked. Your original file download should begin shortly.';
      } catch (e) {
        msg.style.color = '#ef4444';
        msg.textContent = 'Incorrect password or the file is corrupted.';
      }
    }
    document.getElementById('btn').addEventListener('click', openFile);
    document.getElementById('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') openFile(); });
  </script>
</body>
</html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getOriginalMime(format: string): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'pdf':
      return 'application/pdf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'kdbx':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

export async function exportPasswords(
  data: ExportRow[],
  format: 'csv' | 'json' | 'pdf' | 'xlsx' | 'kdbx',
  user: any
): Promise<{ filename: string; count: number; filePassword?: string; originalFormat: string }> {
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `clickrypt_vault_export_${timestampStr}`;
  const count = data.length;
  const filePassword = generateExportPassword();

  if (format === 'json') {
    const fileContent = JSON.stringify(
      data.map((d) => ({ Title: d.Title, Username: d.Username, Password: d.Password, URL: d.URL, LastModified: d.LastModified })),
      null,
      2
    );
    const originalBytes = new TextEncoder().encode(fileContent);
    const originalFileName = `${baseName}.json`;
    downloadBlob(new Blob([originalBytes], { type: getOriginalMime(format) }), originalFileName);
    return { filename: originalFileName, count, originalFormat: format };
  }

  if (format === 'csv') {
    const csvHeaders = EXPORT_COLUMNS;
    const csvRows = [csvHeaders.join(',')];
    data.forEach((d) => {
      const row = [
        sanitizeCsvField(d.Title),
        sanitizeCsvField(d.Username),
        sanitizeCsvField(d.Password),
        sanitizeCsvField(d.URL),
        sanitizeCsvField(d.LastModified),
      ];
      csvRows.push(row.join(','));
    });
    const fileContent = csvRows.join('\r\n');
    const originalBytes = new TextEncoder().encode(fileContent);
    const originalFileName = `${baseName}.csv`;
    downloadBlob(new Blob([originalBytes], { type: getOriginalMime(format) }), originalFileName);
    return { filename: originalFileName, count, originalFormat: format };
  }

  if (format === 'pdf') {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFillColor(31, 187, 210);
    doc.rect(0, 0, 297, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CLICKRYPT OPENPGP ZERO-KNOWLEDGE VAULT EXPORT', 14, 15);
    doc.setTextColor(240, 248, 255);
    doc.setFontSize(9);
    doc.text(
      `Generated for ${user?.name || 'User'} (${user?.email || ''}) • Total Items: ${data.length} • Date: ${new Date().toLocaleString()}`,
      14,
      21
    );
    const head = [['Title', 'Username', 'Password', 'URL', 'Last Modified']];
    const body = data.map((d) => [d.Title, d.Username, d.Password, d.URL, d.LastModified]);
    autoTable(doc, {
      startY: 28,
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [31, 187, 210],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fillColor: [255, 255, 255], textColor: [15, 23, 42], fontSize: 8.5 },
      alternateRowStyles: { fillColor: [245, 248, 251] },
      margin: { top: 28, left: 14, right: 14, bottom: 18 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 45 },
        2: { cellWidth: 50 },
        3: { cellWidth: 80 },
        4: { cellWidth: 35 },
      },
    });
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${i} of ${pageCount} • Clickrypt OpenPGP Vault Export • Strictly Confidential`, 14, 202);
    }
    const pdfArray = doc.output('arraybuffer') as ArrayBuffer;
    const originalBytes = new Uint8Array(pdfArray);
    const originalFileName = `${baseName}.pdf`;
    downloadBlob(new Blob([originalBytes], { type: getOriginalMime(format) }), originalFileName);
    return { filename: originalFileName, count, originalFormat: format };
  }

  if (format === 'xlsx') {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = (xlsxModule as any).default || xlsxModule;
      const sanitizedData = data.map((d) => ({
        Title: neutralizeFormulaStart(d.Title),
        Username: neutralizeFormulaStart(d.Username),
        Password: neutralizeFormulaStart(d.Password),
        URL: neutralizeFormulaStart(d.URL),
        LastModified: neutralizeFormulaStart(d.LastModified),
      }));
      const ws = XLSX.utils.json_to_sheet(sanitizedData);
      ws['!cols'] = [
        { wch: 28 },
        { wch: 26 },
        { wch: 28 },
        { wch: 40 },
        { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Passwords');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const originalBytes = new Uint8Array(out as ArrayBuffer);
      const originalFileName = `${baseName}.xlsx`;
      downloadBlob(new Blob([originalBytes], { type: getOriginalMime(format) }), originalFileName);
      return { filename: originalFileName, count, originalFormat: format };
    } catch (err: any) {
      throw new Error('XLSX export failed: ' + (err?.message || 'unknown error'));
    }
  }

  if (format === 'kdbx') {
    try {
      const kdbxwebModule = await import('kdbxweb');
      const kdbxweb = (kdbxwebModule as any).default || kdbxwebModule;
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(filePassword));
      const db = kdbxweb.Kdbx.create(credentials, 'Clickrypt Export');
      db.setKdf(kdbxweb.Consts.KdfId.Aes);
      const group = db.getDefaultGroup();
      data.forEach((d) => {
        const entry = db.createEntry(group);
        entry.fields.set('Title', d.Title);
        entry.fields.set('UserName', d.Username);
        entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(d.Password));
        entry.fields.set('URL', d.URL);
        entry.times.update();
      });
      const saved = await db.save();
      const blob = new Blob([saved], { type: 'application/octet-stream' });
      const filename = `${baseName}.kdbx`;
      downloadBlob(blob, filename);
      return { filename, count, filePassword, originalFormat: format };
    } catch (err: any) {
      throw new Error('KDBX export failed: ' + (err?.message || 'unknown error'));
    }
  }

  return { filename: baseName, count, originalFormat: format };
}

export interface ImportExportRecord {
  id: string;
  type: 'import' | 'export';
  timestamp: string;
  fileName: string;
  format: string;
  count: number;
  by: string;
  passwordNames?: string[];
}

export function getImportExportHistory(): ImportExportRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addImportExportHistory(record: Omit<ImportExportRecord, 'id' | 'timestamp'>) {
  if (typeof window === 'undefined') return;
  const history = getImportExportHistory();
  const fullRecord: ImportExportRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  history.unshift(fullRecord);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  return fullRecord;
}
