import { openDB } from 'idb';

const DB_NAME = 'clickrypt-vault-db';
const STORE_NAME = 'user_keys';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Save encrypted private key to browser's IndexedDB
 */
export async function savePrivateKey(encryptedPrivateKey: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await getDB();
  await db.put(STORE_NAME, encryptedPrivateKey, 'encrypted_private_key');
}

/**
 * Retrieve encrypted private key from IndexedDB
 */
export async function getPrivateKey(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getDB();
    const key = await db.get(STORE_NAME, 'encrypted_private_key');
    return key || null;
  } catch (error) {
    console.error('Error fetching private key from IndexedDB:', error);
    return null;
  }
}

/**
 * Clear stored keys on logout
 */
export async function clearKeys(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (error) {
    console.error('Error clearing keys from IndexedDB:', error);
  }
}
