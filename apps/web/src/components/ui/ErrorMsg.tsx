import { AlertCircle } from "lucide-react";

export function ErrorMsg({ msg }: { msg: string }) {
  return <p className="flex items-center gap-2 text-sm text-[#f89c11]"><AlertCircle className="h-4 w-4" />{msg}</p>;
}
