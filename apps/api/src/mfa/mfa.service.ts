import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { generateSecret, generateURI, verify } from "otplib";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const MFA_TEMP_TTL = 300; // 5 minutes

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async enroll(userId: string, email: string) {
    const existing = await this.prisma.mfaDevice.findFirst({
      where: { userId, type: "TOTP", verifiedAt: { not: null } },
    });
    if (existing) {
      throw new BadRequestException("MFA is already enabled");
    }

    const secret = generateSecret();
    const otpauthUri = generateURI({
      issuer: 'Clickrypt',
      label: email,
      secret,
    });

    // Store secret temporarily in Redis until verified
    await this.redis.set(
      `mfa:enroll:${userId}`,
      secret,
      "EX",
      MFA_TEMP_TTL
    );

    return { secret, otpauthUri };
  }

  async verify(userId: string, code: string) {
    const secret = await this.redis.get(`mfa:enroll:${userId}`);
    if (!secret) {
      throw new BadRequestException(
        "No pending MFA enrollment. Call enroll first."
      );
    }

    const isValid = verify({ token: code, secret });
    if (!isValid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    // Delete any existing unverified devices, then create verified one
    await this.prisma.mfaDevice.deleteMany({
      where: { userId, type: "TOTP" },
    });

    await this.prisma.mfaDevice.create({
      data: {
        userId,
        type: "TOTP",
        credentialData: secret,
        verifiedAt: new Date(),
      },
    });

    await this.redis.del(`mfa:enroll:${userId}`);
    return { enabled: true };
  }

  async disable(userId: string) {
    const device = await this.prisma.mfaDevice.findFirst({
      where: { userId, type: "TOTP", verifiedAt: { not: null } },
    });
    if (!device) {
      throw new NotFoundException("MFA is not enabled");
    }
    await this.prisma.mfaDevice.delete({ where: { id: device.id } });
    return { enabled: false };
  }

  async getStatus(userId: string) {
    const device = await this.prisma.mfaDevice.findFirst({
      where: { userId, type: "TOTP", verifiedAt: { not: null } },
    });
    return { enabled: !!device };
  }

  /** Called during login: if user has MFA, issue a temp token instead of session. */
  async createMfaTempToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.redis.set(`mfa:login:${token}`, userId, "EX", MFA_TEMP_TTL);
    return token;
  }

  /** Verify MFA code and return userId for session issuance. */
  async verifyMfaLogin(mfaToken: string, code: string): Promise<string> {
    const userId = await this.redis.get(`mfa:login:${mfaToken}`);
    if (!userId) {
      throw new UnauthorizedException("Invalid or expired MFA token");
    }

    const device = await this.prisma.mfaDevice.findFirst({
      where: { userId, type: "TOTP", verifiedAt: { not: null } },
    });
    if (!device) {
      throw new UnauthorizedException("MFA not enabled");
    }

    const isValid = verify({
      token: code,
      secret: device.credentialData,
    });
    if (!isValid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    await this.redis.del(`mfa:login:${mfaToken}`);
    return userId;
  }
}
