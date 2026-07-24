"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Shield, Trash2, UserPlus, UserPlus2, X } from "lucide-react";
import { apiClient, type AdminUser, type AuditLogEntry, type SmtpSettings, type EmailLogEntry } from "@/lib/api/client";
import { useSessionStore, getStoredEmail } from "@/stores/session";

export default function AdminPage() {
  const router = useRouter();
  const { unlocked, orgRole } = useSessionStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "audit" | "settings">("users");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("USER");
  const [inviting, setInviting] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberFirstName, setMemberFirstName] = useState("");
  const [memberLastName, setMemberLastName] = useState("");
  const [memberRole, setMemberRole] = useState("USER");
  const [memberPassword, setMemberPassword] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberLink, setMemberLink] = useState<string | null>(null);
  const [memberLinkCopied, setMemberLinkCopied] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgMode, setOrgMode] = useState<string>("ORGANIZATION");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [smtpForm, setSmtpForm] = useState<SmtpSettings>({
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    appUrl: "",
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.push("/login");
      return;
    }
    loadData();
  }, [unlocked, router]);

  async function loadData() {
    try {
      const [u, l, org] = await Promise.all([
        apiClient.adminListUsers(),
        apiClient.adminListAuditLogs(),
        apiClient.getOrgInfo(),
      ]);
      setUsers(u);
      setLogs(l.items);
      setOrgId(org.id);
      setOrgMode(org.mode);
      try {
        const smtp = await apiClient.getSmtpSettings();
        if (smtp.smtpHost) {
          setSmtpForm({
            smtpHost: smtp.smtpHost ?? "",
            smtpPort: smtp.smtpPort ?? 587,
            smtpSecure: smtp.smtpSecure ?? false,
            smtpUser: smtp.smtpUser ?? "",
            smtpPass: smtp.smtpPass ?? "",
            smtpFrom: smtp.smtpFrom ?? "",
            appUrl: smtp.appUrl ?? "",
          });
        }
      } catch {
        // SMTP settings not configured yet — that's fine
      }
      try {
        const logs = await apiClient.getEmailLogs();
        setEmailLogs(logs);
      } catch {
        // Email logs not available yet
      }
    } catch (e: any) {
      if (e?.status === 403) {
        setError("Admin access required.");
      } else {
        setError("Failed to load admin data.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(userId: string, status: string) {
    try {
      await apiClient.adminUpdateUserStatus(userId, status);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status } : u)));
    } catch {
      setError("Failed to update user status.");
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await apiClient.adminUpdateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, orgRole: role } : u)));
    } catch {
      setError("Failed to update user role.");
    }
  }

  async function handleDeleteUser(userId: string, userEmail: string) {
    if (!confirm(`Are you sure you want to permanently delete ${userEmail}? This cannot be undone.`)) return;
    try {
      await apiClient.adminDeleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete user.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) {
      setError("Organization not loaded yet.");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      const invite = await apiClient.createInvitation(orgId, {
        email: inviteEmail,
        role: inviteRole,
      });
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("USER");
      setInviteLink(invite.inviteLink);
      setLinkCopied(false);
    } catch (e: any) {
      const msg = e?.message ?? "Failed to invite user.";
      if (msg.includes("Failed to send invitation email")) {
        setError("Failed to send invitation email. Make sure MailHog/SMTP is running and try again.");
      } else {
        setError(msg);
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAddingMember(true);
    try {
      const newMember = await apiClient.adminAddMember({
        email: memberEmail,
        firstName: memberFirstName,
        lastName: memberLastName,
        role: memberRole,
        password: memberPassword || undefined,
      });
      setUsers((prev) => [...prev, newMember]);
      setShowAddMember(false);
      setMemberEmail("");
      setMemberFirstName("");
      setMemberLastName("");
      setMemberRole("USER");
      setMemberPassword("");
      setMemberLink(newMember.inviteLink);
      setMemberLinkCopied(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add member.");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleCopyMemberLink() {
    if (!memberLink) return;
    try {
      await navigator.clipboard.writeText(memberLink);
      setMemberLinkCopied(true);
      setTimeout(() => setMemberLinkCopied(false), 2000);
    } catch {
      setError("Failed to copy link to clipboard.");
    }
  }

  async function handleSaveSmtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingSmtp(true);
    setSmtpSaved(false);
    try {
      await apiClient.updateSmtpSettings(smtpForm);
      setSmtpSaved(true);
      setTimeout(() => setSmtpSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save SMTP settings.");
    } finally {
      setSavingSmtp(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Failed to copy link to clipboard.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[#8ba3b8]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <button
        onClick={() => router.push("/vault")}
        className="mb-6 flex items-center gap-1 text-sm text-[#8ba3b8] hover:text-[#e2e8f0]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Vault
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold">Admin Panel</h1>
        </div>
        {tab === "users" && orgMode !== "SELF_HOSTED" && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <UserPlus2 className="h-4 w-4" /> Add Member
            </button>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a4055] px-4 py-2 text-sm font-semibold text-[#c4d4e0] hover:bg-[#213548]"
            >
              <UserPlus className="h-4 w-4" /> Invite User
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#f89c11] bg-[#f89c11]/20 px-4 py-2 text-sm text-[#f89c11]">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("users")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "users" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
        >
          Users
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "audit" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
        >
          Audit Logs
        </button>
        {orgRole === "OWNER" && (
          <button
            onClick={() => setTab("settings")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "settings" ? "bg-[#213548] text-white" : "text-[#8ba3b8] hover:bg-[#213548]/50"}`}
          >
            Settings
          </button>
        )}
      </div>

      {tab === "settings" ? (
        <div className="rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
          <h2 className="mb-4 text-lg font-bold">SMTP Settings</h2>
          <p className="mb-4 text-sm text-[#8ba3b8]">
            Configure email delivery for invitation emails. These settings are stored in the database and used when sending invites.
          </p>
          <form onSubmit={handleSaveSmtp} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">SMTP Host</label>
                <input
                  type="text"
                  required
                  value={smtpForm.smtpHost}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">SMTP Port</label>
                <input
                  type="number"
                  required
                  value={smtpForm.smtpPort}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: Number(e.target.value) })}
                  placeholder="587"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">SMTP User</label>
                <input
                  type="text"
                  required
                  value={smtpForm.smtpUser}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                  placeholder="your@gmail.com"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">SMTP Password</label>
                <input
                  type="password"
                  required
                  value={smtpForm.smtpPass}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpPass: e.target.value })}
                  placeholder="App password"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">From Address (optional)</label>
                <input
                  type="text"
                  value={smtpForm.smtpFrom ?? ""}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpFrom: e.target.value })}
                  placeholder="Clickrypt <no-reply@example.com>"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">App URL</label>
                <input
                  type="text"
                  required
                  value={smtpForm.appUrl}
                  onChange={(e) => setSmtpForm({ ...smtpForm, appUrl: e.target.value })}
                  placeholder="https://your-public-url.com"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="smtpSecure"
                checked={smtpForm.smtpSecure}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtpSecure: e.target.checked })}
                className="h-4 w-4 rounded border-[#2a4055]"
              />
              <label htmlFor="smtpSecure" className="text-sm text-[#c4d4e0]">
                Use SSL/TLS (port 465)
              </label>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingSmtp}
                className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingSmtp ? "Saving…" : "Save Settings"}
              </button>
              {smtpSaved && (
                <span className="flex items-center gap-1 text-sm text-[#1ebbd4]">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </form>
        </div>
      ) : tab === "users" ? (
        <div className="overflow-x-auto rounded-xl border border-[#2a4055]">
          <table className="w-full text-sm">
            <thead className="bg-[#213548]/50 text-left text-xs uppercase text-[#8ba3b8]">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Delete</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#2a4055]">
                  <td className="px-4 py-3">
                    {u.firstName || u.lastName ? (
                      <p className="font-medium">{u.firstName} {u.lastName}</p>
                    ) : (
                      <p className="font-medium text-[#8ba3b8] italic">Pending setup</p>
                    )}
                    <p className="text-xs text-[#8ba3b8]">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.orgRole}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={orgRole !== "OWNER" || u.orgRole === "OWNER"}
                      className="rounded border border-[#2a4055] bg-[#1a3349] px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                      {u.orgRole === "OWNER" && <option value="OWNER">OWNER</option>}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === "ACTIVE" ? "bg-green-900/30 text-[#1ebbd4]" : "bg-[#f89c11]/20 text-[#f89c11]"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.status}
                      onChange={(e) => handleStatusChange(u.id, e.target.value)}
                      disabled={u.orgRole === "OWNER" || u.email === getStoredEmail()}
                      className="rounded border border-[#2a4055] bg-[#1a3349] px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.email === getStoredEmail() ? (
                      <span className="text-xs text-[#8ba3b8]">(You)</span>
                    ) : (orgRole === "OWNER" || orgRole === "ADMIN") && u.orgRole !== "OWNER" ? (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="text-[#8ba3b8] hover:text-[#f89c11]"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-[#8ba3b8]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-[#8ba3b8]">No audit logs yet.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-[#2a4055] bg-[#1a3349]/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{log.action}</span>
                  <span className="text-xs text-[#8ba3b8]">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[#8ba3b8] mt-1">
                  {log.user ? `${log.user.firstName} ${log.user.lastName} (${log.user.email})` : "System"} · {log.entityType}
                  {log.entityId ? `: ${log.entityId.slice(0, 8)}…` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="mt-6 rounded-xl border border-[#2a4055] bg-[#1a3349]/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Email Delivery Logs</h2>
              <p className="text-sm text-[#8ba3b8]">Recent email delivery attempts and their status.</p>
            </div>
            <button
              onClick={async () => {
                setLoadingLogs(true);
                try {
                  const logs = await apiClient.getEmailLogs();
                  setEmailLogs(logs);
                } catch {
                  setError("Failed to load email logs.");
                } finally {
                  setLoadingLogs(false);
                }
              }}
              className="rounded-lg border border-[#2a4055] px-3 py-1.5 text-sm text-[#c4d4e0] hover:bg-[#213548]"
            >
              {loadingLogs ? "Loading..." : "Refresh"}
            </button>
          </div>
          {emailLogs.length === 0 ? (
            <p className="text-sm text-[#8ba3b8]">No email logs yet. Send an invite to see delivery status here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#213548]/50 text-left text-xs uppercase text-[#8ba3b8]">
                  <tr>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Error</th>
                    <th className="px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.map((log) => {
                    const statusClass =
                      log.status === "SENT"
                        ? "bg-[#1ebbd4]/20 text-[#1ebbd4]"
                        : log.status === "FAILED"
                        ? "bg-[#f89c11]/20 text-[#f89c11]"
                        : "bg-[#8ba3b8]/20 text-[#8ba3b8]";
                    return (
                      <tr key={log.id} className="border-t border-[#2a4055]">
                        <td className="px-3 py-2 text-[#c4d4e0]">{log.recipient}</td>
                        <td className="px-3 py-2 text-[#c4d4e0] max-w-[200px] truncate">{log.subject}</td>
                        <td className="px-3 py-2">
                          <span className={"rounded px-2 py-0.5 text-xs font-semibold " + statusClass}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-[#f89c11] max-w-[250px] truncate">
                          {log.error ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#8ba3b8]">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Invite User</h2>
              <button onClick={() => setShowInvite(false)} className="text-[#8ba3b8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {inviting ? "Inviting…" : "Send Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="rounded-lg border border-[#2a4055] px-4 py-2 font-semibold text-[#e2e8f0] hover:bg-[#213548]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inviteLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setInviteLink(null)}>
          <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Invite Sent</h2>
              <button onClick={() => setInviteLink(null)} className="text-[#8ba3b8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-[#8ba3b8]">
              An invitation email has been sent. You can also share this link directly — it expires in 48 hours:
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-xs text-[#c4d4e0] focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {linkCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setInviteLink(null)}
              className="mt-4 w-full rounded-lg border border-[#2a4055] px-4 py-2 font-semibold text-[#e2e8f0] hover:bg-[#213548]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {memberLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMemberLink(null)}>
          <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Member Added</h2>
              <button onClick={() => setMemberLink(null)} className="text-[#8ba3b8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-[#8ba3b8]">
              An email has been sent with a setup link. You can also copy this link and share it directly — it expires in 48 hours:
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={memberLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-xs text-[#c4d4e0] focus:outline-none"
              />
              <button
                onClick={handleCopyMemberLink}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {memberLinkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {memberLinkCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setMemberLink(null)}
              className="mt-4 w-full rounded-lg border border-[#2a4055] px-4 py-2 font-semibold text-[#e2e8f0] hover:bg-[#213548]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddMember(false)}>
          <div className="w-full max-w-md rounded-xl border border-[#2a4055] bg-[#1a3349] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Member</h2>
              <button onClick={() => setShowAddMember(false)} className="text-[#8ba3b8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Email</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[#c4d4e0]">First Name</label>
                  <input
                    type="text"
                    required
                    value={memberFirstName}
                    onChange={(e) => setMemberFirstName(e.target.value)}
                    className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[#c4d4e0]">Last Name</label>
                  <input
                    type="text"
                    required
                    value={memberLastName}
                    onChange={(e) => setMemberLastName(e.target.value)}
                    className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Role</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#c4d4e0]">Temporary Password (optional)</label>
                <input
                  type="password"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full rounded-lg border border-[#2a4055] bg-[#0f1f2e] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={addingMember}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {addingMember ? "Adding…" : "Add Member"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="rounded-lg border border-[#2a4055] px-4 py-2 font-semibold text-[#e2e8f0] hover:bg-[#213548]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
