import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import * as openpgp from "openpgp";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { InitializeDto } from "./dto/initialize.dto";

const encryptedBlobSchema = z.object({
  version: z.literal(1),
  kdf: z.object({
    algorithm: z.literal("argon2id"),
    salt: z.string().min(1),
    memoryKiB: z.number().int().positive(),
    iterations: z.number().int().positive(),
    parallelism: z.number().int().positive(),
    keyLength: z.number().int().positive(),
  }),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getStatus() {
    const installation = await this.prisma.installation.findFirst({
      include: { organization: { select: { id: true, name: true, mode: true } } },
    });

    if (!installation || !installation.initializedAt) {
      return { initialized: false };
    }

    return {
      initialized: true,
      mode: installation.mode,
      organizationName: installation.organization?.name ?? null,
    };
  }

  async initialize(dto: InitializeDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.installation.findFirst({
      where: { initializedAt: { not: null } },
      include: { organization: true },
    });
    if (existing) {
      if (!existing.organizationId || !existing.organization) {
        throw new ConflictException("Installation has already been initialized");
      }
      const owner = await this.prisma.user.findFirst({
        where: { orgId: existing.organizationId, email, orgRole: "OWNER" },
      });
      if (owner) {
        return {
          org: {
            id: existing.organization.id,
            name: existing.organization.name,
            mode: existing.organization.mode,
          },
          user: {
            id: owner.id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            orgRole: owner.orgRole,
            status: owner.status,
          },
        };
      }
      throw new ConflictException("Installation has already been initialized");
    }

    const blobResult = encryptedBlobSchema.safeParse(dto.encryptedPrivateKey);
    if (!blobResult.success) {
      throw new BadRequestException("encryptedPrivateKey is not a valid EncryptedBlob");
    }

    let fingerprint: string;
    try {
      const key = await openpgp.readKey({ armoredKey: dto.armoredPublicKey });
      if (key.isPrivate()) throw new Error("private key");
      fingerprint = key.getFingerprint().toUpperCase();
    } catch {
      throw new BadRequestException("armoredPublicKey is not a valid OpenPGP public key");
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("An account with this email already exists");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const result = await this.prisma.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: {
          name: dto.orgName,
          mode: dto.mode as any,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          orgId: org.id,
          orgRole: "OWNER",
          status: "ACTIVE",
        },
      });

      await tx.gpgKey.create({
        data: {
          userId: user.id,
          publicKey: dto.armoredPublicKey,
          fingerprint,
          encryptedPrivateKey: blobResult.data as any,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      const installation = await tx.installation.create({
        data: {
          mode: dto.mode as any,
          organizationId: org.id,
          initializedAt: new Date(),
        },
      });

      return { org, user, installation };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    try {
      await this.audit.log({
        orgId: result.org.id,
        userId: result.user.id,
        action: "installation.initialize",
        entityType: "installation",
        entityId: result.installation.id,
        metadata: { mode: dto.mode, orgName: dto.orgName },
      });
    } catch {
      // Audit logging must not break an otherwise successful setup.
    }

    return {
      org: { id: result.org.id, name: result.org.name, mode: result.org.mode },
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        orgRole: result.user.orgRole,
        status: result.user.status,
      },
    };
  }
}
