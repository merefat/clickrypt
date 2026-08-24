export interface ResourceSecret {
  userId: string;
  encryptedData: string;
}

/**
 * Pick the best secret for the current user.
 * 1. Prefer the secret that was explicitly encrypted for this user.
 * 2. For Owner/Admin only, fall back to a non-key-locked base64 fallback
 *    (`[PGP-ENCRYPTED-BLOB::...`) if present, but never to another user's real PGP.
 * 3. Return null if nothing usable is found.
 */
export function resolveBestSecret(
  item: { secrets?: ResourceSecret[] } | null | undefined,
  userId: string | undefined,
  userRole: string | undefined
): ResourceSecret | null {
  const secrets = (item?.secrets || []) as ResourceSecret[];

  const userSecret = secrets.find((s) => s.userId === userId);
  if (userSecret?.encryptedData) {
    return { userId: userSecret.userId, encryptedData: userSecret.encryptedData };
  }

  if (userRole === 'Owner' || userRole === 'Admin') {
    const fallback = secrets.find((s) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'));
    if (fallback?.encryptedData) {
      return { userId: fallback.userId, encryptedData: fallback.encryptedData };
    }
  }

  return null;
}
