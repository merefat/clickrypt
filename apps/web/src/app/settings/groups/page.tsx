// @ts-nocheck
"use client";
/* eslint-disable */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, clearCallbackUrl } from "@/stores/session";
import { useSessionRestore } from "@/hooks/useSessionRestore";
import { ReUnlockDialog } from "@/components/ReUnlockDialog";
import GroupVault from "./GroupVaultV3";

export default function GroupsPage() {
  const router = useRouter();
  const { unlocked } = useSessionStore();
  const [showReUnlock, setShowReUnlock] = useState(false);

  const { status: restoreStatus } = useSessionRestore();

  useEffect(() => {
    if (restoreStatus === "locked") {
      setShowReUnlock(true);
    }
  }, [restoreStatus]);

  if (showReUnlock) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ReUnlockDialog onClose={() => { setShowReUnlock(false); router.push("/login"); }} onUnlocked={() => { setShowReUnlock(false); clearCallbackUrl(); }} />
      </div>
    );
  }

  return <GroupVault />;
}
