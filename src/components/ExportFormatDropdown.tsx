'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, FileSpreadsheet, FileCode, FileText, Table, Lock } from 'lucide-react';

export type ExportFormat = 'csv' | 'json' | 'pdf' | 'xlsx' | 'kdbx';

interface FormatOption {
  id: ExportFormat;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FORMATS: FormatOption[] = [
  { id: 'csv', label: 'CSV', sub: '(.csv)', icon: FileSpreadsheet },
  { id: 'json', label: 'JSON', sub: '(.json)', icon: FileCode },
  { id: 'pdf', label: 'PDF', sub: '(.pdf)', icon: FileText },
  { id: 'xlsx', label: 'Excel', sub: '(.xlsx)', icon: Table },
  { id: 'kdbx', label: 'KeePass', sub: '(.kdbx)', icon: Lock },
];

interface ExportFormatDropdownProps {
  value: ExportFormat;
  onChange: (value: ExportFormat) => void;
  className?: string;
}

export default function ExportFormatDropdown({ value, onChange, className = '' }: ExportFormatDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = FORMATS.find((f) => f.id === value) || FORMATS[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="min-w-[140px] flex items-center justify-between gap-2 bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2 rounded-xl text-xs font-extrabold text-[#0f172a] shadow-sm transition-all cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <SelectedIcon className="w-4 h-4 text-[#0284c7] shrink-0" />
          <span>{selectedOption.label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#64748b] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden p-1.5 space-y-1">
          {FORMATS.map((fmt) => {
            const isSelected = fmt.id === value;
            const Icon = fmt.icon;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => {
                  onChange(fmt.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#e0f2fe] text-[#0284c7]' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#0284c7]' : 'text-[#64748b]'}`} />
                  <span className="truncate">{fmt.label}</span>
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-[#0284c7]/80' : 'text-[#64748b]'}`}>
                    {fmt.sub}
                  </span>
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
