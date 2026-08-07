const API_BASE = "/api/v1";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      sessionStorage.setItem("cp_at", token);
    } else {
      sessionStorage.removeItem("cp_at");
    }
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = sessionStorage.getItem("cp_at");
  }
  return accessToken;
}

interface ApiOptions extends RequestInit {
  /** Skip auth header (used by register/login). */
  skipAuth?: boolean;
  /** Skip Content-Type: application/json (used for FormData uploads). */
  skipJson?: boolean;
}

export async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = await res.json();
  setAccessToken(data.accessToken);
  return true;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { skipAuth, skipJson, headers, ...rest } = options;

  const authHeaders: Record<string, string> = {};
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      authHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const defaultHeaders: Record<string, string> = { ...authHeaders };
  if (!skipJson) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { ...defaultHeaders, ...headers },
    ...rest,
  });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return api(path, options);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed", body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown
  ) {
    super(message);
  }
}

// ── Typed API methods ─────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  orgRole: string;
  status: string;
  orgId: string;
  fingerprint: string | null;
  avatarBase64: string | null;
  jobTitle: string | null;
  phone: string | null;
  bio: string | null;
  timezone: string | null;
  createdAt: string;
}

export interface ChallengeResponse {
  challenge: string;
  encryptedPrivateKey: import("@clickrypt/crypto").EncryptedBlob;
  fingerprint: string;
  expiresIn: number;
}

export interface LoginResponse {
  accessToken: string;
  mfaRequired: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization?: { id: string; name: string; mode: string } | null;
  membership?: { role: string; status: string } | null;
}

