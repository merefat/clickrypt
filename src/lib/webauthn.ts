import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';

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

export async function createPasskey(optionsJSON: unknown): Promise<PasskeyClientResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const opts = optionsJSON as unknown as RegistrationOptions;
  const result = (await startRegistration({ optionsJSON: opts })) as unknown as PasskeyClientResult;
  return result;
}

export async function getPasskey(optionsJSON: unknown): Promise<PasskeyClientResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const opts = optionsJSON as unknown as AuthenticationOptions;
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
