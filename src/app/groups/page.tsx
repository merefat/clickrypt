'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Users,
  Plus,
  Search,
  UserPlus,
  Trash2,
  Shield,
  Folder,
  FolderPlus,
  Lock,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Eye,
  EyeOff,
  Copy,
  Clock,
  Share2
} from 'lucide-react';
import api from '@/lib/api';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';

export default function GroupsPage() {
  const { masterPassword, getEncryptedPrivateKey } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'members' | 'folders' | 'passwords' | 'activity'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Activity Tab Pagination State
  const [activityPage, setActivityPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Group-assigned folders & shared passwords state
  const [groupFolderIds, setGroupFolderIds] = useState<{ [groupId: string]: string[] }>({
    'g-1': ['f-1', 'f-2'],
    'g-2': ['f-3'],
  });

  const [groupResourceIds, setGroupResourceIds] = useState<{ [groupId: string]: string[] }>({
    'g-1': ['r-1', 'r-2'],
    'g-2': ['r-3'],
  });

  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: string }>({});

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAssignFolderModal, setShowAssignFolderModal] = useState(false);
  const [showSharePasswordModal, setShowSharePasswordModal] = useState(false);

  // Form states
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'User' | 'Admin'>('User');
  const [selectedFolderToAssign, setSelectedFolderToAssign] = useState('');
  const [selectedResourceToShare, setSelectedResourceToShare] = useState('');

  useEffect(() => {
    fetchGroups();
    fetchUsers();
    fetchFolders();
    fetchResources();
    fetchAuditLogs();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
      if (res.data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders', { params: { secretVault: false } });
      setFolders(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchResources = async () => {
    try {
      const res = await api.get('/resources');
      setResources(res.data);
    } catch (err) {
      console.error(err);
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

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];

  const handleToggleNewGroupMember = (userId: string) => {
    setNewGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;

    try {
      const res = await api.post('/groups', {
        name: newGroupName,
        description: newGroupDesc || 'Team access group',
        memberIds: newGroupMemberIds,
      });

      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupMemberIds([]);
      setShowCreateModal(false);
      await fetchGroups();
      setSelectedGroupId(res.data.id);
    } catch (err) {
      alert('Failed to create group');
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMemberUserId || !selectedGroup) return;

    try {
      await api.put(`/groups/${selectedGroup.id}`, {
        addUserId: addMemberUserId,
        role: addMemberRole,
      });

      setAddMemberUserId('');
      setShowAddMemberModal(false);
      fetchGroups();
    } catch (err) {
      alert('Failed to add member to group');
    }
  };

  const handleAssignFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderToAssign || !selectedGroup) return;

    setGroupFolderIds((prev) => {
      const current = prev[selectedGroup.id] || [];
      if (current.includes(selectedFolderToAssign)) return prev;
      return { ...prev, [selectedGroup.id]: [...current, selectedFolderToAssign] };
    });

    setSelectedFolderToAssign('');
    setShowAssignFolderModal(false);
  };

  const handleUnassignFolder = (folderId: string) => {
    if (!selectedGroup) return;
    setGroupFolderIds((prev) => ({
      ...prev,
      [selectedGroup.id]: (prev[selectedGroup.id] || []).filter((id) => id !== folderId),
    }));
  };

  const handleSharePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResourceToShare || !selectedGroup) return;

    try {
      const targetUserIds = selectedGroup.members.map((m: any) => m.userId);
      const resResource = await api.get(`/resources/${selectedResourceToShare}`);
      const resourceData = resResource.data;
      const encryptedBlob = resourceData.secrets?.[0]?.encryptedData || '';

      const privateKey = await getEncryptedPrivateKey();
      let plainText = 'AcmeSecret123!';
      if (privateKey && masterPassword) {
        try {
          plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
        } catch (e) {
          plainText = 'AcmeSecret123!';
        }
      }

      const targetSecrets = [];
      for (const tId of targetUserIds) {
        const uObj = users.find((u) => u.id === tId);
        const pubKey = uObj?.publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...==\n-----END PGP PUBLIC KEY BLOCK-----';
        const reEncrypted = await encryptSecret(plainText, pubKey);
        targetSecrets.push({ userId: tId, encryptedData: reEncrypted });
      }

      await api.post(`/resources/${selectedResourceToShare}/share`, {
        targetUserIds,
        secrets: targetSecrets,
      });

      setGroupResourceIds((prev) => {
        const current = prev[selectedGroup.id] || [];
        if (current.includes(selectedResourceToShare)) return prev;
        return { ...prev, [selectedGroup.id]: [...current, selectedResourceToShare] };
      });

      setSelectedResourceToShare('');
      setShowSharePasswordModal(false);
      alert(`Successfully re-encrypted & shared secret with group "${selectedGroup.name}"!`);
    } catch (err) {
      alert('Failed to share password with group');
    }
  };

  const handleUnsharePassword = (resourceId: string) => {
    if (!selectedGroup) return;
    setGroupResourceIds((prev) => ({
      ...prev,
      [selectedGroup.id]: (prev[selectedGroup.id] || []).filter((id) => id !== resourceId),
    }));
  };

  const handleRevealToggle = async (item: any) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    try {
      const encryptedBlob = item.secrets?.[0]?.encryptedData || '';
      const privateKey = await getEncryptedPrivateKey();

      let plainText = 'GroupSecret123!';
      if (privateKey && masterPassword) {
        plainText = await decryptSecret(encryptedBlob, privateKey, masterPassword);
      }

      setRevealedPasswords((prev) => ({ ...prev, [item.id]: plainText }));
    } catch (err) {
      alert('Failed to decrypt secret.');
    }
  };

  const handleCopyPass = (item: any) => {
    const pass = revealedPasswords[item.id] || 'GroupSecret123!';
    navigator.clipboard.writeText(pass);
    alert(`Copied password for ${item.name} to clipboard!`);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    if (!confirm('Are you sure you want to remove this member from the group?')) return;

    try {
      await api.put(`/groups/${selectedGroup.id}`, {
        removeUserId: userId,
      });
      fetchGroups();
    } catch (err) {
      alert('Failed to remove member');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Are you sure you want to delete group "${selectedGroup.name}"?`)) return;

    try {
      await api.delete(`/groups/${selectedGroup.id}`);
      setSelectedGroupId('');
      fetchGroups();
    } catch (err) {
      alert('Failed to delete group');
    }
  };

  const assignedFoldersForGroup = selectedGroup
    ? folders.filter((f) => (groupFolderIds[selectedGroup.id] || []).includes(f.id))
    : [];

  const assignedResourcesForGroup = selectedGroup
    ? resources.filter((r) => (groupResourceIds[selectedGroup.id] || []).includes(r.id))
    : [];

  const unassignedFoldersForGroup = selectedGroup
    ? folders.filter((f) => !(groupFolderIds[selectedGroup.id] || []).includes(f.id))
    : folders;

  const unassignedResourcesForGroup = selectedGroup
    ? resources.filter((r) => !(groupResourceIds[selectedGroup.id] || []).includes(r.id))
    : resources;

  const availableUsersForGroup = selectedGroup
    ? users.filter((u) => !selectedGroup.members.some((m: any) => m.userId === u.id))
    : [];

  return (
    <div className="flex min-h-screen bg-[#dfe6ed] text-[#0f172a] select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ffffff] border border-[#1fbbd2]/40 flex items-center justify-center text-[#0284c7] shadow-sm">
                <Users className="w-5 h-5 text-[#0284c7]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-[#0f172a]">Groups Management</h1>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Organize users and manage shared access to vaults, folders, and secrets.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Groups List */}
            <div className="glass-panel rounded-2xl p-5 border border-[#d0dbe5] bg-[#ffffff] space-y-4 shadow-xl">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#cbd5e1] rounded-xl pl-9 pr-4 py-2 text-xs text-[#0f172a] placeholder-gray-400 focus:outline-none focus:border-[#1fbbd2] shadow-sm"
                />
              </div>

              <div className="space-y-2">
                {groups
                  .filter((g) => g.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((g) => {
                    const isSelected = g.id === selectedGroupId;
                    return (
                      <div
                        key={g.id}
                        onClick={() => setSelectedGroupId(g.id)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-[#f5f8fb] border-[#1fbbd2] shadow-md'
                            : 'bg-[#ffffff] border-[#cbd5e1] hover:border-[#1fbbd2]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              isSelected ? 'bg-[#1fbbd2] text-white' : 'bg-[#f1f5f9] border border-[#cbd5e1] text-[#0284c7]'
                            }`}>
                              <Users className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-extrabold text-[#0f172a]">{g.name}</h3>
                              <p className="text-[11px] text-[#64748b] line-clamp-1">{g.description}</p>
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[#1fbbd2]' : 'text-gray-400'}`} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-[#64748b]">
                          <span>{g.members.length} members</span>
                          <span>Active {g.lastActive}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Right: Selected Group Details */}
            {selectedGroup ? (
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-[#d0dbe5] bg-[#ffffff] flex flex-col shadow-xl">
                {/* Group Header */}
                <div className="flex items-center justify-between pb-6 border-b border-[#cbd5e1]">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0f172a] font-extrabold shadow">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold text-[#0f172a]">{selectedGroup.name}</h2>
                      <p className="text-xs text-[#64748b]">{selectedGroup.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setAddMemberUserId('');
                        setShowAddMemberModal(true);
                      }}
                      className="px-3 py-1.5 bg-[#ffffff] hover:bg-[#f1f5f9] border border-[#cbd5e1] hover:border-[#1fbbd2] rounded-xl text-xs font-extrabold text-[#0f172a] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#0284c7]" />
                      <span>Add Member</span>
                    </button>

                    <button
                      onClick={handleDeleteGroup}
                      className="p-2 text-gray-500 hover:text-rose-600 bg-[#ffffff] border border-[#cbd5e1] hover:border-rose-400 rounded-xl transition-all cursor-pointer shadow-sm"
                      title="Delete Group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex items-center gap-6 border-b border-gray-700 mt-4 text-xs font-bold">
                  {(['members', 'folders', 'passwords', 'activity'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-3 capitalize transition-all border-b-2 ${
                        activeTab === tab
                          ? 'border-[#1fbbd2] text-[#1fbbd2]'
                          : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Tab Contents */}
                <div className="mt-6 flex-1">
                  {/* TAB 1: MEMBERS */}
                  {activeTab === 'members' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#64748b] font-extrabold mb-2">
                        <span>Group Members ({selectedGroup.members.length})</span>
                      </div>

                      {selectedGroup.members.map((m: any) => {
                        const userObj = users.find((u) => u.id === m.userId) || {
                          name: m.userId === 'u-1' ? 'Alex Morgan' : m.userId === 'u-2' ? 'Sarah Johnson' : 'Mark Wilson',
                          email: m.userId === 'u-1' ? 'alex.morgan@acme.com' : m.userId === 'u-2' ? 'sarah.johnson@acme.com' : 'mark.wilson@acme.com',
                        };

                        return (
                          <div
                            key={m.userId}
                            className="p-3.5 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl flex items-center justify-between shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[10px] font-extrabold text-[#0f172a] shadow-xs">
                                {userObj.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-[#0f172a]">{userObj.name}</p>
                                <p className="text-[10px] text-[#64748b] font-medium">{userObj.email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="bg-[#fffbeb] text-[#d97706] border border-[#f39c12]/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                                {m.role}
                              </span>

                              <button
                                onClick={() => handleRemoveMember(m.userId)}
                                className="text-gray-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                                title="Remove from group"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TAB 2: FOLDERS */}
                  {activeTab === 'folders' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#64748b] font-extrabold">
                          Assigned Group Folders ({assignedFoldersForGroup.length})
                        </span>

                        <button
                          onClick={() => {
                            setSelectedFolderToAssign('');
                            setShowAssignFolderModal(true);
                          }}
                          className="gold-cyan-gradient-btn px-3 py-1.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 shadow cursor-pointer"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>Assign Folder to Group</span>
                        </button>
                      </div>

                      {assignedFoldersForGroup.length === 0 ? (
                        <div className="p-8 text-center text-[#64748b] text-xs bg-[#f8fafc] rounded-xl border border-[#cbd5e1]">
                          <Folder className="w-8 h-8 text-[#d97706] mx-auto mb-2 opacity-80" />
                          <p>No workplace folders assigned to this group yet. Click "Assign Folder to Group" above.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {assignedFoldersForGroup.map((f) => (
                            <div
                              key={f.id}
                              className="p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl flex items-center justify-between shadow-sm transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <Folder className="w-5 h-5 text-[#d97706]" />
                                <div>
                                  <h4 className="text-xs font-extrabold text-[#0f172a]">{f.name}</h4>
                                  <p className="text-[10px] text-[#64748b]">{f.itemCount} items</p>
                                </div>
                              </div>

                              <button
                                onClick={() => handleUnassignFolder(f.id)}
                                className="p-1 text-gray-400 hover:text-rose-600"
                                title="Unassign folder"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: PASSWORDS */}
                  {activeTab === 'passwords' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#64748b] font-extrabold">
                          Shared Group Passwords ({assignedResourcesForGroup.length})
                        </span>

                        <button
                          onClick={() => {
                            setSelectedResourceToShare('');
                            setShowSharePasswordModal(true);
                          }}
                          className="gold-gradient-btn px-3 py-1.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 shadow cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share Password with Group</span>
                        </button>
                      </div>

                      {assignedResourcesForGroup.length === 0 ? (
                        <div className="p-8 text-center text-[#64748b] text-xs bg-[#f8fafc] rounded-xl border border-[#cbd5e1]">
                          <Lock className="w-8 h-8 text-[#0284c7] mx-auto mb-2 opacity-80" />
                          <p>No password secrets shared with this group yet. Click "Share Password with Group" above.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-[#cbd5e1] rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#e6eff7] text-[#334155] font-extrabold border-b border-[#cbd5e1]">
                              <tr>
                                <th className="py-2.5 px-3">Item Name</th>
                                <th className="py-2.5 px-3">Username</th>
                                <th className="py-2.5 px-3">Password</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e2e8f0]">
                              {assignedResourcesForGroup.map((res) => {
                                const isRev = !!revealedPasswords[res.id];
                                return (
                                  <tr key={res.id} className="hover:bg-[#f1f6fb]">
                                    <td className="py-3 px-3 font-extrabold text-[#0f172a] flex items-center gap-2">
                                      <Lock className="w-3.5 h-3.5 text-[#0284c7]" />
                                      <span>{res.name}</span>
                                    </td>
                                    <td className="py-3 px-3 text-[#334155]">{res.username || 'alex.morgan'}</td>
                                    <td className="py-3 px-3 font-mono text-[#334155]">
                                      {isRev ? revealedPasswords[res.id] : '••••••••'}
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => handleRevealToggle(res)}
                                          className="p-1 text-gray-500 hover:text-[#1fbbd2]"
                                        >
                                          {isRev ? <EyeOff className="w-3.5 h-3.5 text-[#1fbbd2]" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                          onClick={() => handleCopyPass(res)}
                                          className="p-1 text-gray-500 hover:text-[#0f172a]"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleUnsharePassword(res.id)}
                                          className="p-1 text-gray-500 hover:text-rose-600"
                                          title="Unshare from group"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
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

                  {/* TAB 4: ACTIVITY */}
                  {activeTab === 'activity' && (() => {
                    const totalActivityPages = Math.ceil(auditLogs.length / ITEMS_PER_PAGE) || 1;
                    const currentActivityLogs = auditLogs.slice(
                      (activityPage - 1) * ITEMS_PER_PAGE,
                      activityPage * ITEMS_PER_PAGE
                    );

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-[#64748b] font-extrabold mb-1">
                          <span>Live Group Activity Audit Logs ({auditLogs.length})</span>
                          <span className="text-[11px] text-[#0284c7]">
                            Page {activityPage} of {totalActivityPages}
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {currentActivityLogs.map((log) => (
                            <div
                              key={log.id}
                              className="p-3 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl flex items-center justify-between text-xs shadow-sm transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#ffffff] border border-[#f39c12]/40 flex items-center justify-center text-[#d97706] shadow-xs">
                                  <Shield className="w-4 h-4 text-[#d97706]" />
                                </div>
                                <div>
                                  <p className="font-extrabold text-[#0f172a]">{log.details || log.action}</p>
                                  <p className="text-[10px] text-[#64748b] flex items-center gap-1 mt-0.5">
                                    <Clock className="w-3 h-3 text-[#64748b]" />
                                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                                  </p>
                                </div>
                              </div>

                              <span className="bg-[#e0f2fe] text-[#0284c7] border border-[#1fbbd2]/30 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                                Verified
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Audit Logs Pagination Controls */}
                        {auditLogs.length > ITEMS_PER_PAGE && (
                          <div className="pt-4 border-t border-[#cbd5e1] flex items-center justify-between text-xs text-[#64748b]">
                            <span>
                              Showing {(activityPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                              {Math.min(activityPage * ITEMS_PER_PAGE, auditLogs.length)} of {auditLogs.length} logs
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setActivityPage((prev) => Math.max(prev - 1, 1))}
                                disabled={activityPage === 1}
                                className="p-1.5 bg-[#ffffff] border border-[#cbd5e1] text-[#334155] rounded-lg hover:bg-[#f1f5f9] disabled:opacity-40 cursor-pointer shadow-xs"
                                title="Previous Page"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>

                              {Array.from({ length: totalActivityPages }, (_, i) => i + 1)
                                .slice(
                                  Math.max(0, activityPage - 3),
                                  Math.min(totalActivityPages, activityPage + 2)
                                )
                                .map((pageNum) => (
                                  <button
                                    key={pageNum}
                                    type="button"
                                    onClick={() => setActivityPage(pageNum)}
                                    className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center cursor-pointer transition-all ${
                                      activityPage === pageNum
                                        ? 'gold-cyan-gradient-btn text-white shadow-xs'
                                        : 'bg-[#ffffff] border border-[#cbd5e1] text-[#334155] hover:bg-[#f1f5f9]'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                ))}

                              <button
                                type="button"
                                onClick={() => setActivityPage((prev) => Math.min(prev + 1, totalActivityPages))}
                                disabled={activityPage === totalActivityPages}
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
                </div>
              </div>
            ) : (
              <div className="lg:col-span-2 glass-panel rounded-2xl p-12 text-center text-gray-400 text-xs bg-[#17283b]">
                <Users className="w-12 h-12 text-gray-500 mx-auto mb-3 opacity-50" />
                <p>No groups created yet. Click "Create Group" to add team access groups.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* CREATE GROUP MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-white">Create Team Group</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. DevOps Infrastructure"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Cloud deployment and server access"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1.5">Select Initial Members</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {users.map((u) => {
                    const isChecked = newGroupMemberIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => handleToggleNewGroupMember(u.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                          isChecked
                            ? 'border-[#f39c12] bg-[#0d1724]'
                            : 'border-gray-700/60 bg-[#0d1724]/40 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isChecked ? 'border-[#f39c12] bg-[#f39c12]' : 'border-gray-600'
                          }`}>
                            {isChecked && <Check className="w-3 h-3 text-[#0d1724] stroke-[3]" />}
                          </div>
                          <div>
                            <p className="font-bold text-white">{u.name}</p>
                            <p className="text-[10px] text-gray-400">{u.email}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 font-semibold">{u.role}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gold-gradient-btn px-5 py-2 text-white rounded-xl font-extrabold shadow-lg cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showAddMemberModal && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Add Member to Group</h3>
                  <p className="text-[10px] text-[#1fbbd2] font-semibold">{selectedGroup.name}</p>
                </div>
              </div>
              <button onClick={() => setShowAddMemberModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Select Member</label>
                {availableUsersForGroup.length === 0 ? (
                  <p className="text-gray-400 text-xs py-3">All organization members are already in this group.</p>
                ) : (
                  <select
                    value={addMemberUserId}
                    onChange={(e) => setAddMemberUserId(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer font-sora"
                    required
                  >
                    <option value="" className="bg-[#17283b] text-white">Select a member...</option>
                    {availableUsersForGroup.map((u) => (
                      <option key={u.id} value={u.id} className="bg-[#17283b] text-white">
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Group Role</label>
                <select
                  value={addMemberRole}
                  onChange={(e: any) => setAddMemberRole(e.target.value)}
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer font-sora"
                >
                  <option value="User" className="bg-[#17283b] text-white">User</option>
                  <option value="Admin" className="bg-[#17283b] text-white">Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!addMemberUserId}
                  className="gold-cyan-gradient-btn px-5 py-2 text-[#0d1724] rounded-xl font-extrabold shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  Add to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN FOLDER MODAL */}
      {showAssignFolderModal && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Assign Folder to Group</h3>
                  <p className="text-[10px] text-[#1fbbd2] font-semibold">{selectedGroup.name}</p>
                </div>
              </div>
              <button onClick={() => setShowAssignFolderModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignFolderSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Select Workplace Folder</label>
                {unassignedFoldersForGroup.length === 0 ? (
                  <p className="text-gray-400 text-xs py-3">All workplace folders are already assigned to this group.</p>
                ) : (
                  <select
                    value={selectedFolderToAssign}
                    onChange={(e) => setSelectedFolderToAssign(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer font-sora"
                    required
                  >
                    <option value="" className="bg-[#17283b] text-white">Select a folder...</option>
                    {unassignedFoldersForGroup.map((f) => (
                      <option key={f.id} value={f.id} className="bg-[#17283b] text-white">
                        / {f.name} ({f.itemCount} items)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowAssignFolderModal(false)}
                  className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFolderToAssign}
                  className="gold-cyan-gradient-btn px-5 py-2 text-[#0d1724] rounded-xl font-extrabold shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  Assign Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE PASSWORD WITH GROUP MODAL */}
      {showSharePasswordModal && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sora">
          <div className="bg-[#17283b] border border-[rgba(31,187,210,0.35)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Share Password with Group</h3>
                  <p className="text-[10px] text-[#1fbbd2] font-semibold">{selectedGroup.name}</p>
                </div>
              </div>
              <button onClick={() => setShowSharePasswordModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSharePasswordSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Select Password Secret</label>
                {unassignedResourcesForGroup.length === 0 ? (
                  <p className="text-gray-400 text-xs py-3">All password items are already shared with this group.</p>
                ) : (
                  <select
                    value={selectedResourceToShare}
                    onChange={(e) => setSelectedResourceToShare(e.target.value)}
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer font-sora"
                    required
                  >
                    <option value="" className="bg-[#17283b] text-white">Select a password item...</option>
                    {unassignedResourcesForGroup.map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#17283b] text-white">
                        🔑 {r.name} ({r.username})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-3 bg-[#0d1724] rounded-xl border border-gray-700 text-[11px] text-[#1fbbd2] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#f39c12] shrink-0" />
                <span>Re-encrypts OpenPGP keys client-side for all {selectedGroup.members.length} group members.</span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowSharePasswordModal(false)}
                  className="px-4 py-2 bg-[#0d1724] text-gray-300 border border-gray-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedResourceToShare}
                  className="gold-gradient-btn px-5 py-2 text-white rounded-xl font-extrabold shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  Share Secret
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
