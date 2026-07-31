export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm text-[#c4d4e0]">{label}{required && <span className="text-[#f89c11]"> *</span>}</label>{children}</div>;
}
