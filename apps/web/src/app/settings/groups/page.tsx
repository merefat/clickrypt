// @ts-nocheck
"use client";
/* eslint-disable */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session";
import GroupVault from "./GroupVaultV3";

export default function GroupsPage() {
  const router = useRouter();
  const { unlocked } = useSessionStore();

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
    }
  }, [unlocked, router]);

  return <GroupVault />;
}
