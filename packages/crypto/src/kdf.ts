import { argon2id } from "hash-wasm";
import { base64ToBytes, bytesToBase64, randomBytes } from "./encoding.js";

export interface KdfParams {
  algorithm: "argon2id";
  /** Memory cost in KiB. */
  memoryKiB: number;
  /** Time cost (number of iterations). */
  iterations: number;
  parallelism: number;
  /** Base64-encoded random salt. */
  salt: string;
  /** Derived key length in bytes. */
  keyLength: number;
}

/** OWASP-recommended Argon2id baseline: 64 MiB memory, 3 iterations. */
export const DEFAULT_KDF_PARAMS: Omit<KdfParams, "salt"> = {
  algorithm: "argon2id",
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 4,
  keyLength: 32,
};

export function generateKdfParams(
  overrides: Partial<Omit<KdfParams, "salt" | "algorithm">> = {}
): KdfParams {
  return {
    ...DEFAULT_KDF_PARAMS,
    ...overrides,
    algorithm: "argon2id",
    salt: bytesToBase64(randomBytes(16)),
  };
}

/** Derives a symmetric key from a passphrase using Argon2id. */
export async function deriveKey(
  passphrase: string,
  params: KdfParams
): Promise<Uint8Array> {
  if (params.algorithm !== "argon2id") {
    throw new Error(`Unsupported KDF algorithm: ${params.algorithm}`);
  }
  return argon2id({
    password: passphrase,
    salt: base64ToBytes(params.salt),
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: Math.max(params.keyLength, 4),
    outputType: "binary",
  });
}
