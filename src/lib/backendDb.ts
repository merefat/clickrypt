/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadDbSync, schedulePersist, persistDb } from './dbPersistence';

export interface DbSubscription {
  plan: 'Organization' | 'Self-hosted';
  status: 'Active' | 'Warning' | 'Expired';
  seats: number;
  renewalDate: string;
  daysRemaining: number;
}

export interface ModeProfile {
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface DbUser {
  id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Admin' | 'User' | 'External';
  status: 'Active' | 'Suspended' | 'Invited';
  publicKey: string;
  encryptedPrivateKey: string;
  lastActive: string;
  avatarUrl?: string;
  personalProfile?: ModeProfile;
  organizationProfile?: ModeProfile;
  accountMode?: 'personal' | 'organization';
  passkeys?: DbPasskey[];
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  organizationId?: string;
}

export interface DbResourceSecret {
  userId: string;
  encryptedData: string;
}

export interface DbResource {
  id: string;
  name: string;
  username: string;
  url: string;
  ownerId: string;
  folderId?: string | null;
  isPrivateOnly?: boolean;
  isExternalShared?: boolean;
  externalShareEmail?: string;
  score?: number;
  strength?: 'Strong' | 'Better' | 'Weak';
  lastModified: string;
  isOld?: boolean;
  secrets: DbResourceSecret[];
  tags?: string[];
  sharedWith?: string[];
  mode?: 'personal' | 'organization';
  sortOrder?: number;
}

export interface DbFolder {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  lastModified: string;
  isPrivateOnly?: boolean;
  mode?: 'personal' | 'organization';
  creatorId?: string;
  sortOrder?: number;
}

export interface DbGroupMember {
  userId: string;
  role: 'Owner' | 'Admin' | 'User';
}

export interface DbGroup {
  id: string;
  name: string;
  description: string;
  members: DbGroupMember[];
  assignedFolderIds?: string[];
  assignedResourceIds?: string[];
  lastActive: string;
  sortOrder?: number;
}

export interface DbAuditLog {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  resourceId?: string;
  groupId?: string;
  details?: string;
}

export interface DbInvitation {
  id: string;
  token: string;
  email: string;
  role: 'Admin' | 'User';
  invitedBy: string;
  createdAt: string;
  status: 'Pending' | 'Accepted';
}

export interface DbOrganization {
  id: string;
  domain: string;
  ownerId: string;
  createdAt: string;
  verificationStatus: 'pending' | 'verified';
  verificationCode?: string | null;
  verificationCodeExpiresAt?: string | null;
  verifiedAt?: string | null;
  openEnrollment: boolean;
  transferCode?: string | null;
  transferCodeExpiresAt?: string | null;
  transferTargetId?: string | null;
}

export interface DbPasskey {
  id: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  name: string;
  mode: 'personal' | 'organization';
  transports?: string[];
  createdAt: string;
  lastUsed: string;
  // vault-unlock material (prf / hmac-secret based)
  prfInput?: string;
  prfSalt?: string;
  iv?: string;
  encryptedPgpKey?: string;
}

export interface DbPasskeyChallenge {
  id: string;
  userId: string;
  purpose: 'registration' | 'authentication';
  mode: 'personal' | 'organization';
  challenge: string;
  expiresAt: string;
}

const globalForDbData = globalThis as unknown as {
  dbUsersStore?: DbUser[];
  dbFoldersStore?: DbFolder[];
  dbResourcesStore?: DbResource[];
  dbOrganizationResourcesStore?: DbResource[];
  dbOrganizationFoldersStore?: DbFolder[];
  dbOrganizationAuditLogsStore?: DbAuditLog[];
  dbGroupsStore?: DbGroup[];
  dbAuditLogsStore?: DbAuditLog[];
  dbPasskeyChallengesStore?: DbPasskeyChallenge[];
  dbOrganizationsStore?: DbOrganization[];
};

if (!globalForDbData.dbUsersStore) {
  globalForDbData.dbUsersStore = [
    {
      id: 'u-1',
      email: 'refat61899200@gmail.com',
      name: 'Refat',
      role: 'Owner',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2RefatAhmedPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2RefatAhmedPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'Just now',
    },
    {
      id: 'u-2',
      email: 'alex.morgan@acme.com',
      name: 'Alex Morgan',
      role: 'Owner',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeAlexMorganPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeAlexMorganPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 24, 2025 10:32 AM',
    },
    {
      id: 'u-5',
      email: '20103227@iubat.edu',
      name: 'Arif Ahmed',
      role: 'Admin',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...ArifPublic...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...ArifPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'Just now',
    },
  ];
}
if (!globalForDbData.dbFoldersStore) globalForDbData.dbFoldersStore = [];
if (!globalForDbData.dbResourcesStore) globalForDbData.dbResourcesStore = [];
if (!globalForDbData.dbOrganizationResourcesStore) globalForDbData.dbOrganizationResourcesStore = [];
if (!globalForDbData.dbOrganizationFoldersStore) globalForDbData.dbOrganizationFoldersStore = [];
if (!globalForDbData.dbOrganizationAuditLogsStore) globalForDbData.dbOrganizationAuditLogsStore = [];
if (!globalForDbData.dbGroupsStore) globalForDbData.dbGroupsStore = [];
if (!globalForDbData.dbAuditLogsStore) globalForDbData.dbAuditLogsStore = [];
if (!globalForDbData.dbPasskeyChallengesStore) globalForDbData.dbPasskeyChallengesStore = [];
if (!globalForDbData.dbOrganizationsStore) globalForDbData.dbOrganizationsStore = [];

class BackendDatabase {
  public isSupabaseConnected = true;

