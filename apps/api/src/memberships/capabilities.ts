export enum OrganizationCapability {
  INVITE_USER = "INVITE_USER",
  INVITE_ADMIN = "INVITE_ADMIN",
  SUSPEND_MEMBER = "SUSPEND_MEMBER",
  CHANGE_ROLE = "CHANGE_ROLE",
  VIEW_AUDIT = "VIEW_AUDIT",
  TRANSFER_OWNERSHIP = "TRANSFER_OWNERSHIP",
  MANAGE_INSTALLATION = "MANAGE_INSTALLATION",
}

import { OrgRole } from "@prisma/client";

export const ROLE_RANK: Record<OrgRole, number> = {
  USER: 10,
  ADMIN: 20,
  OWNER: 30,
};

export const ROLE_CAPABILITIES: Record<OrgRole, OrganizationCapability[]> = {
  USER: [],
  ADMIN: [
    OrganizationCapability.INVITE_USER,
    OrganizationCapability.SUSPEND_MEMBER,
    OrganizationCapability.VIEW_AUDIT,
  ],
  OWNER: [
    OrganizationCapability.INVITE_USER,
    OrganizationCapability.INVITE_ADMIN,
    OrganizationCapability.SUSPEND_MEMBER,
    OrganizationCapability.CHANGE_ROLE,
    OrganizationCapability.VIEW_AUDIT,
    OrganizationCapability.TRANSFER_OWNERSHIP,
    OrganizationCapability.MANAGE_INSTALLATION,
  ],
};

export function hasCapability(role: OrgRole, capability: OrganizationCapability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function hasAtLeastRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}
