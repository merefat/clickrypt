export interface ResourceSecret {
  userId?: string;
  email?: string;
  encryptedData: string;
}

/**
 * Pick the best secret for the current user.
 * 1. Prefer the secret explicitly mapped to this user ID or email.
 * 2. For Owner/Admin/External recipients, allow decryptable envelopes.
 * 3. Return null if nothing usable is found.
 */
export function resolveBestSecret(
  item: { secrets?: ResourceSecret[] } | null | undefined,
  userId: string | undefined,
  userRole: string | undefined,
  userEmail?: string
): ResourceSecret | null {
  const secrets = (item?.secrets || []) as ResourceSecret[];
  const cleanEmail = (userEmail || '').toLowerCase().trim();

  // 1. Direct match by User ID
  if (userId) {
    const userSecret = secrets.find((s) => s.userId === userId);
    if (userSecret?.encryptedData) {
      return { userId: userSecret.userId || userId, encryptedData: userSecret.encryptedData };
    }
  }

  // 2. Direct match by Email
  if (cleanEmail) {
    const emailSecret = secrets.find((s) => s.email?.toLowerCase() === cleanEmail);
    if (emailSecret?.encryptedData) {
      return { userId: emailSecret.userId || userId || 'external', encryptedData: emailSecret.encryptedData };
    }
  }

  // 3. Owner, Admin, or External Role fallback to envelope
  if (userRole === 'Owner' || userRole === 'Admin' || userRole === 'External') {
    const fallback = secrets.find((s) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'));
    if (fallback?.encryptedData) {
      return { userId: fallback.userId || userId || 'external', encryptedData: fallback.encryptedData };
    }
  }

  return null;
}
