'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface SortableListItemProps {
  id: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  data?: Record<string, unknown>;
  isOver?: boolean;
  children: React.ReactNode;
}

export function SortableListItem({
  id,
  className,
  disabled,
  onClick,
  data,
  isOver,
  children,
}: SortableListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled, data });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className || ''} flex items-center gap-2 ${isOver ? 'ring-2 ring-[#1fbbd2] bg-cyan-50' : ''}`}
      onClick={onClick}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-1 text-gray-400 hover:text-[#0284c7] cursor-grab active:cursor-grabbing shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export interface SortableTableRowProps {
  id: string;
  className?: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  children: React.ReactNode;
}

export function SortableTableRow({
  id,
  className,
  disabled,
  data,
  children,
}: SortableTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled, data });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <tr ref={setNodeRef} style={style} className={className}>
      <td className="py-4 px-2 w-10">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-[#0284c7] cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      {children}
    </tr>
  );
}