export const apiClient = {
  register: (data: {
    email: string;
    firstName: string;
    lastName: string;
    armoredPublicKey: string;
    encryptedPrivateKey: unknown;
  }) =>
    api<UserProfile>("/users/register", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    }),

  verify: (email: string) =>
    api<ChallengeResponse>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuth: true,
    }),

  login: (email: string, token: string) =>
    api<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, token }),
      skipAuth: true,
    }),

  logout: () => api("/auth/logout", { method: "POST" }),

  me: () => api<UserProfile>("/users/me"),

  completeSetup: (data: {
    email: string;
    firstName: string;
    lastName: string;
    armoredPublicKey: string;
    encryptedPrivateKey: Record<string, unknown>;
  }) =>
    api<UserProfile>("/users/setup", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    }),

  updateProfile: (data: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
    timezone?: string;
    avatarBase64?: string;
  }) =>
    api<UserProfile>("/users/me", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  uploadAvatar: (avatarBase64: string) =>
    api<UserProfile>("/users/me/avatar", {
      method: "POST",
      body: JSON.stringify({ avatarBase64 }),
    }),

  removeAvatar: () =>
    api<UserProfile>("/users/me/avatar", { method: "DELETE" }),

  listUsers: () => api<UserProfile[]>("/users"),

  lookupUserByEmail: (email: string) =>
    api<UserProfile>(`/users/lookup?email=${encodeURIComponent(email)}`),

  getPublicKey: (userId: string) =>
    api<{ publicKey: string; fingerprint: string }>(`/users/${userId}/public-key`),

  getMyPublicKey: () =>
    api<{ publicKey: string; fingerprint: string }>("/users/me/public-key"),

  // ── Resources ──────────────────────────────────────────────────────

  listResources: () =>
    api<ResourceListItem[]>("/resources"),

  getResource: (id: string) =>
    api<ResourceDetail>(`/resources/${id}`),

  getSecret: (id: string) =>
    api<{ encryptedData: string }>(`/resources/${id}/secret`),

  createResource: (data: {
    name: string;
    uri?: string;
    folderId?: string;
    groupId?: string;
    encryptedData?: string;
    metadata?: Record<string, unknown>;
    resourceType?: string;
    additionalSecrets?: Record<string, string>;
    sharingMode?: "AUTO" | "RESTRICTED";
  }) => {
    return api<ResourceListItem>("/resources", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateResource: (id: string, data: {
    name?: string;
    uri?: string;
    folderId?: string;
    encryptedData?: string;
    metadata?: Record<string, unknown>;
    additionalSecrets?: Record<string, string>;
    sharingMode?: "AUTO" | "RESTRICTED";
  }) =>
    api<ResourceDetail>(`/resources/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteResource: (id: string) =>
    api(`/resources/${id}`, { method: "DELETE" }),

  listPermissions: (id: string) =>
    api<PermissionEntry[]>(`/resources/${id}/permissions`),

  getResourceActivity: (id: string) =>
    api<ResourceActivityItem[]>(`/resources/${id}/activity`),

  // ── Sharing ────────────────────────────────────────────────────────

  shareResource: (id: string, recipients?: ShareRecipient[], groupRecipients?: GroupShareRecipient[]) =>
    api(`/resources/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ recipients: recipients ?? [], groupRecipients: groupRecipients ?? [] }),
    }),

  revokeShare: (id: string, userId: string) =>
    api(`/resources/${id}/share/${userId}`, { method: "DELETE" }),

  revokeGroupShare: (id: string, groupId: string) =>
    api(`/resources/${id}/share/group/${groupId}`, { method: "DELETE" }),

  // ── Folders ────────────────────────────────────────────────────────

  listFolders: () => api<Folder[]>("/folders"),

  createFolder: (data: { name: string; parentFolderId?: string; groupId?: string }) =>
    api<Folder>("/folders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateFolder: (id: string, data: { name?: string; parentFolderId?: string | null }) =>
    api<Folder>(`/folders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  reorderFolder: (id: string, data: { parentFolderId: string | null; sortOrder: number }) =>
    api<Folder>(`/folders/${id}/reorder`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteFolder: (id: string) =>
    api(`/folders/${id}`, { method: "DELETE" }),

  listFolderPermissions: (id: string) =>
    api<PermissionEntry[]>(`/folders/${id}/permissions`),

  shareFolder: (id: string, data: { recipients?: { userId: string; permission: "READ" | "UPDATE" | "OWNER" }[]; groupRecipients?: { groupId: string; permission: "READ" | "UPDATE" }[] }) =>
    api(`/folders/${id}/share`, { method: "POST", body: JSON.stringify(data) }),

  revokeFolderShare: (id: string, userId: string) =>
    api(`/folders/${id}/share/${userId}`, { method: "DELETE" }),

  revokeFolderGroupShare: (id: string, groupId: string) =>
    api(`/folders/${id}/share/group/${groupId}`, { method: "DELETE" }),

  getFolderDescendantCount: (id: string) =>
    api<{ count: number }>(`/folders/${id}/descendant-count`),

  // ── Tags ───────────────────────────────────────────────────────────

  listTags: () => api<Tag[]>("/tags"),

  createTag: (data: { name: string; color?: string }) =>
    api<Tag>("/tags", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteTag: (id: string) =>
    api(`/tags/${id}`, { method: "DELETE" }),

  attachTag: (resourceId: string, tagId: string) =>
    api(`/resources/${resourceId}/tags/${tagId}`, { method: "POST" }),

  detachTag: (resourceId: string, tagId: string) =>
    api(`/resources/${resourceId}/tags/${tagId}`, { method: "DELETE" }),

  // ── MFA ─────────────────────────────────────────────────────────────

  getMfaStatus: () => api<{ enabled: boolean }>("/mfa/status"),

  enrollTotp: () => api<{ secret: string; otpauthUri: string }>("/mfa/totp/enroll", { method: "POST" }),

  verifyTotp: (code: string) =>
    api<{ enabled: boolean }>("/mfa/totp/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  disableMfa: () => api("/mfa", { method: "DELETE" }),

  loginMfa: (mfaToken: string, code: string) =>
    api<{ accessToken: string; mfaRequired: boolean; user: { id: string; email: string; firstName: string; lastName: string }; organization?: { id: string; name: string; mode: string } | null; membership?: { role: string; status: string } | null }>("/auth/login/mfa", {
      method: "POST",
      body: JSON.stringify({ mfaToken, code }),
      skipAuth: true,
    }),

  // ── Admin ───────────────────────────────────────────────────────────

  adminListUsers: () => api<AdminUser[]>("/admin/users"),

  adminUpdateUserStatus: (userId: string, status: string) =>
    api(`/admin/users/${userId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  adminUpdateUserRole: (userId: string, role: string) =>
    api(`/admin/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  adminListAuditLogs: (limit = 100, offset = 0) =>
    api<{ items: AuditLogEntry[]; total: number }>(
      `/admin/audit-logs?limit=${limit}&offset=${offset}`
    ),

  adminDeleteUser: (userId: string) =>
    api(`/admin/users/${userId}`, { method: "DELETE" }),

  adminInviteUser: (data: { email: string; role: string }) =>
    api<AdminUser>("/admin/users/invite", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  adminAddMember: (data: { email: string; firstName: string; lastName: string; role: string; password?: string }) =>
    api<AdminUser & { inviteLink: string }>("/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getDeploymentConfig: () =>
    api<{ deploymentMode: "self-hosted" | "organization" }>("/health/config", { skipAuth: true }),

  getSetupStatus: () =>
    api<{ isConfigured: boolean; needsSetup: boolean; initialized: boolean }>("/health/setup-status", { skipAuth: true }),

  // ── Setup ────────────────────────────────────────────────────────────

  setupStatus: () =>
    api<{ initialized: boolean; mode?: string; organizationName?: string | null }>("/setup/status", { skipAuth: true }),

  configureSystem: (data: { mode: string; orgName: string }) =>
    api<{ configured: boolean; orgId?: string; accessToken?: string }>("/system/config", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    }).then((res) => {
      if (res.accessToken) setAccessToken(res.accessToken);
      return res;
    }),

  setupInitialize: (data: { mode?: string; orgName?: string; email: string; firstName: string; lastName: string; armoredPublicKey: string; encryptedPrivateKey: Record<string, unknown> }) =>
    api<{ org: { id: string; name: string; mode: string }; user: { id: string; email: string; firstName: string; lastName: string; orgRole: string; status: string } }>("/setup/initialize", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    }),

  // ── Orgs ────────────────────────────────────────────────────────────

  getOrgInfo: () =>
    api<{ id: string; name: string; mode: string }>("/orgs/me"),

  createOrg: (data: { mode: string; name: string }) =>
    api<{ id: string; name: string; mode: string }>("/orgs", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  refresh: () =>
    api<{ accessToken: string }>("/auth/refresh", { method: "POST" }).then(
      (res) => {
        setAccessToken(res.accessToken);
        return res;
      }
    ),

  getSmtpSettings: () =>
    api<Partial<SmtpSettings>>("/orgs/settings/smtp"),

  updateSmtpSettings: (data: SmtpSettings) =>
    api<SmtpSettings>("/orgs/settings/smtp", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getEmailLogs: () =>
    api<EmailLogEntry[]>("/orgs/settings/email-logs"),

  // ── Memberships ──────────────────────────────────────────────────────

  getOrgMemberKeys: () =>
    api<{ userId: string; publicKey: string }[]>("/organizations/members/keys"),

  listMembersBasic: () =>
    api<{ id: string; email: string; firstName: string; lastName: string }[]>("/organizations/members/basic"),

  listMembers: (orgId: string) =>
    api<MemberEntry[]>(`/organizations/${orgId}/members`),

  updateMemberRole: (orgId: string, userId: string, role: string) =>
    api(`/organizations/${orgId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  suspendMember: (orgId: string, userId: string) =>
    api(`/organizations/${orgId}/members/${userId}/suspend`, { method: "POST" }),

  restoreMember: (orgId: string, userId: string) =>
    api(`/organizations/${orgId}/members/${userId}/restore`, { method: "POST" }),

  removeMember: (orgId: string, userId: string) =>
    api(`/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),

  transferOwnership: (orgId: string, newOwnerId: string) =>
    api(`/organizations/${orgId}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify({ newOwnerId }),
    }),

  // ── Invitations ──────────────────────────────────────────────────────

  createInvitation: (orgId: string, data: { email: string; role: string }) =>
    api<{ id: string; email: string; role: string; expiresAt: string; token: string; inviteLink: string }>(`/organizations/${orgId}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listInvitations: (orgId: string) =>
    api<{ id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string }[]>(`/organizations/${orgId}/invitations`),

  revokeInvitation: (orgId: string, inviteId: string) =>
    api(`/organizations/${orgId}/invitations/${inviteId}`, { method: "DELETE" }),

  getInvitePreview: (token: string) =>
    api<{ email: string; role: string; orgName: string; expiresAt: string }>(`/invitations/${token}`, { skipAuth: true }),

  acceptInvite: (token: string, data: { firstName: string; lastName: string; armoredPublicKey: string; encryptedPrivateKey: Record<string, unknown> }) =>
    api(`/invitations/${token}/accept`, {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    }),

  // ── Groups ──────────────────────────────────────────────────────────

  listGroups: () => api<GroupInfo[]>("/groups"),

  getGroup: (id: string) => api<GroupDetail>(`/groups/${id}`),

  createGroup: (name: string) =>
    api<GroupInfo>("/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  updateGroup: (id: string, name: string) =>
    api(`/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  deleteGroup: (id: string) => api(`/groups/${id}`, { method: "DELETE" }),

  listGroupFolders: (groupId: string) => api<Folder[]>(`/folders/groups/${groupId}`),

  listGroupResources: (groupId: string, folderId?: string | null) =>
    api<ResourceListItem[]>(
      `/resources?groupId=${encodeURIComponent(groupId)}${
        folderId !== undefined ? `&folderId=${encodeURIComponent(folderId ?? "")}` : ""
      }`
    ),

  getGroupRecipients: (groupId: string) =>
    api<{ userId: string; email: string; firstName: string; lastName: string; publicKey: string | null; isGroupMember: boolean }[]>(
      `/groups/${groupId}/recipients`
    ),

  syncGroupSecrets: (groupId: string, userId: string, resourceShares: Record<string, string>) =>
    api<{ synced: number }>(`/groups/${groupId}/sync/${userId}`, {
      method: "POST",
      body: JSON.stringify({ resourceShares }),
    }),

  syncGroupMembers: (groupId: string) =>
    api<{ added: number; members: { userId: string; email: string; firstName: string; lastName: string; role: string; publicKey: string | null }[] }>(`/groups/${groupId}/sync-members`, {
      method: "POST",
    }),

  // ── Passphrase ─────────────────────────────────────────────────────

  updatePassphrase: (encryptedPrivateKey: Record<string, unknown>) =>
    api("/users/me/passphrase", {
      method: "PUT",
      body: JSON.stringify({ encryptedPrivateKey }),
    }),

  // ── Sessions ────────────────────────────────────────────────────────

  listSessions: () =>
    api<SessionInfo[]>("/users/me/sessions"),

  revokeSession: (sessionId: string) =>
    api(`/users/me/sessions/${sessionId}`, { method: "DELETE" }),

  // ── Favorites ───────────────────────────────────────────────────────

  toggleFavorite: (resourceId: string) =>
    api<{ isFavorite: boolean }>(`/resources/${resourceId}/favorite`, {
      method: "POST",
    }),

  listFavorites: () => api<ResourceListItem[]>("/resources/favorites"),

  // ── Import ──────────────────────────────────────────────────────────

  importCsv: (file: File, encryptedEntries: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("encryptedEntries", encryptedEntries);
    return api<ImportResult>("/import/csv", {
      method: "POST",
      body: formData,
      skipJson: true,
    });
  },

  importBitwarden: (file: File, encryptedEntries: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("encryptedEntries", encryptedEntries);
    return api<ImportResult>("/import/bitwarden", {
      method: "POST",
      body: formData,
      skipJson: true,
    });
  },

  // ── Export ──────────────────────────────────────────────────────────

  exportResources: (params?: { scope?: "all" | "workplace" | "groups"; groupIds?: string[] }) => {
    const qs = new URLSearchParams();
    if (params?.scope) qs.set("scope", params.scope);
    if (params?.groupIds?.length) qs.set("groupIds", params.groupIds.join(","));
    const query = qs.toString();
    return api<ExportItem[]>(`/resources/export${query ? `?${query}` : ""}`);
  },
};

// ── Shared types ───────────────────────────────────────────────────────

export interface ResourceListItem {
  id: string;
  name: string;
  uri: string | null;
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string | null }[];
  metadata?: Record<string, unknown>;
  resourceType?: string;
  sharingMode?: "AUTO" | "RESTRICTED";
  isFavorite?: boolean;
  myPermission?: "READ" | "UPDATE" | "OWNER" | null;
  createdBy?: { email: string; name: string } | null;
  modifiedBy?: { email: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  source?: "workplace" | "group";
  groupId?: string | null;
  groupName?: string | null;
  folderPath?: string | null;
}

export interface ResourceDetail extends ResourceListItem {
  metadata: Record<string, unknown>;
}

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  groupId: string | null;
  sortOrder: number;
  myPermission?: "READ" | "UPDATE" | "OWNER" | null;
  descendantCount?: number;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface PermissionEntry {
  id: string;
  aroType: string;
  aroId: string;
  level: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
}

export interface ResourceActivityItem {
  id: string;
  action: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatarBase64: string | null;
  } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ShareRecipient {
  userId: string;
  permission: "READ" | "UPDATE" | "OWNER";
  encryptedData: string;
}

export interface GroupShareRecipient {
  groupId: string;
  permission: "READ" | "UPDATE";
  memberSecrets: Record<string, string>;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  orgRole: string;
  status: string;
  createdAt: string;
}

export interface MemberEntry {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  userStatus: string;
  fingerprint: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  user: { email: string; firstName: string; lastName: string } | null;
}

export interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface GroupMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "ADMIN" | "USER";
}

export interface GroupDetail {
  id: string;
  name: string;
  createdAt: string;
  myRole: "OWNER" | "ADMIN" | "USER" | null;
  members: { userId: string; email: string; firstName: string; lastName: string; role: "OWNER" | "ADMIN" | "USER" }[];
}

export interface SessionInfo {
  id: string;
  deviceInfo: string | null;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

export interface ExportItem {
  id: string;
  name: string;
  uri: string | null;
  resourceType: string;
  encryptedData: string | null;
  groupId: string | null;
  folderId: string | null;
  metadata: Record<string, unknown>;
}

export interface SmtpSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom?: string;
  appUrl: string;
}

export interface EmailLogEntry {
  id: string;
  recipient: string;
  subject: string;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}
