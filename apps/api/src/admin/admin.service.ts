import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { RedisService } from "../redis/redis.service";
import { OrgsService } from "../orgs/orgs.service";
import { EmailService } from "../email-queue/email.service";
import { InviteUserDto, AddMemberDto } from "./dto/invite-user.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly orgsService: OrgsService,
    private readonly emailService: EmailService,
  ) {}

  async listUsers(orgId: string) {
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        orgRole: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateUserStatus(orgId: string, userId: string, status: string, actingUserId: string) {
    const valid = ["ACTIVE", "SUSPENDED", "DELETED"];
    if (!valid.includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true, email: true, orgRole: true, status: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Role hierarchy checks for suspend/delete actions
    if (status === "SUSPENDED" || status === "DELETED") {
      if (userId === actingUserId) {
        throw new ForbiddenException("You cannot suspend or delete your own account");
      }
      if (user.orgRole === "OWNER") {
        throw new ForbiddenException("Cannot suspend or delete the Owner");
      }
      // Only OWNER can suspend/delete ADMIN users
      if (user.orgRole === "ADMIN") {
        const actingMembership = await this.prisma.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: orgId, userId: actingUserId } },
          select: { role: true },
        });
        if (actingMembership?.role !== "OWNER") {
          throw new ForbiddenException("Only the Owner can suspend or delete admins");
        }
      }
    }

    // Fetch session IDs before transaction so we can clean Redis after
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const userData: any = { status: status as any };
      if (status === "SUSPENDED") {
        userData.suspendedAt = new Date();
      } else if (status === "ACTIVE") {
        userData.suspendedAt = null;
      }

      const u = await tx.user.update({
        where: { id: userId },
        data: userData,
        select: { id: true, email: true, status: true },
      });

      // Map DELETED to REMOVED for membership (MembershipStatus enum doesn't have DELETED)
      const membershipStatus = status === "DELETED" ? "REMOVED" : status;
      await tx.organizationMembership.updateMany({
        where: { organizationId: orgId, userId },
        data: { status: membershipStatus as any },
      });

      // Revoke all DB sessions when suspending or deleting
      if (status === "SUSPENDED" || status === "DELETED") {
        await tx.session.deleteMany({ where: { userId } });
      }

      return u;
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Clean Redis session keys after transaction (best-effort)
    if (status === "SUSPENDED" || status === "DELETED") {
      await Promise.all(
        sessions.map((s) => this.redis.del(`session:sid:${s.id}`)),
      );
    }

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "admin.user.status_change",
      entityType: "user",
      entityId: userId,
      metadata: { email: user.email, newStatus: status },
    });

    return updated;
  }

  async updateUserRole(orgId: string, userId: string, role: string) {
    const valid = ["USER", "ADMIN"];
    if (!valid.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const user = await this.prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { orgRole: role as any },
        select: { id: true, email: true, orgRole: true },
      });

      await tx.organizationMembership.updateMany({
        where: { organizationId: orgId, userId },
        data: { role: role as any },
      });

      return u;
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return updated;
  }

  async listAuditLogs(orgId: string, limit = 100, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where: { orgId } }),
    ]);
    return { items, total };
  }

  async inviteUser(orgId: string, invitedById: string, dto: InviteUserDto) {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const existingInvite = await this.prisma.invite.findFirst({
      where: { orgId, email, status: "PENDING" },
    });
    if (existingInvite) {
      throw new ConflictException("An invite has already been sent to this email");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

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
        role: dto.role,
      });
    } catch (err) {
      // Email queue failed but invite record created; return link so admin can share manually
    }

    await this.audit.log({
      orgId,
      userId: invitedById,
      action: "admin.user.invite",
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

  async addMember(orgId: string, addedByUserId: string, dto: AddMemberDto) {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const existingInvite = await this.prisma.invite.findFirst({
      where: { orgId, email, status: "PENDING" },
    });
    if (existingInvite) {
      throw new ConflictException("An invite has already been sent to this email");
    }

    const validRoles = ["USER", "ADMIN"];
    if (!validRoles.includes(dto.role)) {
      throw new BadRequestException(`Invalid role: ${dto.role}`);
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const user = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role as any,
          orgRole: dto.role as any,
          status: "PENDING",
          orgId,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          orgRole: true,
          status: true,
          createdAt: true,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: orgId,
          userId: created.id,
          role: dto.role as any,
          status: "PENDING",
        },
      });

      await tx.invite.create({
        data: {
          orgId,
          email,
          role: dto.role as any,
          tokenHash,
          expiresAt,
          status: "PENDING" as any,
          invitedById: addedByUserId,
        },
      });

      return created;
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
        role: dto.role,
      });
    } catch (err) {
      // Email queue failed but user + invite created; return link so admin can share manually
    }

    await this.audit.log({
      orgId,
      userId: addedByUserId,
      action: "admin.member.add",
      entityType: "user",
      entityId: user.id,
      metadata: { email, role: dto.role },
    });

    return { ...user, inviteLink };
  }

  async deleteUser(orgId: string, userId: string, callerUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true, orgRole: true, email: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Only OWNER can delete other OWNER users
    if (user.orgRole === "OWNER") {
      const callerMembership = await this.prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId: orgId, userId: callerUserId },
        },
        select: { role: true },
      });
      if (callerMembership?.role !== "OWNER") {
        throw new ForbiddenException("Only the organization owner can delete OWNER users");
      }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.gpgKey.deleteMany({ where: { userId } });
      await tx.groupUser.deleteMany({ where: { userId } });
      await tx.secret.deleteMany({ where: { userId } });
      await tx.permission.deleteMany({ where: { aroId: userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.mfaDevice.deleteMany({ where: { userId } });
      await tx.userFavorite.deleteMany({ where: { userId } });
      await tx.shareHistory.deleteMany({ where: { sharedById: userId } });
      await tx.shareHistory.deleteMany({ where: { sharedWithId: userId } });
      await tx.auditLog.deleteMany({ where: { userId } });
      await tx.recoveryRequest.deleteMany({ where: { userId } });
      await tx.organizationMembership.deleteMany({ where: { userId } });

      await tx.invite.deleteMany({ where: { invitedById: userId } });
      await tx.invite.updateMany({
        where: { acceptedById: userId },
        data: { acceptedById: null },
      });

      await tx.user.delete({ where: { id: userId } });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId,
      userId: callerUserId,
      action: "admin.user.delete",
      entityType: "user",
      entityId: userId,
      metadata: { email: user.email },
    });

    return { id: userId, deleted: true };
  }
}
