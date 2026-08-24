/* eslint-disable @typescript-eslint/no-explicit-any */
import api from './api';
import { decryptBestSecret, encryptSecret } from './crypto';
import { resolveBestSecret } from './secretResolver';

export interface ProvisionOptions {
  folderId: string;
  targetUserIds: string[];
  users: any[];
  ownerId: string;
  privateKey: string;
  passphrase?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface ProvisionResult {
  provisioned: number;
  skipped: number;
  errors: number;
}

function isValidPublicKey(pubKey: string | undefined): boolean {
  return !!pubKey && pubKey.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----') && !pubKey.includes('...');
}

export async function provisionSecretsForFolder({
  folderId,
  targetUserIds,
  users,
  ownerId,
  privateKey,
  passphrase,
  onProgress,
}: ProvisionOptions): Promise<ProvisionResult> {
  const res = await api.get('/resources', { params: { folderId } });
  const resources: any[] = res.data || [];
  const myResources = resources.filter((r: any) => r.ownerId === ownerId);

  let provisioned = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < myResources.length; i++) {
    const r = myResources[i];
    try {
      const userSecret = resolveBestSecret(r, ownerId, 'Owner');
      if (!userSecret) {
        skipped++;
        continue;
      }
      const plainText = await decryptBestSecret(userSecret, r.secrets, 'Owner', privateKey, passphrase);

      const targetSecrets: any[] = [];
      for (const tId of targetUserIds) {
        const uObj = users.find((u) => u.id === tId);
        const pubKey = uObj?.publicKey;
        if (!isValidPublicKey(pubKey)) continue;
        const reEncrypted = await encryptSecret(plainText, pubKey);
        targetSecrets.push({ userId: tId, encryptedData: reEncrypted });
      }

      if (targetSecrets.length === 0) {
        skipped++;
        continue;
      }

      await api.post(`/resources/${r.id}/share`, {
        targetUserIds,
        secrets: targetSecrets,
        password: plainText,
      });
      provisioned++;
    } catch (err) {
      console.error(`Failed to provision resource ${r.id} in folder ${folderId}:`, err);
      errors++;
    } finally {
      if (onProgress) onProgress(i + 1, myResources.length);
    }
  }

  return { provisioned, skipped, errors };
}

export function membersNeedingSecrets(resource: any, memberIds: string[]): string[] {
  if (!resource?.secrets) return memberIds;
  return memberIds.filter((id) => !resource.secrets.some((s: any) => s.userId === id));
}
