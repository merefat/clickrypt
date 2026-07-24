import {
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import * as openpgp from "openpgp";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { MfaService } from "../mfa/mfa.service";
import type { AccessTokenPayload } from "./jwt-auth.guard";

const CHALLENGE_TTL_SECONDS = 120;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Ephemeral keypair used to produce indistinguishable decoy challenges for
  // unknown emails (user-enumeration resistance). Never persisted.
  private decoyPublicKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly mfaService: MfaService,
  ) {}

  // ── Challenge (step 1) ───────────────────────────────────────────────

  async createChallenge(email: string) {
    const normalized = email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { gpgKey: true },
    });

    if (!user || user.status !== "ACTIVE" || !user.gpgKey) {
      return this.createDecoyChallenge(normalized);
    }

    const token = randomBytes(32).toString("hex");
    await this.redis.set(
      `auth:challenge:${normalized}`,
      sha256(token),
      "EX",
      CHALLENGE_TTL_SECONDS
    );

    const challenge = await this.encryptTo(user.gpgKey.publicKey, token);
    return {
      challenge,
      encryptedPrivateKey: user.gpgKey.encryptedPrivateKey,
      fingerprint: user.gpgKey.fingerprint,
      expiresIn: CHALLENGE_TTL_SECONDS,
    };
  }

  /**
   * Returns a response with the same shape as a real challenge, encrypted to
   * a server-only ephemeral key, so callers cannot distinguish existing from
   * non-existing accounts. Login will always fail for these.
   */
  private async createDecoyChallenge(email: string) {
    if (!this.decoyPublicKey) {
      const { publicKey } = await openpgp.generateKey({
        type: "ecc",
        curve: "curve25519",
        userIDs: [{ name: "decoy", email: "decoy@clickrypt.local" }],
      });
      this.decoyPublicKey = publicKey;
    }
    const challenge = await this.encryptTo(
      this.decoyPublicKey,
      randomBytes(32).toString("hex")
    );
    // Deterministic-looking but fake blob/fingerprint derived from the email.
    const seed = sha256(`decoy:${email}:${process.env.JWT_SECRET}`);
    return {
      challenge,
      encryptedPrivateKey: {
        version: 1,
        kdf: {
          algorithm: "argon2id",
          salt: Buffer.from(seed.slice(0, 32), "hex").toString("base64"),
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 1,
          keyLength: 32,
        },
        iv: Buffer.from(seed.slice(32, 56), "hex").toString("base64"),
        ciphertext: Buffer.from(seed.repeat(40), "hex").toString("base64"),
      },
      fingerprint: seed.slice(0, 40).toUpperCase(),
      expiresIn: CHALLENGE_TTL_SECONDS,
    };
  }

  /** Server-side OpenPGP is ENCRYPT-ONLY. No private-key operations, ever. */
  private async encryptTo(armoredPublicKey: string, plaintext: string) {
    const key = await openpgp.readKey({ armoredKey: armoredPublicKey });
    return openpgp.encrypt({
      message: await openpgp.createMessage({ text: plaintext }),
      encryptionKeys: key,
    }) as Promise<string>;
  }

  // ── Login (step 2) ───────────────────────────────────────────────────

  async login(email: string, token: string) {
    const normalized = email.toLowerCase();
    const key = `auth:challenge:${normalized}`;
    const storedHash = await this.redis.get(key);
    // Single-use: consumed regardless of outcome.
    await this.redis.del(key);

    if (!storedHash || !safeEqualHex(storedHash, sha256(token))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { mfaDevices: { where: { type: "TOTP", verifiedAt: { not: null } }, take: 1 } },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }

    // If MFA is enabled, return a temp token instead of a session
    if (user.mfaDevices.length > 0) {
      const mfaToken = await this.mfaService.createMfaTempToken(user.id);
      return {
        accessToken: "",
        refreshToken: "",
        refreshExpiresAt: new Date(0),
        mfaRequired: true,
        mfaToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      } as any;
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: user.orgId, userId: user.id } },
      select: { role: true, status: true },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { id: true, name: true, mode: true },
    });

    const session = await this.issueSession(user.id, {
      email: user.email,
      orgId: user.orgId,
      orgRole: membership?.role ?? "USER",
    });

    return {
      ...session,
      mfaRequired: false,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: org ? { id: org.id, name: org.name, mode: org.mode } : null,
      membership: membership ? { role: membership.role, status: membership.status } : null,
    };
  }

  // ── MFA Login (step 3) ───────────────────────────────────────────────

  async loginWithMfa(mfaToken: string, code: string) {
    const userId = await this.mfaService.verifyMfaLogin(mfaToken, code);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: user.orgId, userId: user.id } },
      select: { role: true, status: true },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { id: true, name: true, mode: true },
    });

    const session = await this.issueSession(user.id, {
      email: user.email,
      orgId: user.orgId,
      orgRole: membership?.role ?? "USER",
    });

    return {
      ...session,
      mfaRequired: false,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: org ? { id: org.id, name: org.name, mode: org.mode } : null,
      membership: membership ? { role: membership.role, status: membership.status } : null,
    };
  }

  // ── Sessions ─────────────────────────────────────────────────────────

  private refreshTtlMs(): number {
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7);
    return days * 24 * 60 * 60 * 1000;
  }

  private async issueSession(
    userId: string,
    claims: { email: string; orgId: string; orgRole: string },
    existingSessionId?: string
  ): Promise<IssuedSession & { sessionId: string }> {
    const refreshToken = randomBytes(48).toString("base64url");
    const tokenHash = sha256(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());

    let sessionId: string;
    if (existingSessionId) {
      const updated = await this.prisma.session.update({
        where: { id: existingSessionId },
        data: { tokenHash, expiresAt: refreshExpiresAt },
      });
      sessionId = updated.id;
    } else {
      const created = await this.prisma.session.create({
        data: { userId, tokenHash, expiresAt: refreshExpiresAt },
      });
      sessionId = created.id;
    }

    const ttlSeconds = Math.floor(this.refreshTtlMs() / 1000);
    await this.redis.set(`session:sid:${sessionId}`, userId, "EX", ttlSeconds);

    const payload: AccessTokenPayload = {
      sub: userId,
      email: claims.email,
      orgId: claims.orgId,
      orgRole: claims.orgRole,
      sid: sessionId,
      jti: randomBytes(8).toString("hex"),
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, refreshToken, refreshExpiresAt, sessionId };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }
    const tokenHash = sha256(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      // Reuse detection: a rotated-out token being replayed means the
      // refresh token was stolen — revoke the whole session family.
      const compromisedSid = await this.redis.get(`refresh:used:${tokenHash}`);
      if (compromisedSid) {
        this.logger.warn(
          `Refresh token reuse detected for session ${compromisedSid} — revoking.`
        );
        await this.revokeSessionById(compromisedSid);
      }
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
      await this.revokeSessionById(session.id);
      throw new UnauthorizedException("Session expired");
    }

    // Fetch orgRole from membership since Prisma client needs regeneration
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: session.user.orgId, userId: session.userId } },
      select: { role: true },
    });

    // Mark the old token as used for the remainder of its lifetime.
    const remainingSeconds = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
    );
    await this.redis.set(
      `refresh:used:${tokenHash}`,
      session.id,
      "EX",
      remainingSeconds
    );

    return this.issueSession(
      session.userId,
      {
        email: session.user.email,
        orgId: session.user.orgId,
        orgRole: membership?.role ?? "USER",
      },
      session.id
    );
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return;
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (session) {
      await this.revokeSessionById(session.id);
    }
  }

  private async revokeSessionById(sessionId: string) {
    await this.redis.del(`session:sid:${sessionId}`);
    await this.prisma.session
      .delete({ where: { id: sessionId } })
      .catch(() => undefined);
  }
}
