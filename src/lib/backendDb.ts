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
  role: 'Owner' | 'Admin' | 'User';
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
  score?: number;
  strength?: 'Strong' | 'Better' | 'Weak';
  lastModified: string;
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
    status: 'Active', // Default to Active ($0 cost / 365 days) allowing instant sign-in
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
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...AlexMorganPublic...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...AlexMorganEncryptedPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 24, 2025 10:32 AM',
    },
    {
      id: 'u-2',
      email: 'sarah.johnson@acme.com',
      name: 'Sarah Johnson',
      role: 'Admin',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...SarahJohnsonPublic...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...SarahPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 23, 2025 04:15 PM',
    },
    {
      id: 'u-3',
      email: 'mark.wilson@acme.com',
      name: 'Mark Wilson',
      role: 'User',
      status: 'Active',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...MarkWilsonPublic...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...MarkPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 22, 2025 09:11 AM',
    },
    {
      id: 'u-4',
      email: 'emily.rodriguez@acme.com',
      name: 'Emily Rodriguez',
      role: 'User',
      status: 'Suspended',
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...EmilyPublic...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...EmilyPrivateKey...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'May 10, 2025',
    },
  ];

  public folders: DbFolder[] = [
    { id: 'f-1', name: 'Infrastructure', description: 'Servers, cloud providers, and deployment secrets', itemCount: 12, lastModified: '1h ago' },
    { id: 'f-2', name: 'Credentials', description: 'API keys, tokens, and service accounts', itemCount: 8, lastModified: '3h ago' },
    { id: 'f-3', name: 'Shared Notes', description: 'Team notes and reference documentation', itemCount: 5, lastModified: '1d ago' },
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
        { userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::R2l0SHViR3B0S2V5MTIzIQ==]' },
        { userId: 'u-2', encryptedData: '[PGP-ENCRYPTED-BLOB::R2l0SHViR3B0S2V5MTIzIQ==]' }
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
      isPrivateOnly: true,
      score: 92,
      strength: 'Strong',
      lastModified: 'May 24, 2025 10:14 AM',
      secrets: [{ userId: 'u-1', encryptedData: '[PGP-ENCRYPTED-BLOB::QW1hem9uU2VjcmV0UGFzczEyMyE=]' }]
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
}

export const db = new BackendDatabase();
