'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Users, Folder, Key, Shield, Plus, ChevronRight, Search, UserPlus, Trash2, X, Check } from 'lucide-react';
import api from '@/lib/api';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'Members' | 'Folders' | 'Passwords' | 'Activity'>('Members');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  
  // Form States
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('User');

  useEffect(() => {
    fetchGroups();
    fetchUsers();
    fetchFolders();
    fetchResources();
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
      if (res.data.length > 0 && !selectedGroup) {
        setSelectedGroup(res.data[0]);
      }
    } catch (err) {
      console.error(err);
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
      const res = await api.get('/folders');
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

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/groups', { name: newGroupName, description: newGroupDesc });
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateGroupModal(false);
      await fetchGroups();
      if (res.data) setSelectedGroup(res.data);
    } catch (err) {
      alert('Failed to create group');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !selectedUserId) return;

    try {
      const res = await api.put(`/groups/${selectedGroup.id}`, {
        addUserId: selectedUserId,
        role: selectedRole,
      });
      setSelectedGroup(res.data);
      setShowAddMemberModal(false);
      setSelectedUserId('');
      fetchGroups();
    } catch (err) {
      alert('Failed to add member to group');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    if (!confirm('Remove member from group?')) return;

    try {
      const res = await api.put(`/groups/${selectedGroup.id}`, {
        removeUserId: userId,
      });
      setSelectedGroup(res.data);
      fetchGroups();
    } catch (err) {
      alert('Failed to remove member');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      await api.delete(`/groups/${groupId}`);
      setSelectedGroup(null);
      fetchGroups();
    } catch (err) {
      alert('Failed to delete group');
    }
  };

  // Resolve member users for selected group
  const groupMemberDetails = (selectedGroup?.members || []).map((m: any) => {
    const matchedUser = users.find((u) => u.id === m.userId);
    return {
      userId: m.userId,
      role: m.role || 'User',
      name: matchedUser?.name || 'Alex Mercer',
      email: matchedUser?.email || 'alex.mercer@acme.com',
      avatar: (matchedUser?.name || 'AM').slice(0, 2).toUpperCase(),
    };
  });

  return (
    <div className="flex min-h-screen bg-[#0b0f17] text-white select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header Title */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                <Users className="w-8 h-8 text-purple-400" />
                Groups Management
              </h1>
              <p className="text-xs text-gray-400">Organize users and manage shared access to vaults and items.</p>
            </div>

            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="purple-gradient-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          </div>

          {/* Dual-Pane Layout (Screenshots TdQv0.jpg & gp29w.jpg) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Groups List */}
            <div className="lg:col-span-1 glass-panel p-4 rounded-2xl border border-[rgba(124,58,237,0.2)] space-y-3">
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                {groups
                  .filter((g) => g.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((g) => {
                    const isSelected = selectedGroup?.id === g.id;
                    return (
                      <div
                        key={g.id}
                        onClick={() => setSelectedGroup(g)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-[#1e2638] border-purple-500/50 shadow-lg shadow-purple-950/40'
                            : 'bg-[#151b28]/60 border-gray-800/80 hover:border-purple-800/40 hover:bg-[#151b28]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-purple-400" />
                            <span className="font-bold text-sm text-white">{g.name}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </div>
                        <p className="text-[11px] text-gray-400 line-clamp-1 mb-2">{g.description}</p>
                        <span className="text-[10px] text-gray-500">
                          {g.members?.length || 1} members • Active {g.lastActive || 'Today'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Right Column: Dynamic Detailed Group View */}
            <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[#151b28]/95">
              {selectedGroup ? (
                <div>
                  {/* Group Header Banner */}
                  <div className="flex items-start justify-between pb-6 mb-6 border-b border-gray-800">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-purple-950 border border-purple-700/60 flex items-center justify-center text-purple-400 shadow-inner shrink-0">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">{selectedGroup.name}</h2>
                        <p className="text-xs text-gray-400 mt-1">{selectedGroup.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAddMemberModal(true)}
                        className="px-3 py-1.5 bg-[#1e2638] hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-white rounded-lg flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                        Add Member
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(selectedGroup.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-400 bg-gray-900 rounded-lg border border-gray-800"
                        title="Delete Group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Group Tabs */}
                  <div className="flex border-b border-gray-800 mb-6 gap-6">
                    {(['Members', 'Folders', 'Passwords', 'Activity'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-3 text-xs font-bold border-b-2 transition-all ${
                          activeTab === tab
                            ? 'border-purple-500 text-purple-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Members Tab */}
                  {activeTab === 'Members' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-400 mb-2">
                        <span>Group Members ({groupMemberDetails.length})</span>
                      </div>
                      <div className="divide-y divide-gray-800">
                        {groupMemberDetails.map((m: any) => (
                          <div key={m.userId} className="py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                {m.avatar}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-white">{m.name}</p>
                                <p className="text-[10px] text-gray-400">{m.email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`text-[10px] px-2.5 py-0.5 rounded font-semibold border ${
                                  m.role === 'Owner'
                                    ? 'bg-purple-950 text-purple-300 border-purple-800'
                                    : m.role === 'Admin'
                                    ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                                    : 'bg-gray-800 text-gray-300 border-gray-700'
                                }`}
                              >
                                {m.role}
                              </span>

                              {m.role !== 'Owner' && (
                                <button
                                  onClick={() => handleRemoveMember(m.userId)}
                                  className="text-gray-500 hover:text-rose-400 p-1"
                                  title="Remove member"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Folders Tab */}
                  {activeTab === 'Folders' && (
                    <div className="space-y-3">
                      {folders.map((f) => (
                        <div key={f.id} className="p-3.5 bg-[#0b0f17] rounded-xl border border-gray-800 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Folder className="w-5 h-5 text-purple-400" />
                            <div>
                              <p className="text-xs font-bold text-white">{f.name}</p>
                              <p className="text-[10px] text-gray-400">{f.description}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-purple-300 bg-purple-950 border border-purple-800 px-2 py-0.5 rounded">
                            Shared with Group
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Passwords Tab */}
                  {activeTab === 'Passwords' && (
                    <div className="space-y-3">
                      {resources.slice(0, 4).map((p) => (
                        <div key={p.id} className="p-3.5 bg-[#0b0f17] rounded-xl border border-gray-800 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Key className="w-5 h-5 text-purple-400" />
                            <div>
                              <p className="text-xs font-bold text-white">{p.name}</p>
                              <p className="text-[10px] text-gray-400">Username: {p.username}</p>
                            </div>
                          </div>
                          <span className="text-xs font-mono text-gray-400">••••••••</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'Activity' && (
                    <p className="text-xs text-gray-400 py-6 text-center">Group activity synced cleanly with security log.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-12">Select a group to view details</p>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modal 1: Create Group */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-purple-800/40 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create New Group</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g., DevOps Engineering"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Description</label>
                <textarea
                  placeholder="Describe group purpose..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white h-20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 purple-gradient-btn text-xs font-semibold rounded-lg">
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add Member to Selected Group */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-purple-800/40 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Add Member to {selectedGroup?.name}</h3>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Select User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                  required
                >
                  <option value="">Choose a user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Group Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full bg-[#151b28] border border-gray-700 rounded-lg p-2.5 text-xs text-white"
                >
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 purple-gradient-btn text-xs font-semibold rounded-lg">
                  Add to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
