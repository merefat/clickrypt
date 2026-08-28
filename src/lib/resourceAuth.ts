import { DbResource, DbGroup } from './backendDb';

export interface AuthContextUser {
  id: string;
  email: string;
  role?: string;
  accountMode?: string;
  organizationId?: string;
}

/**
 * Compute the set of folder IDs accessible to a user through their group memberships.
 */
export function getUserGroupFolderIds(userId: string, groups: DbGroup[]): Set<string> {
  const folderIds = new Set<string>();
  for (const g of groups) {
    if (g.members?.some((m) => m.userId === userId)) {
      (g.assignedFolderIds || []).forEach((fid) => folderIds.add(fid));
    }
  }
  return folderIds;
}

/**
 * Centralized authorization check for reading a resource.
 * A user can ONLY read a resource if:
 * 1. The user owns the resource (creator).
 * 2. The resource is explicitly shared with the user by ID or email.
 * 3. The resource is in a workplace folder assigned to a group the user belongs to.
 * 4. The resource is externally shared with the user's verified email.
 *
 * NOTE: Being an Owner or Admin does NOT grant access to unshared private items of other members.
 */
export function canUserAccessResource(
  resource: DbResource,
  user: { id: string; email?: string; role?: string },
  groupFolderIds?: Set<string>
): boolean {
  if (!resource || !user?.id) return false;

  const currentUserId = user.id;
  const currentUserEmail = (user.email || '').toLowerCase().trim();

  // 1. Resource Owner / Creator
  if (resource.ownerId === currentUserId) {
    return true;
  }

  // Private-only items (Secret Vault) are strictly accessible only by the creator
  if (resource.isPrivateOnly) {
    return false;
  }

  // 2. Explicitly shared with the user
  if (resource.sharedWith && Array.isArray(resource.sharedWith)) {
    if (resource.sharedWith.includes(currentUserId)) return true;
    if (currentUserEmail && resource.sharedWith.some((e) => e.toLowerCase() === currentUserEmail)) {
      return true;
    }
  }

  // 3. Accessible via a group folder
  if (resource.folderId && groupFolderIds && groupFolderIds.has(resource.folderId)) {
    return true;
  }

  // 4. External share recipient
  if (resource.isExternalShared && resource.externalShareEmail) {
    if (currentUserEmail && resource.externalShareEmail.toLowerCase() === currentUserEmail) {
      return true;
    }
  }

  return false;
}

/**
 * Centralized authorization check for modifying (editing/deleting) a resource.
 * Only the resource owner/creator can modify or delete a resource.
 */
export function canUserModifyResource(
  resource: DbResource,
  user: { id: string; role?: string }
): boolean {
  if (!resource || !user?.id) return false;
  return resource.ownerId === user.id;
}

/**
 * Checks if a resource has been explicitly shared with other recipients.
 */
export function isResourceSharedOut(resource: DbResource): boolean {
  if (!resource) return false;
  if (resource.isExternalShared) return true;
  if (resource.sharedWith && resource.sharedWith.length > 0) return true;
  return false;
}

/**
 * Sanitizes a resource before sending it in an API response.
 * Strips out ciphertext blobs meant for other users so the client only receives
 * the secret encrypted for them, plus safe metadata.
 */
export function sanitizeResourceForUser(
  resource: DbResource,
  user: { id: string; email?: string }
): DbResource {
  const currentUserId = user.id;
  const currentUserEmail = (user.email || '').toLowerCase().trim();

  const filteredSecrets = (resource.secrets || []).filter((s: any) => {
    if (s.userId === currentUserId) return true;
    if (s.email && s.email.toLowerCase() === currentUserEmail) return true;
    if (
      resource.isExternalShared &&
      resource.externalShareEmail?.toLowerCase() === currentUserEmail &&
      (s.userId === currentUserId || s.email?.toLowerCase() === currentUserEmail || s.userId?.startsWith('ext-') || s.userId === 'external' || s.isExternal)
    ) {
      return true;
    }
    return false;
  });

  return {
    ...resource,
    secrets: filteredSecrets,
  };
}