  public subscription: DbSubscription = {
    plan: 'Organization',
    status: 'Active',
    seats: 25,
    renewalDate: 'May 18, 2026',
    daysRemaining: 365,
  };

  public organizations: DbOrganization[] = [];

  public invitations: DbInvitation[] = [];

  get users(): DbUser[] {
    return globalForDbData.dbUsersStore!;
  }
  set users(val: DbUser[]) {
    globalForDbData.dbUsersStore = val;
  }

  get resources(): DbResource[] {
    return globalForDbData.dbResourcesStore!;
  }
  set resources(val: DbResource[]) {
    globalForDbData.dbResourcesStore = val;
  }

  get organizationResources(): DbResource[] {
    return globalForDbData.dbOrganizationResourcesStore!;
  }
  set organizationResources(val: DbResource[]) {
    globalForDbData.dbOrganizationResourcesStore = val;
  }

  resourcesFor(mode: 'personal' | 'organization'): DbResource[] {
    return mode === 'organization' ? this.organizationResources : this.resources;
  }

  get folders(): DbFolder[] {
    return globalForDbData.dbFoldersStore!;
  }
  set folders(val: DbFolder[]) {
    globalForDbData.dbFoldersStore = val;
  }

  get organizationFolders(): DbFolder[] {
    return globalForDbData.dbOrganizationFoldersStore!;
  }
  set organizationFolders(val: DbFolder[]) {
    globalForDbData.dbOrganizationFoldersStore = val;
  }

  foldersFor(mode: 'personal' | 'organization'): DbFolder[] {
    return mode === 'organization' ? this.organizationFolders : this.folders;
  }

  get groups(): DbGroup[] {
    return globalForDbData.dbGroupsStore!;
  }
  set groups(val: DbGroup[]) {
    globalForDbData.dbGroupsStore = val;
  }

  get auditLogs(): DbAuditLog[] {
    return globalForDbData.dbAuditLogsStore!;
  }
  set auditLogs(val: DbAuditLog[]) {
    globalForDbData.dbAuditLogsStore = val;
  }

  get organizationAuditLogs(): DbAuditLog[] {
    return globalForDbData.dbOrganizationAuditLogsStore!;
  }
  set organizationAuditLogs(val: DbAuditLog[]) {
    globalForDbData.dbOrganizationAuditLogsStore = val;
  }

  auditLogsFor(mode: 'personal' | 'organization'): DbAuditLog[] {
    return mode === 'organization' ? this.organizationAuditLogs : this.auditLogs;
  }

  // Account Recovery & SSO Tables
  public accountRecoveryPolicies: DbAccountRecoveryOrgPolicy[] = [
    {
      id: 'arp-1',
      policy: 'opt-in',
      publicKeyId: null,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    }
  ];
  public accountRecoveryOrgPublicKeys: DbAccountRecoveryOrgPublicKey[] = [];
  public accountRecoveryUserSettings: DbAccountRecoveryUserSetting[] = [];
  public accountRecoveryPrivateKeys: DbAccountRecoveryPrivateKey[] = [];
  public accountRecoveryPrivateKeyPasswords: DbAccountRecoveryPrivateKeyPassword[] = [];
  public accountRecoveryRequests: DbAccountRecoveryRequest[] = [];
  public accountRecoveryResponses: DbAccountRecoveryResponse[] = [];

  public ssoSettings: DbSsoSetting[] = [];
  public ssoKeys: DbSsoKey[] = [];
  public ssoStates: DbSsoState[] = [];
  public ssoTokens: DbSsoToken[] = [];
  public authChallenges: DbAuthChallenge[] = [];

