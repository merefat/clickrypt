"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Camera,
  Clock,
  Mail,
  Pencil,
  Phone,
  Save,
  Trash2,
  User as UserIcon,
  X,
  UserCircle,
  KeyRound,
  Lock,
  ShieldCheck,
  Fingerprint,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Hash,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  Monitor,
  Smartphone,
} from "lucide-react";
import * as openpgp from "openpgp";
import {
  apiClient,
  ApiError,
  type UserProfile,
  type SessionInfo,
} from "@/lib/api/client";
import { useSessionStore, getStoredEmail } from "@/stores/session";
import {
  encryptWithPassphrase,
  decryptWithPassphrase,
  type EncryptedBlob,
} from "@clickrypt/crypto";
import zxcvbn from "zxcvbn";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const LOAD_TIMEOUT_MS = 10_000;

type TabKey = "profile" | "keys" | "passphrase" | "security";

interface KeyDetails {
  fingerprint: string;
  keyId: string;
  algorithm: string;
  curve: string;
  created: Date;
  expires: Date | null;
  revoked: boolean;
  userIDs: { name: string; email: string }[];
  status: "valid" | "expired" | "revoked";
}

const navItems: { key: TabKey; label: string; icon: typeof UserCircle }[] = [
  { key: "profile", label: "Profile", icon: UserCircle },
  { key: "keys", label: "Keys", icon: KeyRound },
  { key: "passphrase", label: "Passphrase", icon: Lock },
  { key: "security", label: "Security", icon: ShieldCheck },
];

function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session has expired. Please log in again.";
    if (err.status >= 500) return "Server error. Please try again.";
    return err.message || "Request failed.";
  }
  if (err instanceof Error) return err.message;
  return "Failed. Please try again.";
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUri = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUri);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function getInitials(firstName: string, lastName: string): string {
  const a = firstName?.charAt(0)?.toUpperCase() ?? "";
  const b = lastName?.charAt(0)?.toUpperCase() ?? "";
  return (a + b) || "?";
}

