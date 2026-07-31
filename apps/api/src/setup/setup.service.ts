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
import { ConfigureSystemDto } from "./dto/configure-system.dto";

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

    if (
      !installation ||
      !installation.initializedAt ||
      !installation.organizationId ||
      !installation.organization
    ) {
      return { initialized: false };
    }

    return {
      initialized: true,
      mode: installation.mode,
      organizationName: installation.organization?.name ?? null,
    };
  }

  async configureSystem(dto: ConfigureSystemDto) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const existing = await this.prisma.installation.findFirst({
      include: { organization: true },
    });
    if (existing && !existing.organization) {
      await this.prisma.installation.delete({ where: { id: existing.id } });
    }
    if (existing && existing.organization) {
      const org = await this.prisma.organization.update({
        where: { id: existing.organizationId! },
        data: { name: dto.orgName, mode: dto.mode as any },
      });
      const installation = await this.prisma.installation.update({
        where: { id: existing.id },
        data: { mode: dto.mode as any },
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return { configured: true, orgId: org.id, installationId: installation.id };
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: { name: dto.orgName, mode: dto.mode as any },
      });
      const installation = await tx.installation.create({
        data: { mode: dto.mode as any, organizationId: org.id },
      });
      return { org, installation };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      configured: true,
      orgId: result.org.id,
      installationId: result.installation.id,
    };
  }

  async initialize(dto: InitializeDto) {
    const email = dto.email.toLowerCase();
    const initializedInstallation = await this.prisma.installation.findFirst({
      where: { initializedAt: { not: null } },
      include: { organization: true },
    });
    if (initializedInstallation) {
      if (!initializedInstallation.organizationId || !initializedInstallation.organization) {
        // Stale installation left by an incomplete or partial cleanup; remove it.
        await this.prisma.installation.delete({
          where: { id: initializedInstallation.id },
        });
      } else {
        const owner = await this.prisma.user.findFirst({
          where: { orgId: initializedInstallation.organizationId, email, orgRole: "OWNER" },
        });
        if (owner) {
          return {
            org: {
              id: initializedInstallation.organization.id,
              name: initializedInstallation.organization.name,
              mode: initializedInstallation.organization.mode,
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
        throw new ConflictException(
          "An owner already exists for this installation. Please sign in.",
        );
      }
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
    let installation = (await this.prisma.installation.findFirst({
      include: { organization: true },
    })) as any;
    let org: any;
    if (installation && installation.organization) {
      org = installation.organization;
    } else {
      if (!dto.mode || !dto.orgName) {
        throw new BadRequestException(
          "mode and orgName are required when no system config exists"
        );
      }
      const created = await this.prisma.$transaction(async (tx: any) => {
        const org = await tx.organization.create({
          data: { name: dto.orgName, mode: dto.mode as any },
        });
        const installation = await tx.installation.create({
          data: { mode: dto.mode as any, organizationId: org.id },
        });
        return { org, installation };
      });
      org = created.org;
      installation = created.installation;
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
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

      const updatedInstallation = await tx.installation.update({
        where: { id: installation.id },
        data: { initializedAt: new Date() },
      });

      return { org, user, installation: updatedInstallation };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    try {
      await this.audit.log({
        orgId: result.org.id,
        userId: result.user.id,
        action: "installation.initialize",
        entityType: "installation",
        entityId: result.installation.id,
        metadata: { mode: org.mode, orgName: org.name },
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