  get passkeyChallenges(): DbPasskeyChallenge[] {
    return globalForDbData.dbPasskeyChallengesStore!;
  }
  set passkeyChallenges(val: DbPasskeyChallenge[]) {
    globalForDbData.dbPasskeyChallengesStore = val;
  }
}

export interface DbAuthChallenge {
  id: string;
  challengeToken: string;
  email: string;
  challengeUuid: string;
  userId?: string | null;
  active: boolean;
  isSynthetic: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface DbAccountRecoveryOrgPolicy {
  id: string;
  policy: 'disabled' | 'opt-in' | 'opt-out' | 'mandatory';
  publicKeyId?: string | null;
  createdAt: string;
  modifiedAt: string;
  deletedAt?: string | null;
}

export interface DbAccountRecoveryOrgPublicKey {
  id: string;
  armoredKey: string;
  fingerprint: string;
  createdAt: string;
}

export interface DbAccountRecoveryUserSetting {
  id: string;
  userId: string;
  status: 'approved' | 'rejected';
  createdAt: string;
}

export interface DbAccountRecoveryPrivateKey {
  id: string;
  userId: string;
  data: string;
  createdAt: string;
}

export interface DbAccountRecoveryPrivateKeyPassword {
  id: string;
  privateKeyId: string;
  recipientFingerprint: string;
  data: string;
  createdAt: string;
}

export interface DbAccountRecoveryRequest {
  id: string;
  userId: string;
  armoredKey?: string | null;
  fingerprint?: string | null;
  tokenId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  modifiedAt: string;
}

export interface DbAccountRecoveryResponse {
  id: string;
  accountRecoveryRequestId: string;
  responderForeignKey: string;
  data?: string | null;
  status: 'approved' | 'rejected';
  createdAt: string;
}

export interface DbSsoSetting {
  id: string;
  provider: 'google' | 'azure' | 'oauth2' | 'adfs' | 'pingone';
  data: string;
  status: 'draft' | 'active' | 'disabled';
  createdAt: string;
  modifiedAt: string;
}

export interface DbSsoKey {
  id: string;
  userId: string;
  data: string;
  createdAt: string;
}

export interface DbSsoState {
  id: string;
  nonce: string;
  type: 'sso_get_key' | 'sso_set_settings' | 'sso_recover';
  state: string;
  ssoSettingsId: string;
  userId?: string | null;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  expiresAt: string;
}

export interface DbSsoToken {
  id: string;
  token: string;
  userId: string;
  type: 'sso_get_key' | 'sso_dry_run';
  active: boolean;
  ssoSettingsId: string;
  createdAt: string;
  expiresAt: string;
}

function createPersistedArray(target: any[], dbRef: any) {
  return new Proxy(target, {
    set(t, prop, value) {
      const res = Reflect.set(t, prop, value);
      if (prop === 'length' || typeof prop === 'symbol' || !isNaN(Number(prop as any))) {
        schedulePersist(dbRef);
      }
      return res;
    },
    deleteProperty(t, prop) {
      const res = Reflect.deleteProperty(t, prop);
      schedulePersist(dbRef);
      return res;
    },
  });
}

function createPersistedObject(target: any, dbRef: any) {
  return new Proxy(target, {
    set(t, prop, value) {
      const res = Reflect.set(t, prop, value);
      if (prop !== 'constructor') {
        schedulePersist(dbRef);
      }
      return res;
    },
    deleteProperty(t, prop) {
      const res = Reflect.deleteProperty(t, prop);
      schedulePersist(dbRef);
      return res;
    },
  });
}

const globalForDb = globalThis as unknown as { backendDb: BackendDatabase };
export const db = globalForDb.backendDb || new BackendDatabase();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.backendDb = db;
}

// Hydrate from db.json / Supabase first, then wrap in persistence proxies
loadDbSync(db);

const persistableKeys = [
  'users',
  'folders',
  'resources',
  'organizationResources',
  'organizationFolders',
  'organizationAuditLogs',
  'groups',
  'auditLogs',
  'invitations',
  'organizations',
  'ssoSettings',
  'ssoKeys',
  'ssoStates',
  'ssoTokens',
  'authChallenges',
  'accountRecoveryPolicies',
  'accountRecoveryOrgPublicKeys',
  'accountRecoveryUserSettings',
  'accountRecoveryPrivateKeys',
  'accountRecoveryPrivateKeyPasswords',
  'accountRecoveryRequests',
  'accountRecoveryResponses',
];

for (const key of persistableKeys) {
  if (Array.isArray((db as any)[key])) {
    (db as any)[key] = createPersistedArray((db as any)[key], db);
  }
}

(db as any).subscription = createPersistedObject(db.subscription, db);

// Initial snapshot so the file exists and contains default seed data
persistDb(db);
