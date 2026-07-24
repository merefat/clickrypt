import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as openpgp from "openpgp";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { DeploymentPolicyService } from "../installations/deployment-policy.service";
import { RegisterUserDto } from "./dto/register-user.dto";
import { CompleteSetupDto } from "./dto/complete-setup.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

/* eslint-disable @typescript-eslint/no-explicit-any */
function isPrismaUniqueViolation(error: any): boolean {
  return (
    error?.code === "P2002" &&
    typeof error?.name === "string" &&
    error.name.includes("PrismaClientKnownRequestError")
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Shape of the passphrase-encrypted private key blob produced by
// @clickrypt/crypto's encryptWithPassphrase. The server only validates
// structure — it can never decrypt the contents.
const encryptedBlobSchema = z.object({
  version: z.literal(1),
  kdf: z.object({
    algorithm: z.literal("argon2id"),
    salt: z.string().min(1),
    memoryKiB: z.number().int().positive(),
    iterations: z.number().int().positive(),
    parallelism: z.number().int().positive(),
    keyLength: z.number().int().min(4),
  }),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deploymentPolicy: DeploymentPolicyService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterUserDto) {
    const blobResult = encryptedBlobSchema.safeParse(dto.encryptedPrivateKey);
    if (!blobResult.success) {
      throw new BadRequestException(
        "encryptedPrivateKey is not a valid EncryptedBlob"
      );
    }

    let fingerprint: string;
    try {
      const key = await openpgp.readKey({ armoredKey: dto.armoredPublicKey });
      if (key.isPrivate()) {
        throw new Error("private key");
      }
      fingerprint = key.getFingerprint().toUpperCase();
    } catch {
      throw new BadRequestException(
        "armoredPublicKey is not a valid OpenPGP public key"
      );
    }

    const email = dto.email.toLowerCase();
    const org = await this.prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!org) {
      throw new BadRequestException(
        "No organization configured. Run onboarding first."
      );
    }

    if (org.mode === "SELF_HOSTED") {
      await this.deploymentPolicy.assertRegistrationOpen(org.id);
    }

    const invite = await this.prisma.invite.findFirst({
      where: { orgId: org.id, email, acceptedAt: null },
    });
    if (!invite) {
      throw new ForbiddenException("Registration requires an invitation");
    }

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const user = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.user.create({
          data: {
            email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            orgId: org.id,
            orgRole: invite.role,
            status: "ACTIVE",
          },
        });
        await tx.gpgKey.create({
          data: {
            userId: created.id,
            publicKey: dto.armoredPublicKey,
            fingerprint,
            encryptedPrivateKey: blobResult.data as any,
          },
        });
        await tx.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date(), status: "ACCEPTED" },
        });
        await tx.organizationMembership.create({
          data: {
            organizationId: org.id,
            userId: created.id,
            role: invite.role,
            status: "ACTIVE",
          },
        });

        // Auto-add user to all existing groups in the org
        const orgGroups = await tx.group.findMany({
          where: { orgId: org.id },
          select: { id: true },
        });
        if (orgGroups.length > 0) {
          await tx.groupUser.createMany({
            data: orgGroups.map((g: any) => ({
              groupId: g.id,
              userId: created.id,
              role: "USER",
            })),
            skipDuplicates: true,
          });
        }

        return created;
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return this.toProfile(user.id);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException(
          "An account with this email or key already exists"
        );
      }
      throw error;
    }
  }

  async toProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { gpgKey: { select: { fingerprint: true } } },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      orgRole: user.orgRole,
      status: user.status,
      orgId: user.orgId,
      fingerprint: user.gpgKey?.fingerprint ?? null,
      avatarBase64: user.avatarBase64 ?? null,
      jobTitle: user.jobTitle ?? null,
      phone: user.phone ?? null,
      bio: user.bio ?? null,
      timezone: user.timezone ?? null,
      createdAt: user.createdAt,
    };
  }

  async listOrgUsers(orgId: string) {
    const users = await this.prisma.user.findMany({
      where: { orgId, status: { in: ["ACTIVE", "PENDING"] } },
      include: { gpgKey: { select: { fingerprint: true } } },
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      fingerprint: u.gpgKey?.fingerprint ?? null,
    }));
  }

  async getPublicKey(userId: string) {
    const gpgKey = await this.prisma.gpgKey.findUnique({
      where: { userId },
      select: { publicKey: true, fingerprint: true },
    });
    if (!gpgKey) {
      throw new NotFoundException("No public key found for this user");
    }
    return gpgKey;
  }

  async completeSetup(dto: CompleteSetupDto) {
    const blobResult = encryptedBlobSchema.safeParse(dto.encryptedPrivateKey);
    if (!blobResult.success) {
      throw new BadRequestException(
        "encryptedPrivateKey is not a valid EncryptedBlob"
      );
    }

    let fingerprint: string;
    try {
      const key = await openpgp.readKey({ armoredKey: dto.armoredPublicKey });
      if (key.isPrivate()) {
        throw new Error("private key");
      }
      fingerprint = key.getFingerprint().toUpperCase();
    } catch {
      throw new BadRequestException(
        "armoredPublicKey is not a valid OpenPGP public key"
      );
    }

    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException("No invitation found for this email");
    }
    if (user.status !== "PENDING") {
      throw new BadRequestException("This account is already set up or inactive");
    }

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await this.prisma.$transaction(async (tx: any) => {
        await tx.gpgKey.create({
          data: {
            userId: user.id,
            publicKey: dto.armoredPublicKey,
            fingerprint,
            encryptedPrivateKey: blobResult.data as any,
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE", firstName: dto.firstName, lastName: dto.lastName },
        });
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return this.toProfile(user.id);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException(
          "An account with this email or key already exists"
        );
      }
      throw error;
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const data: Record<string, string | null> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.bio !== undefined) data.bio = dto.bio || null;
    if (dto.timezone !== undefined) data.timezone = dto.timezone || null;
    if (dto.avatarBase64 !== undefined) {
      this.validateAvatarSize(dto.avatarBase64);
      data.avatarBase64 = dto.avatarBase64;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }
    return this.toProfile(userId);
  }

  async uploadAvatar(userId: string, avatarBase64: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    this.validateAvatarSize(avatarBase64);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarBase64 },
    });
    return this.toProfile(userId);
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarBase64: null },
    });
    return this.toProfile(userId);
  }

  private validateAvatarSize(avatarBase64: string) {
    const MAX_BYTES = 2 * 1024 * 1024; // 2MB
    const base64Part = avatarBase64.split(",")[1] ?? "";
    const decodedSize = Math.ceil((base64Part.length * 3) / 4);
    if (decodedSize > MAX_BYTES) {
      throw new BadRequestException("Avatar image must be smaller than 2MB");
    }
  }

  async findByEmail(orgId: string, email: string) {
    const user = await this.prisma.user.findFirst({
      where: { orgId, email: { equals: email, mode: "insensitive" } },
      include: { gpgKey: { select: { fingerprint: true } } },
    });
    if (!user) throw new NotFoundException(`User not found: ${email}`);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      fingerprint: user.gpgKey?.fingerprint ?? null,
    };
  }

  async updatePassphrase(userId: string, encryptedPrivateKey: Record<string, unknown>) {
    const blobResult = encryptedBlobSchema.safeParse(encryptedPrivateKey);
    if (!blobResult.success) {
      throw new BadRequestException(
        "encryptedPrivateKey is not a valid EncryptedBlob"
      );
    }

    const gpgKey = await this.prisma.gpgKey.findUnique({ where: { userId } });
    if (!gpgKey) {
      throw new NotFoundException("No PGP key found for this user");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.gpgKey.update({
      where: { userId },
      data: { encryptedPrivateKey: blobResult.data as any },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { success: true };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException("Session not found");
    }
    await this.redis.del(`session:sid:${sessionId}`);
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
}
