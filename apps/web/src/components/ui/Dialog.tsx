import { X } from "lucide-react";

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center md:justify-center md:p-4" onClick={onClose}>
      <div className="w-full rounded-t-2xl md:max-w-md md:rounded-2xl border border-[#2a4055] bg-[#1a3349] p-6 shadow-2xl h-[92%] md:h-auto overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="text-[#8ba3b8] hover:text-[#c4d4e0]"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
