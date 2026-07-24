import { describe, expect, it, beforeAll } from "vitest";
import {
  createRecoveryKit,
  decryptMessage,
  decryptWithPassphrase,
  deriveKey,
  encryptMessage,
  encryptWithPassphrase,
  generateKdfParams,
  generateKeyPair,
  parseRecoveryKit,
  readPublicKeyFingerprint,
  signDetached,
  verifyDetached,
  type GeneratedKeyPair,
} from "../src/index.js";

// Cheap KDF params for tests only — production uses DEFAULT_KDF_PARAMS.
const FAST_KDF = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

describe("kdf (Argon2id)", () => {
  it("is deterministic for same passphrase + params", async () => {
    const params = generateKdfParams(FAST_KDF);
    const a = await deriveKey("correct horse battery staple", params);
    const b = await deriveKey("correct horse battery staple", params);
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  it("differs for different passphrases and different salts", async () => {
    const params = generateKdfParams(FAST_KDF);
    const a = await deriveKey("passphrase-one", params);
    const b = await deriveKey("passphrase-two", params);
    expect(a).not.toEqual(b);

    const params2 = generateKdfParams(FAST_KDF);
    expect(params.salt).not.toBe(params2.salt);
    const c = await deriveKey("passphrase-one", params2);
    expect(a).not.toEqual(c);
  });
});

describe("passphrase wrap (AES-256-GCM)", () => {
  it("round-trips plaintext", async () => {
    const blob = await encryptWithPassphrase(
      "-----BEGIN PGP PRIVATE KEY BLOCK----- fake",
      "my secret passphrase",
      FAST_KDF
    );
    const plaintext = await decryptWithPassphrase(blob, "my secret passphrase");
    expect(plaintext).toBe("-----BEGIN PGP PRIVATE KEY BLOCK----- fake");
  });

  it("rejects a wrong passphrase", async () => {
    const blob = await encryptWithPassphrase("data", "right", FAST_KDF);
    await expect(decryptWithPassphrase(blob, "wrong")).rejects.toThrow(
      /wrong passphrase or corrupted/
    );
  });

  it("rejects tampered ciphertext", async () => {
    const blob = await encryptWithPassphrase("data", "pass", FAST_KDF);
    const tampered = {
      ...blob,
      ciphertext: blob.ciphertext.slice(0, -4) + "AAAA",
    };
    await expect(decryptWithPassphrase(tampered, "pass")).rejects.toThrow();
  });
});

describe("OpenPGP keys + messages", () => {
  let alice: GeneratedKeyPair;
  let bob: GeneratedKeyPair;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([
      generateKeyPair({ name: "Alice", email: "alice@example.com" }),
      generateKeyPair({ name: "Bob", email: "bob@example.com" }),
    ]);
  });

  it("generates a valid keypair with a fingerprint", async () => {
    expect(alice.publicKeyArmored).toContain("BEGIN PGP PUBLIC KEY BLOCK");
    expect(alice.privateKeyArmored).toContain("BEGIN PGP PRIVATE KEY BLOCK");
    expect(alice.fingerprint).toMatch(/^[0-9A-F]{40}$/);
    const fp = await readPublicKeyFingerprint(alice.publicKeyArmored);
    expect(fp).toBe(alice.fingerprint);
  });

  it("rejects a private key passed as public", async () => {
    await expect(
      readPublicKeyFingerprint(alice.privateKeyArmored)
    ).rejects.toThrow(/Expected a public key/);
  });

  it("encrypts to self and decrypts (create-secret flow)", async () => {
    const armored = await encryptMessage("hunter2", [alice.publicKeyArmored]);
    const result = await decryptMessage(armored, alice.privateKeyArmored);
    expect(result.plaintext).toBe("hunter2");
  });

  it("encrypts to multiple recipients (share flow)", async () => {
    const armored = await encryptMessage("shared-password", [
      alice.publicKeyArmored,
      bob.publicKeyArmored,
    ]);
    const forAlice = await decryptMessage(armored, alice.privateKeyArmored);
    const forBob = await decryptMessage(armored, bob.privateKeyArmored);
    expect(forAlice.plaintext).toBe("shared-password");
    expect(forBob.plaintext).toBe("shared-password");
  });

  it("non-recipient cannot decrypt", async () => {
    const armored = await encryptMessage("secret", [alice.publicKeyArmored]);
    await expect(
      decryptMessage(armored, bob.privateKeyArmored)
    ).rejects.toThrow();
  });

  it("signs and verifies (signed share)", async () => {
    const armored = await encryptMessage(
      "signed-secret",
      [bob.publicKeyArmored],
      alice.privateKeyArmored
    );
    const result = await decryptMessage(armored, bob.privateKeyArmored, [
      alice.publicKeyArmored,
    ]);
    expect(result.plaintext).toBe("signed-secret");
    expect(result.signatureValid).toBe(true);
  });

  it("detects a signature from the wrong signer", async () => {
    const armored = await encryptMessage(
      "signed-secret",
      [bob.publicKeyArmored],
      alice.privateKeyArmored
    );
    const result = await decryptMessage(armored, bob.privateKeyArmored, [
      bob.publicKeyArmored, // wrong verification key
    ]);
    expect(result.signatureValid).toBe(false);
  });

  it("detached sign/verify round-trip", async () => {
    const sig = await signDetached("challenge-token", alice.privateKeyArmored);
    expect(
      await verifyDetached("challenge-token", sig, alice.publicKeyArmored)
    ).toBe(true);
    expect(
      await verifyDetached("different-text", sig, alice.publicKeyArmored)
    ).toBe(false);
    expect(
      await verifyDetached("challenge-token", sig, bob.publicKeyArmored)
    ).toBe(false);
  });
});

describe("recovery kit", () => {
  it("full flow: keygen -> wrap -> kit -> parse -> unwrap -> decrypt secret", async () => {
    const keys = await generateKeyPair({
      name: "Carol",
      email: "carol@example.com",
    });
    const blob = await encryptWithPassphrase(
      keys.privateKeyArmored,
      "carols passphrase",
      FAST_KDF
    );
    const kitJson = createRecoveryKit({
      email: "carol@example.com",
      fingerprint: keys.fingerprint,
      encryptedPrivateKey: blob,
    });

    const kit = parseRecoveryKit(kitJson);
    expect(kit.fingerprint).toBe(keys.fingerprint);

    const recoveredKey = await decryptWithPassphrase(
      kit.encryptedPrivateKey,
      "carols passphrase"
    );
    expect(recoveredKey).toBe(keys.privateKeyArmored);

    const secret = await encryptMessage("vault-item", [keys.publicKeyArmored]);
    const result = await decryptMessage(secret, recoveredKey);
    expect(result.plaintext).toBe("vault-item");
  });

  it("rejects malformed kits", () => {
    expect(() => parseRecoveryKit("not json")).toThrow(/not valid JSON/);
    expect(() => parseRecoveryKit('{"format":"other"}')).toThrow(
      /unrecognized format/
    );
  });
});
