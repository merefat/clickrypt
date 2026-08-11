'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Crown,
  Search,
  Filter,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Copy,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  PauseCircle,
  PlayCircle
} from 'lucide-react';
import api from '@/lib/api';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Invite Modal & Link State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'User'>('User');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs');
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Generate Invite URL
  const handleGenerateInvite = async () => {
    if (!inviteEmail) {
      alert('Please enter an email address');
      return;
    }
    setInviting(true);
    try {
      const res = await api.post('/admin/invite', { email: inviteEmail, role: inviteRole });
      setGeneratedUrl(res.data.inviteUrl);
      fetchUsers();
    } catch (err) {
      alert('Failed to generate invite token');
    } finally {
      setInviting(false);
    }
  };

  // Gmail Sender Action
  const handleSendGmail = () => {
    if (!inviteEmail) return;
    const url = generatedUrl || `http://localhost:3000/register?email=${encodeURIComponent(inviteEmail)}&role=${inviteRole}`;
    const subject = encodeURIComponent('Invitation to join Clickrypt Password Vault');
    const body = encodeURIComponent(
      `Hello,\n\nYou have been invited to join the Clickrypt Password Vault as an ${inviteRole}.\n\nClick the link below to set up your account and OpenPGP encryption keypair:\n${url}\n\nBest regards,\nClickrypt Security Team`
    );
    window.open(`mailto:${inviteEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  // Copy Link Action
  const handleCopyLink = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Change Role Action
  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await api.put('/admin/users', { userId, role: newRole });
      fetchUsers();
    } catch (err) {
      alert('Failed to update role');
    }
  };

  // Toggle Suspend Action
  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
      await api.put('/admin/users', { userId, status: newStatus });
      fetchUsers();
      fetchLogs();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  // Delete User Action
  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete user account ${email}?`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchUsers();
      fetchLogs();
    } catch (err) {
      alert('Failed to delete user');
    }
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
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Top Title & Invite Button */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white">Team Members</h1>
              <p className="text-xs text-gray-400">Manage your team, roles, and access to the password vault.</p>
            </div>

            <button
              onClick={() => {
                setGeneratedUrl('');
                setShowInviteModal(true);
              }}
              className="purple-gradient-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Member</span>
            </button>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#151b28] border border-gray-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#1e2638] text-gray-400 text-[10px] font-mono px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-[#151b28] border border-gray-800 px-3 py-2 rounded-xl text-xs">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                >
                  <option value="All">All Roles</option>
                  <option value="Owner">Owner</option>
                  <option value="Admin">Admin</option>
                  <option value="User">User</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-[#151b28] border border-gray-800 px-3 py-2 rounded-xl text-xs">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Invited">Invited</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="glass-panel rounded-2xl border border-[rgba(124,58,237,0.2)] overflow-hidden shadow-2xl mb-8">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151b28]/80 text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Last Active</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800/60">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-[#1e2638]/40 transition-all border-b border-gray-800/40">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs text-white shadow">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm flex items-center gap-1.5">
                            {u.name}
                            {u.role === 'Owner' && <Crown className="w-3.5 h-3.5 text-purple-400" />}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-gray-300">{u.email}</td>

                    {/* Role Dropdown / Badge */}
                    <td className="py-4 px-4">
                      {u.role === 'Owner' ? (
                        <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2.5 py-1 rounded font-semibold">
                          Owner
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u.id, e.target.value)}
                          className="bg-[#151b28] border border-gray-700 text-xs text-white rounded px-2 py-1 cursor-pointer focus:border-purple-500"
                        >
                          <option value="Admin">Admin</option>
                          <option value="User">User</option>
                        </select>
                      )}
                    </td>

                    {/* Status Indicator Badge */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            u.status === 'Active'
                              ? 'bg-emerald-500 glow-green'
                              : u.status === 'Suspended'
                              ? 'bg-amber-500'
                              : 'bg-gray-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            u.status === 'Active'
                              ? 'text-emerald-400'
                              : u.status === 'Suspended'
                              ? 'text-amber-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {u.status}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-gray-400 text-[11px]">{u.lastActive}</td>

                    {/* Action Buttons: Suspend & Delete */}
                    <td className="py-4 px-4 text-right">
                      {u.role !== 'Owner' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                              u.status === 'Active'
                                ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                                : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
                            }`}
                          >
                            {u.status === 'Active' ? (
                              <>
                                <PauseCircle className="w-3.5 h-3.5" /> Suspend
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-3.5 h-3.5" /> Activate
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-gray-900 border border-gray-800 rounded-lg transition-all"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-4 bg-[#151b28]/60 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
              <span>Showing 1 to {filteredUsers.length} of {filteredUsers.length} members</span>
              <div className="flex items-center gap-1.5">
                <button className="p-1.5 bg-[#0b0f17] border border-gray-800 rounded-lg">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="w-7 h-7 bg-purple-600 text-white font-bold rounded-lg flex items-center justify-center">
                  1
                </button>
                <button className="p-1.5 bg-[#0b0f17] border border-gray-800 rounded-lg">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)]">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              Live Security Audit Logs
            </h3>
            <div className="space-y-2 max-h-56 overflow-y-auto text-xs font-mono">
              {logs.map((log) => (
                <div key={log.id} className="p-2.5 bg-[#0b0f17] rounded-lg border border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-purple-400 font-bold">[{log.action}]</span>
                    <span className="text-gray-300">{log.details}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Invite Member Modal with Gmail & Generated URL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-purple-800/40 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Invite Team Member</h3>
            <p className="text-xs text-gray-400 mb-4">
              Generate a custom registration URL or send directly via Gmail.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="colleague@gmail.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'Admin' | 'User')}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                >
                  <option value="User">User (Standard Vault Access)</option>
                  <option value="Admin">Admin (Team & Member Controls)</option>
                </select>
              </div>

              {/* Generate URL Action */}
              <button
                type="button"
                onClick={handleGenerateInvite}
                disabled={inviting || !inviteEmail}
                className="w-full py-2.5 purple-gradient-btn text-xs font-bold rounded-lg flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{inviting ? 'Generating Token...' : 'Generate Invite Link'}</span>
              </button>

              {/* Generated URL & Actions Box */}
              {generatedUrl && (
                <div className="glass-panel p-4 rounded-xl border border-purple-900/50 bg-purple-950/20 space-y-3 animate-in fade-in">
                  <span className="text-xs font-semibold text-purple-300 block">Generated Invitation Link:</span>
                  <div className="flex items-center gap-2 bg-[#0b0f17] p-2 rounded-lg border border-gray-800">
                    <input
                      type="text"
                      readOnly
                      value={generatedUrl}
                      className="w-full bg-transparent text-[11px] font-mono text-gray-300 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="p-1.5 bg-[#1e2638] hover:bg-gray-700 text-white rounded text-xs shrink-0 flex items-center gap-1"
                    >
                      {copiedUrl ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSendGmail}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 shadow"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Send via Gmail</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
