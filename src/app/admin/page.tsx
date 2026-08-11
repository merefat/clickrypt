'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  UserCheck,
  UserPlus,
  Search,
  Filter,
  Shield,
  Clock,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Mail,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Copy,
  Check,
  Trash2
} from 'lucide-react';
import api from '@/lib/api';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'User'>('User');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs');
      setAuditLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put('/admin/users', { id: userId, role: newRole });
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      alert('Failed to update role');
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
      await api.put('/admin/users', { id: userId, status: nextStatus });
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      alert('Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to permanently delete member "${userName}"? This action cannot be undone.`)) return;

    try {
      await api.delete(`/admin/users?id=${userId}`);
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      const res = await api.post('/admin/invite', { email: inviteEmail, role: inviteRole });
      const generatedLink = res.data.inviteLink || res.data.inviteUrl || `${window.location.origin}/register?inviteToken=${res.data.invite?.token}&email=${encodeURIComponent(inviteEmail)}&role=${inviteRole}`;
      setInviteLink(generatedLink);
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      alert('Failed to send invitation');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2] shadow">
                <UserCheck className="w-5 h-5 text-[#1fbbd2]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Team Members</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Manage your team, roles, and access to the password vault.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setInviteLink('');
                setInviteEmail('');
                setShowInviteModal(true);
              }}
              className="gold-cyan-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-[#0d1724] shadow-lg"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Member</span>
            </button>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#17283b] border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#1fbbd2]"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2 bg-[#17283b] border border-gray-700 px-3 py-2 rounded-xl text-xs">
                <Filter className="w-3.5 h-3.5 text-[#f39c12]" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-[#17283b] text-white focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-[#17283b] text-white">All Roles</option>
                  <option value="Owner" className="bg-[#17283b] text-white">Owner</option>
                  <option value="Admin" className="bg-[#17283b] text-white">Admin</option>
                  <option value="User" className="bg-[#17283b] text-white">User</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-[#17283b] border border-gray-700 px-3 py-2 rounded-xl text-xs">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#17283b] text-white focus:outline-none cursor-pointer"
                >
                  <option value="All" className="bg-[#17283b] text-white">All Status</option>
                  <option value="Active" className="bg-[#17283b] text-white">Active</option>
                  <option value="Invited" className="bg-[#17283b] text-white">Invited</option>
                  <option value="Suspended" className="bg-[#17283b] text-white">Suspended</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="glass-panel rounded-2xl border border-[rgba(31,187,210,0.25)] overflow-hidden shadow-2xl bg-[#17283b]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d1724]/90 text-gray-300 font-bold uppercase tracking-wider border-b border-gray-700">
                  <tr>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Last Active</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-700/60">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#0d1724]/60 transition-all border-b border-gray-700/40">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {/* Gold-Cyan Gradient Avatar (0% Purple) */}
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold text-xs shadow">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{u.name}</p>
                            {u.role === 'Owner' && <span className="text-[10px] text-[#f39c12]">Organization Owner</span>}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-gray-300">{u.email}</td>

                      <td className="py-4 px-4">
                        {u.role === 'Owner' ? (
                          /* Gold Owner Badge (0% Purple) */
                          <span className="bg-[#0d1724] text-[#f39c12] border border-[#f39c12]/50 text-[10px] font-extrabold px-3 py-1 rounded-full shadow">
                            Owner
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-[#0d1724] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#1fbbd2] cursor-pointer"
                          >
                            <option value="Admin" className="bg-[#17283b] text-white">Admin</option>
                            <option value="User" className="bg-[#17283b] text-white">User</option>
                          </select>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {u.status === 'Active' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 glow-green" />
                            Active
                          </span>
                        ) : u.status === 'Invited' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#1fbbd2] font-bold text-xs">
                            <span className="w-2 h-2 rounded-full bg-[#1fbbd2]" />
                            Invited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Suspended
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-gray-400 text-[11px]">{u.lastActive}</td>

                      <td className="py-4 px-4 text-right">
                        {u.role !== 'Owner' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleStatusToggle(u.id, u.status)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                                u.status === 'Active'
                                  ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10'
                                  : 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.status === 'Active' ? 'Suspend' : 'Activate'}
                            </button>

                            <button
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow cursor-pointer"
                              title="Permanently delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination with Gold-Cyan active button (0% Purple) */}
            <div className="p-4 bg-[#0d1724]/80 border-t border-gray-700 flex items-center justify-between text-xs text-gray-400">
              <span>Showing 1 to {filteredUsers.length} of {filteredUsers.length} members</span>

              <div className="flex items-center gap-1.5">
                <button className="p-1.5 bg-[#17283b] border border-gray-700 rounded-lg hover:bg-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="w-7 h-7 gold-cyan-gradient-btn text-[#0d1724] font-extrabold rounded-lg flex items-center justify-center shadow">
                  1
                </button>
                <button className="p-1.5 bg-[#17283b] border border-gray-700 rounded-lg hover:bg-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs Card with Gold & Cyan badges (0% Purple) */}
          <div className="glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Shield className="w-4 h-4 text-[#1fbbd2]" />
              <span>Live Security Audit Logs</span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-[#0d1724] border border-gray-700/60 rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-[#17283b] text-[#f39c12] border border-[#f39c12]/40 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      [{log.action}]
                    </span>
                    <span className="text-gray-200">{log.details}</span>
                  </div>
                  <span className="text-gray-500 text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.3)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-gray-700 pb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#1fbbd2]" />
                <h3 className="text-lg font-bold text-white">Invite Team Member</h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {!inviteLink ? (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#1fbbd2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    ROLE PERMISSION
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1fbbd2]"
                  >
                    <option value="User" className="bg-[#17283b] text-white">User (Can view & share allowed items)</option>
                    <option value="Admin" className="bg-[#17283b] text-white">Admin (Can manage members & groups)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 bg-[#0d1724] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gold-cyan-gradient-btn px-5 py-2 rounded-xl text-xs font-extrabold text-[#0d1724] shadow"
                  >
                    Generate Invite Link
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 flex items-center justify-center mx-auto glow-green">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Invitation Link Created!</h4>
                <p className="text-xs text-gray-300">
                  Share this invitation link with <strong>{inviteEmail}</strong> to complete onboarding:
                </p>

                <div className="bg-[#0d1724] p-3 rounded-xl border border-gray-700 font-mono text-[11px] text-[#1fbbd2] break-all">
                  {inviteLink}
                </div>

                <button
                  onClick={handleCopyLink}
                  className="w-full gold-gradient-btn py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Invite Link'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
