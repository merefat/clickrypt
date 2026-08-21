'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface FilterDropdownProps {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  icon?: React.ComponentType<{ className?: string }>;
  placeholder?: string;
  className?: string;
}

export default function FilterDropdown({
  value,
  options,
  onChange,
  icon,
  placeholder = 'Select',
  className = '',
}: FilterDropdownProps) {
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

  const selectedOption = options.find((o) => o.value === value) || options[0];
  const selectedLabel = selectedOption?.label || placeholder;
  const LeadingIcon = icon;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="min-w-[120px] flex items-center justify-between gap-2 bg-[#ffffff] hover:bg-[#f8fafc] border border-[#cbd5e1] hover:border-[#1fbbd2] px-3.5 py-2 rounded-xl text-xs font-extrabold text-[#0f172a] shadow-sm transition-all cursor-pointer"
      >
        <span className="flex items-center gap-2 truncate">
          {LeadingIcon && <LeadingIcon className="w-4 h-4 text-[#f39c12] shrink-0" />}
          <span className="truncate">{selectedLabel}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#64748b] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#ffffff] border border-[#cbd5e1] rounded-2xl shadow-xl z-50 overflow-hidden p-1.5 space-y-1">
          {options.map((option) => {
            const isSelected = option.value === value;
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#e0f2fe] text-[#0284c7]' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {OptionIcon && <OptionIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#0284c7]' : 'text-[#64748b]'}`} />}
                  <span className="truncate">{option.label}</span>
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
