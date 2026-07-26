"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";

export default function RegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiClient
      .getSetupStatus()
      .then((s) => {
        if (s.needsSetup) {
          router.replace("/onboarding");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        router.replace("/onboarding");
      })
      .finally(() => setChecking(false));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      {checking && <Loader2 className="h-8 w-8 animate-spin text-brand-500" />}
    </div>
  );
}
