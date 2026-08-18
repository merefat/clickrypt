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
      id: 'u-2',
      email: 'sarah.johnson@acme.com',
      name: 'Sarah Johnson',
      role: 'Admin',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeSarahJohnsonPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeSarahPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 23, 2025 04:15 PM',
    },
    {
      id: 'u-3',
      email: 'mark.wilson@acme.com',
      name: 'Mark Wilson',
      role: 'User',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeMarkWilsonPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeMarkPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 22, 2025 09:11 AM',
    },
    {
      id: 'u-4',
      email: 'emily.rodriguez@acme.com',
      name: 'Emily Rodriguez',
      role: 'User',
      status: 'Suspended',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeEmilyPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeEmilyPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 10, 2025',
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
    {
      id: 'u-ext-1',
      email: 'external.partner@vendor.com',
      name: 'External Partner',
      role: 'External',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2AcmeExternalPublicKeyBase64PayloadData2026==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2AcmeExternalPrivateKeyBase64PayloadData2026==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'Just now',
    },
  ];

  public folders: DbFolder[] = [
    { id: 'f-1', name: 'Infrastructure', description: 'Servers, cloud providers, and deployment secrets', itemCount: 12, lastModified: '1h ago', isPrivateOnly: false },
    { id: 'f-2', name: 'Credentials', description: 'API keys, tokens, and service accounts', itemCount: 8, lastModified: '3h ago', isPrivateOnly: false },
    { id: 'f-3', name: 'Shared Notes', description: 'Team notes and reference documentation', itemCount: 5, lastModified: '1d ago', isPrivateOnly: false },
    { id: 'f-secret-1', name: 'Private Financial Secrets', description: 'Owner private bank and crypto credentials', itemCount: 2, lastModified: 'Just now', isPrivateOnly: true },
  ];

  public resources: DbResource[] = [
    {
      id: 'r-1',
      name: 'GitHub',
      username: 'alex.mercer',
      url: 'github.com',
      category: 'Developer',
      ownerId: 'u-1',
      strength: 'Strong',
      lastModified: 'May 24, 2025 10:32 AM',
      tags: ['DevOps', 'Git'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::R2l0SHViR3B0S2V5MTIzIQ==]' }
      ]
    },
    {
      id: 'r-2',
      name: 'AWS Console',
      username: 'alex@acme.com',
      url: 'console.aws.amazon.com',
      category: 'Cloud',
      ownerId: 'u-1',
      strength: 'Strong',
      lastModified: 'May 23, 2025 04:15 PM',
      tags: ['Cloud', 'AWS'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::QVdTQ29uc29sZVBhc3N3b3JkOTk5IQ==]' }
      ]
    },
    {
      id: 'r-3',
      name: 'Google Workspace',
      username: 'alex.mercer@acme.com',
      url: 'accounts.google.com',
      category: 'Productivity',
      ownerId: 'u-1',
      strength: 'Strong',
      isExternalShared: true,
      externalShareEmail: 'external.partner@vendor.com',
      lastModified: 'May 22, 2025 09:07 AM',
      tags: ['Workspace'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::R29vZ2xlV29ya3NwYWNlUGFzczQ1NiE=]' }
      ]
    },
    {
      id: 'sv-1',
      name: 'Amazon Account',
      username: 'amazon.com',
      url: 'amazon.com',
      category: 'Password',
      ownerId: 'u-1',
      folderId: 'f-secret-1',
      isPrivateOnly: true,
      score: 92,
      strength: 'Strong',
      lastModified: 'May 24, 2025 10:14 AM',
      secrets: [{ userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::QW1hem9uU2VjcmV0UGFzczEyMyE=]' }]
    },
    {
      id: 'r-admin-1',
      name: 'Stripe Admin Portal',
      username: 'sarah.johnson@acme.com',
      url: 'dashboard.stripe.com',
      category: 'Finance',
      ownerId: 'u-2',
      strength: 'Strong',
      lastModified: 'May 24, 2025 11:00 AM',
      tags: ['Admin', 'Finance'],
      secrets: [
        { userId: 'u-2', encryptedData: '[PGP-ENCRYPTED-BLOB::U3RyaXBlQWRtaW5QYXNzNzg5IQ==]' }
      ]
    },
    {
      id: 'r-arif-1',
      name: 'Arif Admin Portal',
      username: '20103227@iubat.edu',
      url: 'admin.iubat.edu',
      category: 'Database',
      ownerId: 'u-5',
      strength: 'Strong',
      lastModified: 'Just now',
      tags: ['Admin', 'IUBAT'],
      secrets: [
        { userId: 'u-5', encryptedData: '[PGP-ENCRYPTED-BLOB::QXJpZkFkbWluUGFzczEyMyE=]' }
      ]
    },
    {
      id: 'r-user-1',
      name: 'Personal Figma Account',
      username: 'mark.wilson@acme.com',
      url: 'figma.com',
      category: 'Design',
      ownerId: 'u-3',
      strength: 'Strong',
      lastModified: 'May 24, 2025 11:30 AM',
      tags: ['User', 'Design'],
      secrets: [
        { userId: 'u-3', encryptedData: '[PGP-ENCRYPTED-BLOB::RmlnbWFVc2VyUGFzczQ1NiE=]' }
      ]
    },
    {
      id: 'r-old-1',
      name: 'Legacy Server FTP Login',
      username: 'admin.legacy',
      url: 'ftp.legacy-server.internal',
      category: 'Infrastructure',
      ownerId: 'u-1',
      strength: 'Weak',
      lastModified: 'Jan 10, 2024',
      isOld: true,
      tags: ['Legacy', 'FTP'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::TGVnYWN5RlRQUGFzczEyMyE=]' }
      ]
    },
    {
      id: 'r-shared-outbound-1',
      name: 'Marketing Social Media Manager',
      username: 'social@acme.com',
      url: 'buffer.com',
      category: 'Marketing',
      ownerId: 'u-1',
      strength: 'Strong',
      lastModified: 'May 20, 2025 02:15 PM',
      sharedWith: ['u-3'],
      tags: ['Marketing', 'Shared'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::U29jaWFsTWVkaWFQYXNzNzg5IQ==]' },
        { userId: 'u-3', encryptedData: '[PGP-ENCRYPTED-BLOB::U29jaWFsTWVkaWFQYXNzNzg5IQ==]' }
      ]
    },
    {
      id: 'r-external-test-1',
      name: 'Vendor Integration Gateway',
      username: 'api_partner_v1',
      url: 'vendor.api.acme.com',
      category: 'API Gateway',
      ownerId: 'u-1',
      strength: 'Strong',
      isExternalShared: true,
      externalShareEmail: 'external.partner@vendor.com',
      lastModified: 'May 21, 2025 09:45 AM',
      tags: ['External', 'API'],
      secrets: [
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::VmVuZG9yQVBJS2V5OTk5IQ==]' },
        { userId: 'u-ext-1', encryptedData: '[PGP-ENCRYPTED-BLOB::VmVuZG9yQVBJS2V5OTk5IQ==]' }
      ]
    }
  ];

  public groups: DbGroup[] = [
    {
      id: 'g-1',
      name: 'Engineering Team',
      description: 'Core engineering and platform development',
      members: [
        { userId: 'u-1', role: 'Owner' },
        { userId: 'u-2', role: 'Admin' },
        { userId: 'u-3', role: 'User' },
      ],
      lastActive: 'May 12, 2024',
    },
    {
      id: 'g-2',
      name: 'Product Team',
      description: 'Product management and design',
      members: [
        { userId: 'u-1', role: 'Owner' },
        { userId: 'u-3', role: 'User' },
      ],
      lastActive: 'May 8, 2024',
    }
  ];

  public auditLogs: DbAuditLog[] = [
    { id: 'al-1', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), action: 'VIEW_SECRET', userId: 'u-1', resourceId: 'r-1', details: 'User Alex Morgan revealed GitHub secret' },
    { id: 'al-2', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), action: 'SHARE_RESOURCE', userId: 'u-1', resourceId: 'r-1', details: 'Shared GitHub resource with Sarah Johnson' },
    { id: 'al-3', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), action: 'CREATE_RESOURCE', userId: 'u-1', resourceId: 'r-2', details: 'Created new password resource AWS Console' },
    { id: 'al-4', timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(), action: 'SUPABASE_SYNC', userId: 'u-1', details: 'Supabase PostgreSQL Cloud database connected' },
  ];

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