function formatDateStr(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatDateObj(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFingerprint(fp: string): string {
  return fp.replace(/(.{4})/g, "$1 ").trim();
}

function getStrength(score: number): { label: string; color: string; width: string } {
  const map = [
    { label: "Very weak", color: "#ef4444", width: "20%" },
    { label: "Weak", color: "#f89c11", width: "40%" },
    { label: "Fair", color: "#eab308", width: "60%" },
    { label: "Good", color: "#1ebbd4", width: "80%" },
    { label: "Strong", color: "#22c55e", width: "100%" },
  ];
  return map[score] || map[0];
}

function getDeviceIcon(deviceInfo: string | null) {
  if (!deviceInfo) return Monitor;
  const lower = deviceInfo.toLowerCase();
  if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
    return Smartphone;
  }
  return Monitor;
}

export default function ProfilePage() {
  const router = useRouter();
  const { unlocked, setAvatar, email: sessionEmail } = useSessionStore();
  const storedEmail = getStoredEmail();
  const email = sessionEmail || storedEmail;
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [loading, setLoading] = useState(true);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keys state
  const [keyDetails, setKeyDetails] = useState<KeyDetails | null>(null);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);

  // Passphrase state
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passToast, setPassToast] = useState<string | null>(null);

  // Security state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsToast, setSessionsToast] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const strength = newPass ? zxcvbn(newPass) : null;
  const strengthInfo = strength ? getStrength(strength.score) : null;
  const passes = newPass.length >= 12 && strength && strength.score >= 2;
  const matches = newPass === confirmPass && newPass.length > 0;
  const canSubmit = currentPass.length > 0 && passes && matches && !passBusy;

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
      return;
    }
    cancelledRef.current = false;
    const timeout = setTimeout(() => {
      if (!cancelledRef.current) {
        setKeysError("Loading timed out. Please refresh the page.");
        setKeysLoading(false);
      }
    }, LOAD_TIMEOUT_MS);

    Promise.all([
      apiClient.me(),
      apiClient.getMyPublicKey(),
      apiClient.listSessions(),
    ])
      .then(async ([me, keyData, sess]) => {
        if (cancelledRef.current) return;
        setProfile(me);
        setFirstName(me.firstName);
        setLastName(me.lastName);
        setJobTitle(me.jobTitle ?? "");
        setPhone(me.phone ?? "");
        setBio(me.bio ?? "");
        setTimezone(me.timezone ?? "");
        setAvatarPreview(me.avatarBase64);
        setAvatar(me.avatarBase64);
        setSessions(sess);
        setSessionsLoading(false);

        try {
          const key = await openpgp.readKey({ armoredKey: keyData.publicKey });
          if (cancelledRef.current) return;

          const created = key.getCreationTime();
          let expires: Date | null = null;
          try {
            const expirationTime = await key.getExpirationTime();
            expires = expirationTime instanceof Date && !isNaN(expirationTime.getTime()) ? expirationTime : null;
          } catch {
            expires = null;
          }
          let isRevoked = false;
          try {
            isRevoked = await key.isRevoked();
          } catch {
            isRevoked = false;
          }
          const now = new Date();
          const status: KeyDetails["status"] = isRevoked
            ? "revoked"
            : expires && expires < now
            ? "expired"
            : "valid";

          const algoInfo = key.getAlgorithmInfo();
          const userIDs = key.getUserIDs().map((uid: string) => {
            const match = uid.match(/^(.*) <(.*)>$/);
            if (match) return { name: match[1], email: match[2] };
            return { name: uid, email: "" };
          });

          setKeyDetails({
            fingerprint: key.getFingerprint().toUpperCase(),
            keyId: key.getKeyID().toHex().toUpperCase(),
            algorithm: algoInfo.algorithm,
            curve: algoInfo.curve || "N/A",
            created,
            expires,
            revoked: !!isRevoked,
            userIDs,
            status,
          });
        } catch {
          setKeysError("Failed to parse your PGP key. The stored key may be corrupted.");
        }
      })
      .catch((err) => {
        setError(formatApiError(err));
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
        setKeysLoading(false);
      });

    return () => {
      cancelledRef.current = true;
      clearTimeout(timeout);
    };
  }, [unlocked, router, setAvatar]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file must be smaller than 5MB before processing.");
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    try {
      const dataUri = await resizeImage(file, 256);
      setAvatarPreview(dataUri);
    } catch {
      setError("Failed to process image. Please try a different file.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemoveAvatar() {
    setAvatarPreview(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, string | undefined> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        jobTitle: jobTitle.trim() || undefined,
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        timezone: timezone || undefined,
      };

      if (avatarPreview !== profile?.avatarBase64) {
        if (avatarPreview) {
          data.avatarBase64 = avatarPreview;
        } else if (profile?.avatarBase64) {
          await apiClient.removeAvatar();
        }
      }

      const updated = await apiClient.updateProfile(data);
      setProfile(updated);
      setAvatar(updated.avatarBase64);
      setEditing(false);
      showToast("Profile updated successfully");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setJobTitle(profile.jobTitle ?? "");
      setPhone(profile.phone ?? "");
      setBio(profile.bio ?? "");
      setTimezone(profile.timezone ?? "");
      setAvatarPreview(profile.avatarBase64);
    }
    setEditing(false);
    setError(null);
  }

  function copyFingerprint() {
    if (keyDetails) {
      navigator.clipboard.writeText(keyDetails.fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handlePassphraseSubmit() {
    if (!canSubmit || !email) return;
    setPassBusy(true);
    setPassError(null);
    try {
      const challenge = await apiClient.verify(email);
      const privateKey = await decryptWithPassphrase(
        challenge.encryptedPrivateKey as EncryptedBlob,
        currentPass
      );
      const newBlob = await encryptWithPassphrase(privateKey, newPass);
      await apiClient.updatePassphrase(newBlob as unknown as Record<string, unknown>);
      setPassToast("Passphrase updated successfully!");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
      setTimeout(() => setPassToast(null), 2500);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Decryption failed")) {
        setPassError("Current passphrase is incorrect.");
      } else {
        setPassError(formatApiError(err));
      }
    } finally {
      setPassBusy(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    if (!confirm("Revoke this session? The device will need to log in again.")) return;
    setRevokingId(sessionId);
    setSessionsError(null);
    try {
      await apiClient.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionsToast("Session revoked.");
      setTimeout(() => setSessionsToast(null), 2500);
    } catch (err) {
      setSessionsError(formatApiError(err));
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Failed to load profile.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-[#2a4055] bg-[#17293c] px-4 py-6">
        <button
          onClick={() => router.push("/vault")}
          className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Vault
        </button>

        <h3 className="mb-3 text-xs font-semibold uppercase text-[#8ba3b8]">Settings</h3>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-brand-600/20 text-brand-500"
                    : "text-[#8ba3b8] hover:bg-[#213548]/50 hover:text-[#e2e8f0]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "profile" && (
          <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
            <div className="mb-8 flex items-center gap-3">
              <UserIcon className="h-6 w-6 text-brand-500" />
              <h1 className="text-2xl font-bold">My Profile</h1>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
                {error}
              </div>
            )}

            {toast && (
              <div className="mb-4 rounded-lg border border-[#1ebbd4] bg-[#1ebbd4]/20 px-4 py-2 text-sm text-[#1ebbd4]">
                {toast}
              </div>
            )}

            {/* Avatar Section */}
            <div className="mb-6 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
              <div className="flex items-center gap-6">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="h-24 w-24 rounded-full object-cover border-2 border-[#2a4055]"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#213548] border-2 border-[#2a4055] text-2xl font-bold text-brand-500">
                    {getInitials(profile.firstName, profile.lastName)}
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">
                    {profile.firstName} {profile.lastName}
                  </h2>
                  <p className="text-sm text-[#8ba3b8]">{profile.email}</p>
                  {editing && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {uploadingAvatar ? "Processing…" : "Upload"}
                      </button>
                      {avatarPreview && (
                        <button
                          onClick={handleRemoveAvatar}
                          className="flex items-center gap-1.5 rounded-lg border border-[#f89c11] px-3 py-1.5 text-sm text-[#f89c11] hover:bg-[#f89c11]/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Details */}
            <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
              {!editing ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-[#2a4055] px-3 py-1.5 text-sm text-[#c4d4e0] hover:bg-[#213548]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Profile
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">First Name</label>
                      <p className="text-sm text-[#e2e8f0]">{profile.firstName}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Last Name</label>
                      <p className="text-sm text-[#e2e8f0]">{profile.lastName}</p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                      <Mail className="h-3 w-3" /> Email
                    </label>
                    <p className="text-sm text-[#e2e8f0]">{profile.email}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <Briefcase className="h-3 w-3" /> Job Title
                      </label>
                      <p className="text-sm text-[#e2e8f0]">{profile.jobTitle || "—"}</p>
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <Phone className="h-3 w-3" /> Phone
                      </label>
                      <p className="text-sm text-[#e2e8f0]">{profile.phone || "—"}</p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                      <Clock className="h-3 w-3" /> Timezone
                    </label>
                    <p className="text-sm text-[#e2e8f0]">{profile.timezone || "—"}</p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Bio</label>
                    <p className="text-sm text-[#e2e8f0] whitespace-pre-wrap">{profile.bio || "—"}</p>
                  </div>

                  <div className="border-t border-[#2a4055] pt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Role</label>
                        <div className="flex gap-2">
                          <span className="rounded-full bg-brand-600/20 px-2.5 py-0.5 text-xs font-medium text-brand-500">
                            {profile.role}
                          </span>
                          <span className="rounded-full bg-[#213548] px-2.5 py-0.5 text-xs font-medium text-[#c4d4e0]">
                            {profile.orgRole}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Status</label>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${profile.status === "ACTIVE" ? "bg-[#1ebbd4]/20 text-[#1ebbd4]" : "bg-[#f89c11]/20 text-[#f89c11]"}`}>
                          {profile.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {profile.fingerprint && (
                    <div className="border-t border-[#2a4055] pt-4">
                      <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">PGP Fingerprint</label>
                      <code className="block break-all font-mono text-xs text-[#8ba3b8]">{profile.fingerprint}</code>
                    </div>
                  )}

                  <div className="border-t border-[#2a4055] pt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Member Since</label>
                    <p className="text-sm text-[#e2e8f0]">{formatDateStr(profile.createdAt)}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-[#c4d4e0]">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-[#c4d4e0]">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-sm text-[#c4d4e0]">
                      <Mail className="h-3.5 w-3.5" /> Email (read-only)
                    </label>
                    <input
                      type="text"
                      value={profile.email}
                      disabled
                      className="w-full rounded-lg border border-[#2a4055] bg-[#17293c] px-3 py-2 text-sm text-[#8ba3b8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-sm text-[#c4d4e0]">
                        <Briefcase className="h-3.5 w-3.5" /> Job Title
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={200}
                        placeholder="Senior Engineer"
                        className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-sm text-[#c4d4e0]">
                        <Phone className="h-3.5 w-3.5" /> Phone
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        maxLength={50}
                        placeholder="+1-555-0100"
                        className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-sm text-[#c4d4e0]">
                      <Clock className="h-3.5 w-3.5" /> Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Select timezone…</option>
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-[#c4d4e0]">Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={2000}
                      rows={4}
                      placeholder="Tell us about yourself…"
                      className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
                    />
                    <p className="mt-1 text-xs text-[#8ba3b8]">{bio.length}/2000 characters</p>
                  </div>

                  <div className="flex gap-2 border-t border-[#2a4055] pt-4">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg border border-[#2a4055] px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#213548] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "keys" && (
          <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
            <div className="mb-8 flex items-center gap-3">
              <KeyRound className="h-6 w-6 text-brand-500" />
              <h1 className="text-2xl font-bold">Keys Inspector</h1>
            </div>

            {keysLoading && (
              <p className="text-[#8ba3b8]">Loading keys…</p>
            )}

            {keysError && (
              <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
                {keysError}
              </div>
            )}

            {keyDetails && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                  <div className="mb-4 flex items-center gap-3">
                    {keyDetails.status === "valid" ? (
                      <CheckCircle2 className="h-8 w-8 text-[#1ebbd4]" />
                    ) : (
                      <XCircle className="h-8 w-8 text-[#f89c11]" />
                    )}
                    <div>
                      <p className="text-lg font-semibold">
                        {keyDetails.status === "valid"
                          ? "Key is valid"
                          : keyDetails.status === "expired"
                          ? "Key has expired"
                          : "Key is revoked"}
                      </p>
                      <p className="text-sm text-[#8ba3b8]">
                        {keyDetails.algorithm} · {keyDetails.curve}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-brand-500" />
                    <label className="text-xs font-semibold uppercase text-[#8ba3b8]">Fingerprint</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-sm text-[#e2e8f0]">
                      {formatFingerprint(keyDetails.fingerprint)}
                    </code>
                    <button
                      onClick={copyFingerprint}
                      className="rounded-lg border border-[#2a4055] p-2 text-[#8ba3b8] hover:bg-[#213548] hover:text-[#e2e8f0]"
                      title="Copy fingerprint"
                    >
                      {copied ? <Check className="h-4 w-4 text-[#1ebbd4]" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                  <h2 className="mb-4 font-semibold">Key Details</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <Hash className="h-3 w-3" /> Key ID
                      </div>
                      <p className="font-mono text-sm text-[#e2e8f0]">{keyDetails.keyId}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <KeyRound className="h-3 w-3" /> Algorithm
                      </div>
                      <p className="text-sm text-[#e2e8f0]">{keyDetails.algorithm}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <KeyRound className="h-3 w-3" /> Curve
                      </div>
                      <p className="text-sm text-[#e2e8f0]">{keyDetails.curve}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <Calendar className="h-3 w-3" /> Created
                      </div>
                      <p className="text-sm text-[#e2e8f0]">{formatDateObj(keyDetails.created)}</p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <Calendar className="h-3 w-3" /> Expires
                      </div>
                      <p className="text-sm text-[#e2e8f0]">
                        {keyDetails.expires ? formatDateObj(keyDetails.expires) : "No expiration"}
                      </p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-[#8ba3b8]">
                        <CheckCircle2 className="h-3 w-3" /> Status
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          keyDetails.status === "valid"
                            ? "bg-[#1ebbd4]/20 text-[#1ebbd4]"
                            : "bg-[#f89c11]/20 text-[#f89c11]"
                        }`}
                      >
                        {keyDetails.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                  <h2 className="mb-4 font-semibold">User IDs</h2>
                  <div className="space-y-3">
                    {keyDetails.userIDs.map((uid, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-[#213548]/50 p-3">
                        <UserIcon className="h-4 w-4 text-brand-500" />
                        <div>
                          <p className="text-sm text-[#e2e8f0]">{uid.name}</p>
                          {uid.email && <p className="text-xs text-[#8ba3b8]">{uid.email}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {profile?.fingerprint && (
                  <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                    <h2 className="mb-4 font-semibold">Server Record</h2>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Stored Fingerprint</label>
                        <code className="block break-all font-mono text-xs text-[#8ba3b8]">{profile.fingerprint}</code>
                      </div>
                      <div className="border-t border-[#2a4055] pt-2">
                        <label className="mb-1 block text-xs font-semibold uppercase text-[#8ba3b8]">Member Since</label>
                        <p className="text-sm text-[#e2e8f0]">{formatDateObj(new Date(profile.createdAt))}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "passphrase" && (
          <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
            <div className="mb-8 flex items-center gap-3">
              <Lock className="h-6 w-6 text-brand-500" />
              <h1 className="text-2xl font-bold">Change Passphrase</h1>
            </div>

            {passError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {passError}
              </div>
            )}

            {passToast && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#1ebbd4] bg-[#1ebbd4]/20 px-4 py-2 text-sm text-[#1ebbd4]">
                <Check className="h-4 w-4 flex-shrink-0" /> {passToast}
              </div>
            )}

            <div className="mb-6 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 flex-shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-medium">How it works</p>
                  <p className="mt-1 text-sm text-[#8ba3b8]">
                    Your master passphrase encrypts your PGP private key. Changing it re-encrypts
                    your private key with the new passphrase. The server never sees either passphrase.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Current Passphrase</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none"
                    placeholder="Enter your current passphrase"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba3b8] hover:text-[#e2e8f0]"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">New Passphrase</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full rounded-lg border border-[#2a4055] bg-[#1a3349] px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:outline-none"
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba3b8] hover:text-[#e2e8f0]"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {strengthInfo && newPass.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a4055]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: strengthInfo.width, backgroundColor: strengthInfo.color }}
                      />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: strengthInfo.color }}>
                      {strengthInfo.label}
                      {strength && strength.feedback && strength.feedback.warning
                        ? ` — ${strength.feedback.warning}`
                        : ""}
                    </p>
                  </div>
                )}
                {newPass.length > 0 && newPass.length < 12 && (
                  <p className="mt-1 text-xs text-[#f89c11]">
                    Use at least 12 characters for better security.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Confirm New Passphrase</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none ${
                      confirmPass.length > 0 && !matches
                        ? "border-[#f89c11] bg-[#f89c11]/10"
                        : "border-[#2a4055] bg-[#1a3349] focus:border-brand-500"
                    }`}
                    placeholder="Re-enter new passphrase"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba3b8] hover:text-[#e2e8f0]"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPass.length > 0 && !matches && (
                  <p className="mt-1 text-xs text-[#f89c11]">Passphrases do not match.</p>
                )}
                {confirmPass.length > 0 && matches && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-[#1ebbd4]">
                    <Check className="h-3 w-3" /> Passphrases match.
                  </p>
                )}
              </div>

              <div className="flex gap-2 border-t border-[#2a4055] pt-4">
                <button
                  onClick={handlePassphraseSubmit}
                  disabled={!canSubmit}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  {passBusy ? "Updating…" : "Update Passphrase"}
                </button>
                <button
                  onClick={() => { setCurrentPass(""); setNewPass(""); setConfirmPass(""); setPassError(null); }}
                  disabled={passBusy}
                  className="rounded-lg border border-[#2a4055] px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#213548] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
            <div className="mb-8 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-brand-500" />
              <h1 className="text-2xl font-bold">Security Token</h1>
            </div>

            {sessionsLoading && (
              <p className="text-[#8ba3b8]">Loading sessions…</p>
            )}

            {sessionsError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {sessionsError}
              </div>
            )}

            {sessionsToast && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#1ebbd4] bg-[#1ebbd4]/20 px-4 py-2 text-sm text-[#1ebbd4]">
                <Check className="h-4 w-4 flex-shrink-0" /> {sessionsToast}
              </div>
            )}

            {!sessionsLoading && (() => {
              const currentSession = sessions.find((s) => s.isCurrent);
              return (
                <>
                  {currentSession && (
                    <div className="mb-6 rounded-xl border border-[#1ebbd4]/30 bg-[#1ebbd4]/5 p-6">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-full bg-[#1ebbd4]/20 px-2.5 py-0.5 text-xs font-medium text-[#1ebbd4]">
                          CURRENT SESSION
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        {(() => {
                          const Icon = getDeviceIcon(currentSession.deviceInfo);
                          return <Icon className="h-8 w-8 text-brand-500" />;
                        })()}
                        <div className="flex-1">
                          <p className="font-medium">
                            {currentSession.deviceInfo || "This device"}
                          </p>
                          <div className="mt-1 flex items-center gap-1 text-xs text-[#8ba3b8]">
                            <Clock className="h-3 w-3" />
                            Expires {formatDateShort(currentSession.expiresAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                    <h2 className="mb-4 font-semibold">Active Sessions</h2>
                    {sessions.length === 0 ? (
                      <p className="text-sm text-[#8ba3b8]">No active sessions found.</p>
                    ) : (
                      <div className="space-y-3">
                        {sessions.map((session) => {
                          const Icon = getDeviceIcon(session.deviceInfo);
                          return (
                            <div
                              key={session.id}
                              className="flex items-center gap-3 rounded-lg border border-[#2a4055] bg-[#213548]/50 p-4"
                            >
                              <Icon className="h-6 w-6 flex-shrink-0 text-[#8ba3b8]" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {session.deviceInfo || "Unknown device"}
                                </p>
                                <div className="mt-0.5 flex items-center gap-3 text-xs text-[#8ba3b8]">
                                  <span>Created {formatDateShort(session.createdAt)}</span>
                                  <span>Expires {formatDateShort(session.expiresAt)}</span>
                                </div>
                              </div>
                              {session.isCurrent ? (
                                <span className="flex-shrink-0 rounded-full bg-[#1ebbd4]/20 px-2.5 py-0.5 text-xs font-medium text-[#1ebbd4]">
                                  Current
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleRevoke(session.id)}
                                  disabled={revokingId === session.id}
                                  className="flex-shrink-0 rounded-lg border border-[#f89c11]/30 p-2 text-[#f89c11] hover:bg-[#f89c11]/10 disabled:opacity-50"
                                  title="Revoke session"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
                    <h2 className="mb-3 font-semibold">Security Tips</h2>
                    <div className="space-y-2 text-sm text-[#8ba3b8]">
                      <p>• Revoke sessions from devices you no longer use or don&apos;t recognize</p>
                      <p>• Sessions automatically expire based on the refresh token lifetime</p>
                      <p>• If you suspect unauthorized access, revoke all sessions and change your passphrase</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </main>
    </div>
  );
}
