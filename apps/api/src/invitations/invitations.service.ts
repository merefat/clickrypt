import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import * as openpgp from "openpgp";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { DeploymentPolicyService } from "../installations/deployment-policy.service";
import { OrgsService } from "../orgs/orgs.service";
import { EmailService } from "../email-queue/email.service";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { hasCapability, OrganizationCapability } from "../memberships/capabilities";
import type { OrgRole } from "@prisma/client";

const INVITE_TTL_HOURS = 48;

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly deploymentPolicy: DeploymentPolicyService,
    private readonly orgsService: OrgsService,
    private readonly emailService: EmailService,
  ) {}

  async create(orgId: string, invitedById: string, dto: CreateInvitationDto) {
    await this.deploymentPolicy.assertCanInvite(orgId);

    const inviterMembership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: invitedById } },
    });
    if (!inviterMembership || inviterMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (dto.role === "ADMIN" && !hasCapability(inviterMembership.role as OrgRole, OrganizationCapability.INVITE_ADMIN)) {
      throw new ForbiddenException("Only the Owner can invite Admin members");
    }

    if (!hasCapability(inviterMembership.role as OrgRole, OrganizationCapability.INVITE_USER)) {
      throw new ForbiddenException("Only Owner or Admin can invite members");
    }

    const email = dto.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("An account with this email already exists");
    }

    const existingInvite = await this.prisma.invite.findFirst({
      where: { orgId, email, status: "PENDING" },
    });
    if (existingInvite) {
      throw new ConflictException("An invite has already been sent to this email");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const invite = await this.prisma.invite.create({
      data: {
        orgId,
        email,
        role: dto.role as any,
        tokenHash,
        expiresAt,
        status: "PENDING" as any,
        invitedById,
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const smtpConfig = await this.orgsService.getFullSmtpSettings(orgId);
    const appUrl = smtpConfig?.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${token}`;

    try {
      await this.emailService.sendInviteEmail({
        orgId,
        email,
        inviteLink,
        orgName: org?.name ?? "Clickrypt",
        role: invite.role,
      });
    } catch (err) {
      // Email queue failed but invite record created; return link so admin can share manually
    }

    await this.audit.log({
      orgId,
      userId: invitedById,
      action: "invitation.create",
      entityType: "invite",
      entityId: invite.id,
      metadata: { email, role: dto.role },
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      token,
      inviteLink,
    };
  }

  async listPending(orgId: string) {
    return this.prisma.invite.findMany({
      where: { orgId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }

  async preview(token: string) {
    const tokenHash = sha256(token);
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
      include: { org: { select: { name: true } } },
    });

    if (!invite) {
      throw new NotFoundException("Invalid or expired invite token");
    }

    if (invite.status === "ACCEPTED") {
      throw new BadRequestException("This invite has already been used");
    }

    if (invite.status === "REVOKED") {
      throw new BadRequestException("This invite has been revoked");
    }

    if (invite.expiresAt < new Date()) {
      if (invite.status === "PENDING") {
        await this.prisma.invite.update({
          where: { id: invite.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new BadRequestException("This invite has expired");
    }

    return {
      email: invite.email,
      role: invite.role,
      orgName: invite.org.name,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    const tokenHash = sha256(token);
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
    });

    if (!invite) {
      throw new NotFoundException("Invalid or expired invite token");
    }

    if (invite.status === "ACCEPTED") {
      throw new BadRequestException("This invite has already been used");
    }

    if (invite.status === "REVOKED") {
      throw new BadRequestException("This invite has been revoked");
    }

    if (invite.expiresAt < new Date()) {
      if (invite.status === "PENDING") {
        await this.prisma.invite.update({
          where: { id: invite.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new BadRequestException("This invite has expired");
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

    const email = invite.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const user = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.user.create({
          data: {
            email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            orgId: invite.orgId,
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

        await tx.organizationMembership.create({
          data: {
            organizationId: invite.orgId,
            userId: created.id,
            role: invite.role,
            status: "ACTIVE",
          },
        });

        await tx.invite.update({
          where: { id: invite.id },
          data: {
            acceptedAt: new Date(),
            acceptedById: created.id,
            status: "ACCEPTED",
          },
        });

        // Auto-add user to all existing groups in the org
        const orgGroups = await tx.group.findMany({
          where: { orgId: invite.orgId },
          select: { id: true },
        });
        if (orgGroups.length > 0) {
          await tx.groupUser.createMany({
            data: orgGroups.map((g: { id: string }) => ({
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

      await this.audit.log({
        orgId: invite.orgId,
        userId: user.id,
        action: "invitation.accept",
        entityType: "invite",
        entityId: invite.id,
        metadata: { email },
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        orgRole: user.orgRole,
        status: user.status,
      };
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException("An account with this email or key already exists");
      }
      throw error;
    }
  }

  async revoke(orgId: string, inviteId: string, actingUserId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, orgId },
    });
    if (!invite) {
      throw new NotFoundException("Invitation not found");
    }
    if (invite.status !== "PENDING") {
      throw new BadRequestException("Only pending invitations can be revoked");
    }

    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: "REVOKED" },
    });

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "invitation.revoke",
      entityType: "invite",
      entityId: inviteId,
      metadata: { email: invite.email },
    });

    return { id: inviteId, status: "REVOKED" };
  }
}
