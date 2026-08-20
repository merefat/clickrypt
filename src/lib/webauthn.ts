import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { toBuffer } from './passkeyCrypto';

type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

type WebAuthnExtensionsOutput = {
  prf?: {
    results?: {
      first?: ArrayBuffer;
    };
    resultsByCredential?: {
      [credentialId: string]: {
        first?: ArrayBuffer;
      };
    };
  };
};

export type PasskeyClientResult = {
  id: string;
  rawId: string;
  response: unknown;
  clientExtensionResults: WebAuthnExtensionsOutput;
  type: 'public-key';
};

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

type PrfEvalInput = {
  first?: unknown;
};

type PrfExtensionInput = {
  eval?: PrfEvalInput;
  evalByCredential?: Record<string, PrfEvalInput>;
};

function normalizePrfExtensions(optionsJSON: unknown): unknown {
  if (!optionsJSON || typeof optionsJSON !== 'object') return optionsJSON;
  const opts = optionsJSON as { extensions?: { prf?: unknown } };
  const prf = opts.extensions?.prf as PrfExtensionInput | undefined;
  if (prf) {
    if (prf.eval && typeof prf.eval.first === 'string') {
      prf.eval.first = toBuffer(prf.eval.first);
    }
    if (prf.evalByCredential) {
      for (const entry of Object.values(prf.evalByCredential)) {
        if (entry && typeof entry.first === 'string') {
          entry.first = toBuffer(entry.first);
        }
      }
    }
  }
  return optionsJSON;
}

export async function createPasskey(optionsJSON: unknown): Promise<PasskeyClientResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const opts = normalizePrfExtensions(optionsJSON) as RegistrationOptions;
  const result = (await startRegistration({ optionsJSON: opts })) as unknown as PasskeyClientResult;
  return result;
}

export async function getPasskey(optionsJSON: unknown): Promise<PasskeyClientResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const opts = normalizePrfExtensions(optionsJSON) as AuthenticationOptions;
  const result = (await startAuthentication({ optionsJSON: opts })) as unknown as PasskeyClientResult;
  return result;
}

export function getPrfOutput(
  result: PasskeyClientResult,
  credentialId?: string
): ArrayBuffer | null {
  const prf = result.clientExtensionResults?.prf;
  if (credentialId && prf?.resultsByCredential?.[credentialId]?.first) {
    return prf.resultsByCredential[credentialId].first;
  }
  return prf?.results?.first ?? null;
}
