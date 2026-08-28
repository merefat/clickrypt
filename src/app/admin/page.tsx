'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  UserCheck,
  Users,
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
  Trash2,
  KeyRound,
  X
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { reEncryptPgpMessage } from '@/lib/crypto';
import FilterDropdown from '@/components/FilterDropdown';

import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedMode = localStorage.getItem('clickrypt_app_mode');
      if (storedMode === 'personal') {
        router.push('/vault');
      }
    }
  }, [router]);

  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'recovery' | 'audit'>('members');
  const [searchTerm, setSearchTerm] = useState('');

  const canManageUser = (targetUser: any) => {
    if (!user) return false;
    if (targetUser.role === 'Owner') return false; // Nobody can modify/delete Owner
    if (user.role === 'Owner') return true; // Owner manages both Admins & Users
    if (user.role === 'Admin') {
      // Admin can manage standard Users, but CANNOT manage Admins or Owner
      return targetUser.role === 'User';
    }
    return false;
  };
  const canInvite = user?.role === 'Owner' || user?.role === 'Admin';
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'User'>('User');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const LOGS_PER_PAGE = 8;

  const [showSettings, setShowSettings] = useState(false);
  const [openEnrollment, setOpenEnrollment] = useState(false);
  const [openEnrollmentLoading, setOpenEnrollmentLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferStage, setTransferStage] = useState<'idle' | 'sent' | 'confirm'>('idle');
  const [transferCode, setTransferCode] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferMessage, setTransferMessage] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
    fetchRecoveryRequests();
  }, []);

  useEffect(() => {
    if (user?.organization) {
      setOpenEnrollment(user.organization.openEnrollment);
    }
  }, [user]);

  const fetchRecoveryRequests = async () => {
    try {
      const res = await api.get('/account-recovery/requests');
      setRecoveryRequests(res.data.requests || []);
    } catch (err) {
      console.error(err);
    }
  };

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

  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  const handleResendInvite = async (email: string, role: string) => {
    setResendingEmail(email);
    try {
      const res = await api.post('/admin/invite', { email, role });
      if (res.data?.success) {
        alert(`Invitation email resent to ${email}!`);
      } else {
        alert(res.data?.error || 'Failed to resend invitation email.');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to resend invitation.');
    } finally {
      setResendingEmail(null);
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    if (currentStatus === 'Invited') return;
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    try {
      await api.put('/admin/users', { id: userId, status: nextStatus });
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user status');
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

  const handleToggleOpenEnrollment = async () => {
    if (!user || user.role !== 'Owner') return;
    setOpenEnrollmentLoading(true);
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', { action: 'toggle-open-enrollment' });
      if (res.data?.success) {
        setOpenEnrollment(res.data.openEnrollment);
      } else {
        setTransferError(res.data?.error || 'Failed to update setting');
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Failed to update open enrollment');
    } finally {
      setOpenEnrollmentLoading(false);
    }
  };

  const handleInitiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', {
        action: 'initiate-ownership-transfer',
        targetUserId: transferTarget,
      });
      if (res.data?.success) {
        setTransferStage('sent');
        setTransferMessage(res.data.message);
      } else {
        setTransferError(res.data?.error || 'Failed to initiate transfer');
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Failed to initiate transfer');
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');
    setTransferMessage('');
    try {
      const res = await api.post('/admin/users', {
        action: 'confirm-ownership-transfer',
        targetUserId: transferTarget,
        emailOtp: transferCode,
        twoFactorCode: twoFactorCode || undefined,
      });
      if (res.data?.success) {
        setTransferStage('idle');
        setTransferMessage('Ownership transferred successfully');
        setTransferCode('');
        setTwoFactorCode('');
        setTransferTarget('');
        fetchUsers();
      } else {
        setTransferError(res.data?.error || 'Transfer failed');
      }
    } catch (err: any) {
      setTransferError(err.response?.data?.error || 'Transfer failed');
    }
  };

  const handleApproveRecovery = async (reqId: string) => {
    try {
      const orgKeyPass = prompt('Enter Organization Recovery Key Passphrase to unlock escrow payload:');
      if (!orgKeyPass) return;

      const detailRes = await api.get(`/account-recovery/requests/${reqId}`);
      const { escrowedPrivateKey, request } = detailRes.data;

      if (!escrowedPrivateKey || !request?.armoredKey) {
        alert('Missing escrowed key or target public key for this request.');
        return;
      }

      const reEncryptedPayload = await reEncryptPgpMessage(
        escrowedPrivateKey,
        escrowedPrivateKey,
        orgKeyPass,
        request.armoredKey
      );

      await api.post('/account-recovery/responses', {
        requestId: reqId,
        status: 'approved',
        data: reEncryptedPayload,
        adminId: user?.id,
      });

      alert('Recovery request approved successfully!');
      fetchRecoveryRequests();
      fetchAuditLogs();
    } catch (err: any) {
      alert('Error approving recovery request: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRejectRecovery = async (reqId: string) => {
    if (!confirm('Are you sure you want to reject this recovery request?')) return;
    try {
      await api.post('/account-recovery/responses', {
        requestId: reqId,
        status: 'rejected',
        adminId: user?.id,
      });
      fetchRecoveryRequests();
      fetchAuditLogs();
    } catch (err: any) {
      alert('Failed to reject recovery request');
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-4 md:p-8 flex-1 overflow-y-auto space-y-8">
          {/* Header & Tabs */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm shrink-0">
                <UserCheck className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Administration</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Team members, Account Recovery requests, and organization security logs.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-1.5 bg-[#ffffff] p-1.5 rounded-2xl border border-[#cbd5e1] shadow-sm whitespace-nowrap overflow-x-auto max-w-full">
                <button
                  type="button"
                  onClick={() => setActiveTab('members')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'members'
                      ? 'bg-[#1fbbd2] text-white shadow-sm'
                      : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Members ({users.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('recovery')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'recovery'
                      ? 'bg-[#f39c12] text-white shadow-sm'
                      : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                  }`}
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>Recovery Requests ({recoveryRequests.filter((r) => r.status === 'pending').length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'audit'
                      ? 'bg-[#0284c7] text-white shadow-sm'
                      : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Audit Logs ({auditLogs.length})</span>
                </button>
              </div>

              {canInvite && (
                <button
                  type="button"
                  onClick={() => {
                    setInviteLink('');
                    setInviteEmail('');
                    setShowInviteModal(true);
                  }}
                  className="gold-cyan-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Invite Member</span>
                </button>
              )}
            </div>
          </div>

          {activeTab === 'members' && (
            <>
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
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0f172a] placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-sm"
                  />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <FilterDropdown
                    value={roleFilter}
                    onChange={setRoleFilter}
                    icon={Filter}
                    options={[
                      { value: 'All', label: 'All Roles' },
                      { value: 'Owner', label: 'Owner' },
                      { value: 'Admin', label: 'Admin' },
                      { value: 'User', label: 'User' },
                    ]}
                  />
                  <FilterDropdown
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'All', label: 'All Status' },
                      { value: 'Active', label: 'Active' },
                      { value: 'Invited', label: 'Invited' },
                      { value: 'Suspended', label: 'Suspended' },
                    ]}
                  />
                </div>
              </div>

              {/* Members Table */}
              <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                      <tr>
                        <th className="py-3.5 px-6">Name</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Role</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Last Active</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#e2e8f0]">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold text-xs shadow">
                                {u.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-[#0f172a] text-sm">{u.name}</p>
                                {u.role === 'Owner' && <span className="text-[10px] text-[#d97706] font-bold">Organization Owner</span>}
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-[#334155]">{u.email}</td>

                          <td className="py-4 px-4">
                            {u.role === 'Owner' ? (
                              <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/50 text-[10px] font-extrabold px-3 py-1 rounded-full shadow-sm">
                            Owner
                          </span>
                        ) : canManageUser(u) ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-[#ffffff] border border-[#cbd5e1] rounded-lg px-2.5 py-1 text-xs text-[#0f172a] font-extrabold focus:outline-none focus:border-[#1fbbd2] cursor-pointer shadow-xs"
                          >
                            <option value="Admin" className="bg-white text-[#0f172a]">Admin</option>
                            <option value="User" className="bg-white text-[#0f172a]">User</option>
                          </select>
                        ) : (
                          <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/50 text-[10px] font-extrabold px-3 py-1 rounded-full shadow-xs">
                            {u.role}
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {u.status === 'Active' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-extrabold text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : u.status === 'Invited' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#0284c7] font-extrabold text-xs">
                            <span className="w-2 h-2 rounded-full bg-[#1fbbd2]" />
                            Invited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[#d97706] font-extrabold text-xs">
                            <span className="w-2 h-2 rounded-full bg-[#f39c12]" />
                            Suspended
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-[#64748b] text-[11px] font-medium">{u.lastActive}</td>

                      <td className="py-4 px-4 text-right">
                        {canManageUser(u) ? (
                          <div className="flex items-center justify-end gap-2">
                            {u.status === 'Invited' ? (
                              <button
                                onClick={() => handleResendInvite(u.email, u.role)}
                                disabled={resendingEmail === u.email}
                                className="px-3 py-1 bg-[#ffffff] hover:bg-[#e0f2fe] border border-[#1fbbd2] text-[#0284c7] rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                                title="Resend invitation email"
                              >
                                <Mail className="w-3.5 h-3.5 text-[#0284c7]" />
                                <span>{resendingEmail === u.email ? 'Sending...' : 'Resend Invite'}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStatusToggle(u.id, u.status)}
                                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all border shadow-xs cursor-pointer ${
                                  u.status === 'Active'
                                    ? 'bg-[#ffffff] hover:bg-[#fffbeb] border-[#f39c12] text-[#d97706]'
                                    : 'bg-[#ffffff] hover:bg-[#ecfdf5] border-emerald-500 text-emerald-700'
                                }`}
                              >
                                {u.status === 'Active' ? 'Suspend' : 'Activate'}
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              className="px-2.5 py-1 bg-[#fff1f2] hover:bg-[#ffe4e6] border border-rose-300 text-rose-700 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                              title={u.status === 'Invited' ? 'Revoke invitation' : 'Permanently delete user'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{u.status === 'Invited' ? 'Revoke' : 'Delete'}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#64748b] italic font-medium">Protected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

          {/* Account Recovery Requests Tab */}
          {activeTab === 'recovery' && (
            <div className="glass-panel rounded-2xl border border-[#d0dbe5] overflow-hidden shadow-xl bg-[#ffffff] space-y-4 p-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
                <div>
                  <h2 className="text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#d97706]" />
                    <span>Account Recovery Requests</span>
                  </h2>
                  <p className="text-xs text-[#64748b] mt-0.5 font-medium">
                    Review and approve zero-knowledge account recovery requests using the Organization Recovery Key.
                  </p>
                </div>
              </div>

              {recoveryRequests.length === 0 ? (
                <div className="text-center py-12 bg-[#f8fafc] rounded-xl border border-[#cbd5e1] text-xs text-[#64748b] font-medium">
                  No active or past recovery requests found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e6eff7] text-[#334155] font-extrabold uppercase tracking-wider border-b border-[#cbd5e1]">
                      <tr>
                        <th className="py-3.5 px-6">User</th>
                        <th className="py-3.5 px-4">Fingerprint</th>
                        <th className="py-3.5 px-4">Requested Date</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {recoveryRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-[#f1f6fb] transition-all border-b border-gray-100">
                          <td className="py-4 px-6 font-bold text-[#0f172a]">
                            <div>
                              <p className="text-[#0f172a] text-sm font-extrabold">{req.userName || 'User'}</p>
                              <p className="text-xs text-[#334155] font-mono font-semibold">{req.userEmail}</p>
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <span className="bg-[#e0f2fe] text-[#0284c7] font-extrabold text-[11px] px-2 py-1 rounded-lg border border-[#1fbbd2]/30 shadow-xs inline-block">
                              {req.fingerprint ? `${req.fingerprint.slice(0, 16)}...` : 'Pending Key'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-[#475569] font-medium text-xs">
                            {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-4 px-4">
                            {req.status === 'pending' ? (
                              <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 px-3 py-1 rounded-full font-extrabold text-[11px] shadow-xs">
                                Pending Review
                              </span>
                            ) : req.status === 'approved' ? (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full font-extrabold text-[11px] shadow-xs">
                                Approved
                              </span>
                            ) : req.status === 'completed' ? (
                              <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/40 px-3 py-1 rounded-full font-extrabold text-[11px] shadow-xs">
                                Completed
                              </span>
                            ) : (
                              <span className="bg-rose-50 text-rose-700 border border-rose-300 px-3 py-1 rounded-full font-extrabold text-[11px] shadow-xs">
                                Rejected
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {req.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveRecovery(req.id)}
                                  className="gold-cyan-gradient-btn px-3.5 py-1.5 rounded-xl font-extrabold text-xs text-white shadow-xs transition-all cursor-pointer active:scale-95"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectRecovery(req.id)}
                                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#64748b] font-extrabold italic">No Action Needed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Audit Logs Tab Content */}
          {activeTab === 'audit' &&
            (() => {
              const totalLogPages = Math.ceil(auditLogs.length / LOGS_PER_PAGE) || 1;
              const currentLogs = auditLogs.slice(
                (auditLogPage - 1) * LOGS_PER_PAGE,
                auditLogPage * LOGS_PER_PAGE
              );

              return (
                <div className="glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-[#0f172a]">
                      <Shield className="w-4 h-4 text-[#0284c7]" />
                      <span>Live Security Audit Logs ({auditLogs.length})</span>
                    </div>

                    <span className="text-xs text-[#0284c7] font-extrabold">
                      Page {auditLogPage} of {totalLogPages}
                    </span>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    {currentLogs.map((log) => {
                      const isDelete = log.action.includes('DELETE');
                      const isShare = log.action.includes('SHARE');
                      const isCreate = log.action.includes('CREATE');

                      const badgeStyle = isDelete
                        ? 'bg-rose-50 text-rose-700 border-rose-300'
                        : isShare
                        ? 'bg-sky-50 text-sky-700 border-sky-300'
                        : isCreate
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-[#fffbeb] text-[#d97706] border-[#f39c12]/40';

                      return (
                        <div
                          key={log.id}
                          className="p-3 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl flex items-center justify-between shadow-sm transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`border text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-xs ${badgeStyle}`}>
                              [{log.action}]
                            </span>
                            <span className="text-[#0f172a] font-bold">{log.details}</span>
                          </div>
                          <span className="text-[#64748b] text-[10px] font-medium">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Audit Logs Pagination Controls */}
                  {auditLogs.length > LOGS_PER_PAGE && (
                    <div className="pt-4 border-t border-[#cbd5e1] flex items-center justify-between text-xs text-[#64748b]">
                      <span>
                        Showing {(auditLogPage - 1) * LOGS_PER_PAGE + 1} to{' '}
                        {Math.min(auditLogPage * LOGS_PER_PAGE, auditLogs.length)} of {auditLogs.length} logs
                      </span>

                      <div className="flex items-center gap-1.5 font-sora">
                        <button
                          type="button"
                          onClick={() => setAuditLogPage((prev) => Math.max(prev - 1, 1))}
                          disabled={auditLogPage === 1}
                          className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] disabled:opacity-40 cursor-pointer shadow-xs"
                          title="Previous Page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        {Array.from({ length: totalLogPages }, (_, i) => i + 1)
                          .slice(
                            Math.max(0, auditLogPage - 3),
                            Math.min(totalLogPages, auditLogPage + 2)
                          )
                          .map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setAuditLogPage(pageNum)}
                              className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center cursor-pointer transition-all ${
                                auditLogPage === pageNum
                                  ? 'gold-cyan-gradient-btn text-white shadow-xs'
                                  : 'bg-[#ffffff] border border-[#cbd5e1] text-[#334155] hover:bg-[#f1f5f9]'
                              }`}
                            >
                              {pageNum}
                            </button>
                          ))}

                        <button
                          type="button"
                          onClick={() => setAuditLogPage((prev) => Math.min(prev + 1, totalLogPages))}
                          disabled={auditLogPage === totalLogPages}
                          className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] disabled:opacity-40 cursor-pointer shadow-xs"
                          title="Next Page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </main>
      </div>

      {/* Invite Member Modal - Light Theme */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sora animate-in fade-in duration-200">
          <div className="bg-[#ffffff] border border-[#d0dbe5] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#cbd5e1] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] font-extrabold shadow-xs">
                  <UserPlus className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">Invite Team Member</h3>
                  <p className="text-[10px] text-[#0284c7] font-bold">Onboard new team member to vault</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-[#64748b] hover:text-[#0f172a] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!inviteLink ? (
              <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] font-bold placeholder-gray-400 focus:border-[#1fbbd2] focus:outline-none shadow-xs transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-1">
                    Role Permission
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] font-extrabold focus:border-[#1fbbd2] focus:outline-none shadow-xs cursor-pointer transition-all"
                  >
                    <option value="User" className="bg-white text-[#0f172a]">User (Can view & share allowed items)</option>
                    <option value="Admin" className="bg-white text-[#0f172a]">Admin (Can manage members & groups)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] text-[#334155] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gold-cyan-gradient-btn px-5 py-2.5 rounded-xl text-xs font-extrabold text-white shadow-md cursor-pointer"
                  >
                    Generate Invite Link
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <h4 className="text-base font-extrabold text-[#0f172a]">Invitation Link Created!</h4>
                <p className="text-xs text-[#64748b] font-medium">
                  Share this invitation link with <strong>{inviteEmail}</strong> to complete onboarding:
                </p>

                <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#cbd5e1] font-mono text-[11px] text-[#0284c7] break-all font-bold shadow-inner">
                  {inviteLink}
                </div>

                <button
                  onClick={handleCopyLink}
                  className="w-full gold-gradient-btn py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-white shadow-md cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
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
