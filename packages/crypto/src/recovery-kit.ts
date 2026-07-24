import type { EncryptedBlob } from "./wrap.js";

/**
 * The Recovery Kit is a downloadable JSON file containing the user's
 * passphrase-encrypted private key. It is useless without the passphrase.
 * Losing both the passphrase and this kit makes the account unrecoverable
 * by design (zero-knowledge).
 */
export interface RecoveryKit {
  format: "clickrypt-recovery-kit";
  version: 1;
  createdAt: string; // ISO 8601
  email: string;
  fingerprint: string;
  encryptedPrivateKey: EncryptedBlob;
}

export function createRecoveryKit(input: {
  email: string;
  fingerprint: string;
  encryptedPrivateKey: EncryptedBlob;
}): string {
  const kit: RecoveryKit = {
    format: "clickrypt-recovery-kit",
    version: 1,
    createdAt: new Date().toISOString(),
    email: input.email,
    fingerprint: input.fingerprint,
    encryptedPrivateKey: input.encryptedPrivateKey,
  };
  return JSON.stringify(kit, null, 2);
}

export function parseRecoveryKit(json: string): RecoveryKit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid recovery kit: not valid JSON.");
  }
  const kit = parsed as Partial<RecoveryKit>;
  if (kit.format !== "clickrypt-recovery-kit") {
    throw new Error("Invalid recovery kit: unrecognized format.");
  }
  if (kit.version !== 1) {
    throw new Error(`Unsupported recovery kit version: ${kit.version}`);
  }
  if (
    typeof kit.email !== "string" ||
    typeof kit.fingerprint !== "string" ||
    typeof kit.encryptedPrivateKey !== "object" ||
    kit.encryptedPrivateKey === null
  ) {
    throw new Error("Invalid recovery kit: missing required fields.");
  }
  return kit as RecoveryKit;
}
