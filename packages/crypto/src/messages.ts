import * as openpgp from "openpgp";

async function readPublicKeys(armoredKeys: string[]): Promise<openpgp.Key[]> {
  return Promise.all(
    armoredKeys.map((armoredKey) => openpgp.readKey({ armoredKey }))
  );
}

async function readPrivateKey(armoredKey: string): Promise<openpgp.PrivateKey> {
  return openpgp.readPrivateKey({ armoredKey });
}

/**
 * Encrypts plaintext to one or more recipients (their armored public keys).
 * Optionally signs with the sender's private key.
 * Returns an armored OpenPGP message.
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeysArmored: string[],
  signingPrivateKeyArmored?: string
): Promise<string> {
  if (recipientPublicKeysArmored.length === 0) {
    throw new Error("At least one recipient public key is required.");
  }
  const encryptionKeys = await readPublicKeys(recipientPublicKeysArmored);
  const signingKeys = signingPrivateKeyArmored
    ? [await readPrivateKey(signingPrivateKeyArmored)]
    : undefined;
  return openpgp.encrypt({
    message: await openpgp.createMessage({ text: plaintext }),
    encryptionKeys,
    signingKeys,
  }) as Promise<string>;
}

export interface DecryptResult {
  plaintext: string;
  /** True if a signature was present and verified against the provided keys. */
  signatureValid: boolean | null;
}

/**
 * Decrypts an armored message with the recipient's private key.
 * If verificationPublicKeysArmored is provided, also verifies the signature.
 */
export async function decryptMessage(
  armoredMessage: string,
  privateKeyArmored: string,
  verificationPublicKeysArmored?: string[]
): Promise<DecryptResult> {
  const message = await openpgp.readMessage({ armoredMessage });
  const decryptionKeys = await readPrivateKey(privateKeyArmored);
  const verificationKeys = verificationPublicKeysArmored
    ? await readPublicKeys(verificationPublicKeysArmored)
    : undefined;

  const { data, signatures } = await openpgp.decrypt({
    message,
    decryptionKeys,
    verificationKeys,
  });

  let signatureValid: boolean | null = null;
  if (verificationKeys && signatures.length > 0) {
    try {
      await signatures[0].verified;
      signatureValid = true;
    } catch {
      signatureValid = false;
    }
  }
  return { plaintext: data as string, signatureValid };
}

/** Creates a detached armored signature over the given text. */
export async function signDetached(
  text: string,
  privateKeyArmored: string
): Promise<string> {
  const signingKeys = await readPrivateKey(privateKeyArmored);
  return openpgp.sign({
    message: await openpgp.createMessage({ text }),
    signingKeys,
    detached: true,
  }) as Promise<string>;
}

/** Verifies a detached armored signature. */
export async function verifyDetached(
  text: string,
  armoredSignature: string,
  publicKeyArmored: string
): Promise<boolean> {
  const verificationKeys = await openpgp.readKey({
    armoredKey: publicKeyArmored,
  });
  const result = await openpgp.verify({
    message: await openpgp.createMessage({ text }),
    signature: await openpgp.readSignature({ armoredSignature }),
    verificationKeys,
  });
  try {
    await result.signatures[0].verified;
    return true;
  } catch {
    return false;
  }
}
