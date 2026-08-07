"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      router.replace(`/setup?token=${encodeURIComponent(token)}`);
      setChecking(false);
      return;
    }

    router.replace("/onboarding");
    setChecking(false);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      {checking && <Loader2 className="h-8 w-8 animate-spin text-brand-500" />}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}
