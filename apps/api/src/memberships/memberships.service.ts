import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RedisService } from "../redis/redis.service";
import { ROLE_RANK, hasCapability, OrganizationCapability } from "./capabilities";
import type { OrgRole } from "@prisma/client";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async getActiveMembership(userId: string, orgId: string) {
    return this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
  }

  async listMembers(orgId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: { not: "REMOVED" } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            suspendedAt: true,
            createdAt: true,
            gpgKey: { select: { fingerprint: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
      status: m.status,
      userStatus: m.user.status,
      fingerprint: m.user.gpgKey?.fingerprint ?? null,
      createdAt: m.createdAt,
    }));
  }

  async listMembersWithPublicKeys(orgId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: {
        user: {
          select: {
            id: true,
            gpgKey: { select: { publicKey: true } },
          },
        },
      },
    });

    return memberships
      .filter((m) => m.user.gpgKey?.publicKey)
      .map((m) => ({
        userId: m.user.id,
        publicKey: m.user.gpgKey!.publicKey,
      }));
  }

  async listMembersBasic(orgId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
    }));
  }

  async updateRole(
    orgId: string,
    targetUserId: string,
    dto: UpdateRoleDto,
    actingUserId: string,
  ) {
    const actingMembership = await this.getActiveMembership(actingUserId, orgId);
    if (!actingMembership || actingMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.CHANGE_ROLE)) {
      throw new ForbiddenException("Only the Owner can change member roles");
    }

    const targetMembership = await this.getActiveMembership(targetUserId, orgId);
    if (!targetMembership) {
      throw new NotFoundException("Member not found in this organization");
    }

    if (targetMembership.role === "OWNER") {
      throw new ForbiddenException("Cannot change the Owner's role");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.organizationMembership.update({
        where: { id: targetMembership.id },
        data: { role: dto.role as any },
      });

      await tx.user.update({
        where: { id: targetUserId },
        data: { orgRole: dto.role as any },
      });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "member.role.change",
      entityType: "membership",
      entityId: targetMembership.id,
      metadata: { targetUserId, newRole: dto.role },
    });

    return { id: targetUserId, role: dto.role };
  }

  async suspendMember(orgId: string, targetUserId: string, actingUserId: string) {
    const actingMembership = await this.getActiveMembership(actingUserId, orgId);
    if (!actingMembership || actingMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.SUSPEND_MEMBER)) {
      throw new ForbiddenException("Only Owner or Admin can suspend members");
    }

    const targetMembership = await this.getActiveMembership(targetUserId, orgId);
    if (!targetMembership) {
      throw new NotFoundException("Member not found in this organization");
    }

    if (targetMembership.role === "OWNER") {
      throw new ForbiddenException("Cannot suspend the Owner");
    }

    if (targetUserId === actingUserId) {
      throw new ForbiddenException("You cannot suspend yourself");
    }

    // Only OWNER can suspend ADMIN users
    if (targetMembership.role === "ADMIN") {
      if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.CHANGE_ROLE)) {
        throw new ForbiddenException("Only the Owner can suspend admins");
      }
    }

    // Fetch session IDs before transaction so we can clean Redis after
    const sessions = await this.prisma.session.findMany({
      where: { userId: targetUserId },
      select: { id: true },
    });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.organizationMembership.update({
        where: { id: targetMembership.id },
        data: { status: "SUSPENDED" as any },
      });
      await tx.user.update({
        where: { id: targetUserId },
        data: { status: "SUSPENDED" as any, suspendedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: targetUserId } });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Clean Redis session keys after transaction (best-effort)
    await Promise.all(
      sessions.map((s) => this.redis.del(`session:sid:${s.id}`)),
    );

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "member.suspend",
      entityType: "membership",
      entityId: targetMembership.id,
      metadata: { targetUserId },
    });

    return { id: targetUserId, status: "SUSPENDED" };
  }

  async restoreMember(orgId: string, targetUserId: string, actingUserId: string) {
    const actingMembership = await this.getActiveMembership(actingUserId, orgId);
    if (!actingMembership || actingMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.SUSPEND_MEMBER)) {
      throw new ForbiddenException("Only Owner or Admin can restore members");
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException("Member not found in this organization");
    }
    if (membership.status !== "SUSPENDED") {
      throw new BadRequestException("Member is not suspended");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.organizationMembership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE" as any },
      });
      await tx.user.update({
        where: { id: targetUserId },
        data: { status: "ACTIVE" as any, suspendedAt: null },
      });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "member.restore",
      entityType: "membership",
      entityId: membership.id,
      metadata: { targetUserId },
    });

    return { id: targetUserId, status: "ACTIVE" };
  }

  async removeMember(orgId: string, targetUserId: string, actingUserId: string) {
    const actingMembership = await this.getActiveMembership(actingUserId, orgId);
    if (!actingMembership || actingMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.CHANGE_ROLE)) {
      throw new ForbiddenException("Only the Owner can remove members");
    }

    const targetMembership = await this.getActiveMembership(targetUserId, orgId);
    if (!targetMembership) {
      throw new NotFoundException("Member not found in this organization");
    }

    if (targetMembership.role === "OWNER") {
      throw new ForbiddenException("Cannot remove the Owner");
    }

    if (targetUserId === actingUserId) {
      throw new ForbiddenException("You cannot remove yourself");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.organizationMembership.delete({
        where: { id: targetMembership.id },
      });

      await tx.gpgKey.deleteMany({ where: { userId: targetUserId } });
      await tx.groupUser.deleteMany({ where: { userId: targetUserId } });
      await tx.secret.deleteMany({ where: { userId: targetUserId } });
      await tx.permission.deleteMany({ where: { aroId: targetUserId } });
      await tx.session.deleteMany({ where: { userId: targetUserId } });
      await tx.mfaDevice.deleteMany({ where: { userId: targetUserId } });
      await tx.userFavorite.deleteMany({ where: { userId: targetUserId } });
      await tx.shareHistory.deleteMany({ where: { sharedById: targetUserId } });
      await tx.shareHistory.deleteMany({ where: { sharedWithId: targetUserId } });
      await tx.auditLog.deleteMany({ where: { userId: targetUserId } });
      await tx.recoveryRequest.deleteMany({ where: { userId: targetUserId } });

      await tx.user.delete({ where: { id: targetUserId } });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "member.remove",
      entityType: "membership",
      entityId: targetMembership.id,
      metadata: { targetUserId },
    });

    return { id: targetUserId, removed: true };
  }

  async transferOwnership(orgId: string, newOwnerId: string, actingUserId: string) {
    const actingMembership = await this.getActiveMembership(actingUserId, orgId);
    if (!actingMembership || actingMembership.status !== "ACTIVE") {
      throw new ForbiddenException("Not an active member");
    }

    if (!hasCapability(actingMembership.role as OrgRole, OrganizationCapability.TRANSFER_OWNERSHIP)) {
      throw new ForbiddenException("Only the Owner can transfer ownership");
    }

    if (actingUserId === newOwnerId) {
      throw new BadRequestException("You are already the Owner");
    }

    const newOwnerMembership = await this.getActiveMembership(newOwnerId, orgId);
    if (!newOwnerMembership || newOwnerMembership.status !== "ACTIVE") {
      throw new NotFoundException("Target member not found or not active");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.organizationMembership.update({
        where: { id: actingMembership.id },
        data: { role: "ADMIN" as any },
      });
      await tx.organizationMembership.update({
        where: { id: newOwnerMembership.id },
        data: { role: "OWNER" as any },
      });
      await tx.user.update({
        where: { id: actingUserId },
        data: { orgRole: "ADMIN" as any },
      });
      await tx.user.update({
        where: { id: newOwnerId },
        data: { orgRole: "OWNER" as any },
      });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId,
      userId: actingUserId,
      action: "ownership.transfer",
      entityType: "membership",
      entityId: newOwnerMembership.id,
      metadata: { newOwnerId, previousOwnerId: actingUserId },
    });

    return { newOwnerId, previousOwnerId: actingUserId };
  }
}
