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
  Lock,
  ChevronRight,
  Check,
  X,
  CheckSquare,
  Square
} from 'lucide-react';
import api from '@/lib/api';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'members' | 'folders' | 'passwords' | 'activity'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Create Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);

  // Add Member Form
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'User' | 'Admin'>('User');

  useEffect(() => {
    fetchGroups();
    fetchUsers();
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

  // Available users not currently in the selected group
  const availableUsersForGroup = selectedGroup
    ? users.filter((u) => !selectedGroup.members.some((m: any) => m.userId === u.id))
    : [];

  return (
    <div className="flex min-h-screen bg-[#0d1724] text-white select-none font-sora">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="p-8 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#17283b] border border-[#1fbbd2]/40 flex items-center justify-center text-[#1fbbd2] shadow">
                <Users className="w-5 h-5 text-[#1fbbd2]" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Groups Management</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Organize users and manage shared access to vaults and items.
                </p>
              </div>
            </div>

            {/* CREATE GROUP BUTTON */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="gold-gradient-btn px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 text-white shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Groups List */}
            <div className="glass-panel rounded-2xl p-5 border border-[rgba(31,187,210,0.25)] bg-[#17283b] space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#1fbbd2]"
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
                            ? 'bg-[#0d1724] border-[#f39c12] shadow-lg'
                            : 'bg-[#0d1724]/60 border-gray-700/60 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              isSelected ? 'bg-[#f39c12] text-[#0d1724]' : 'bg-[#0d1724] border border-gray-700 text-[#1fbbd2]'
                            }`}>
                              <Users className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white">{g.name}</h3>
                              <p className="text-[11px] text-gray-400 line-clamp-1">{g.description}</p>
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[#f39c12]' : 'text-gray-600'}`} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
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
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-[rgba(31,187,210,0.25)] bg-[#17283b] flex flex-col">
                {/* Group Header */}
                <div className="flex items-center justify-between pb-6 border-b border-gray-700">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[#0d1724] font-extrabold shadow">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedGroup.name}</h2>
                      <p className="text-xs text-gray-400">{selectedGroup.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* ADD MEMBER BUTTON */}
                    <button
                      onClick={() => {
                        setAddMemberUserId('');
                        setShowAddMemberModal(true);
                      }}
                      className="px-3 py-1.5 bg-[#0d1724] hover:bg-gray-800 border border-gray-700 hover:border-[#1fbbd2] rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#1fbbd2]" />
                      <span>Add Member</span>
                    </button>

                    {/* DELETE GROUP BUTTON */}
                    <button
                      onClick={handleDeleteGroup}
                      className="p-2 text-gray-400 hover:text-rose-400 bg-[#0d1724] border border-gray-700 hover:border-rose-500 rounded-xl transition-all cursor-pointer"
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
                  {activeTab === 'members' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
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
                            className="p-3 bg-[#0d1724] border border-gray-700/60 rounded-xl flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f39c12] to-[#1fbbd2] flex items-center justify-center text-[10px] font-extrabold text-[#0d1724]">
                                {userObj.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-white">{userObj.name}</p>
                                <p className="text-[10px] text-gray-400">{userObj.email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="bg-[#17283b] text-[#f39c12] border border-[#f39c12]/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {m.role}
                              </span>

                              {/* REMOVE MEMBER BUTTON */}
                              <button
                                onClick={() => handleRemoveMember(m.userId)}
                                className="text-gray-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
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

                  {activeTab === 'folders' && (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      <Folder className="w-8 h-8 text-[#f39c12] mx-auto mb-2 opacity-80" />
                      <p>Shared folders assigned to this group will be listed here.</p>
                    </div>
                  )}

                  {activeTab === 'passwords' && (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      <Lock className="w-8 h-8 text-[#1fbbd2] mx-auto mb-2 opacity-80" />
                      <p>Direct shared passwords assigned to this group will be listed here.</p>
                    </div>
                  )}

                  {activeTab === 'activity' && (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      <Shield className="w-8 h-8 text-[#f39c12] mx-auto mb-2 opacity-80" />
                      <p>Group activity audit logs will be displayed here.</p>
                    </div>
                  )}
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
                  className="gold-gradient-btn px-5 py-2 text-white rounded-xl font-extrabold shadow-lg"
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
                    className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer"
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
                  className="w-full bg-[#0d1724] border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#1fbbd2] outline-none cursor-pointer"
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
                  className="gold-cyan-gradient-btn px-5 py-2 text-[#0d1724] rounded-xl font-extrabold shadow-lg disabled:opacity-50"
                >
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
