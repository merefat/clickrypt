import { supabase } from './supabase';

export interface DbSubscription {
  plan: 'Organization' | 'Self-hosted';
  status: 'Active' | 'Warning' | 'Expired';
  seats: number;
  renewalDate: string;
  daysRemaining: number;
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
  category: string;
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
}

export interface DbFolder {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  lastModified: string;
  isPrivateOnly?: boolean;
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
  lastActive: string;
}

export interface DbAuditLog {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  resourceId?: string;
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

class BackendDatabase {
  public isSupabaseConnected = true;

  public subscription: DbSubscription = {
    plan: 'Organization',
    status: 'Active',
    seats: 25,
    renewalDate: 'May 18, 2026',
    daysRemaining: 365,
  };

  public invitations: DbInvitation[] = [];

  public users: DbUser[] = [
    {
      id: 'u-1',
      email: 'alex.morgan@acme.com',
      name: 'Alex Morgan',
      role: 'Owner',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeAlexMorganPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeAlexMorganPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 24, 2025 10:32 AM',
    },
    {
      id: 'u-refat',
      email: 'refat61899200@gmail.com',
      name: 'Refat Ahmed',
      role: 'Owner',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2RefatAhmedPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2RefatAhmedPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'Just now',
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

  public folders: DbFolder[] = [];
  public resources: DbResource[] = [];
  public groups: DbGroup[] = [];
  public auditLogs: DbAuditLog[] = [];

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

const globalForDb = globalThis as unknown as { backendDb: BackendDatabase };
export const db = globalForDb.backendDb || new BackendDatabase();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.backendDb = db;
}
