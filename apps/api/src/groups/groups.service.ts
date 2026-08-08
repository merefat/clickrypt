import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PermissionsService } from "../permissions/permissions.service";
import { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";

export type GroupRole = "OWNER" | "ADMIN" | "USER";

const RANK: Record<GroupRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  USER: 1,
};

function rank(role: string | null | undefined): number {
  return RANK[role as GroupRole] ?? 0;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(userId: string, orgId: string, dto: CreateGroupDto) {
    // Fetch all active org members to auto-add as group members
    const activeMembers = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { userId: true, role: true },
    });

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const group = await this.prisma.group.create({
        data: {
          orgId,
          name: dto.name,
          members: {
            create: activeMembers.map((m) => ({
              userId: m.userId,
              role: m.userId === userId ? "OWNER" : "USER",
            })),
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  gpgKey: { select: { publicKey: true } },
                },
              },
            },
          },
        },
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */

      return {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        members: (group as any).members.map((m: any) => ({
          userId: m.userId,
          email: m.user.email,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          role: m.role,
          publicKey: m.user.gpgKey?.publicKey ?? null,
        })),
      };
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        throw new ConflictException("Group name already exists in this org");
      }
      throw err;
    }
  }

  async list(userId: string, orgId: string) {
    const groups = await this.prisma.group.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true } },
        members: { where: { userId }, select: { role: true } },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g._count.members,
      createdAt: g.createdAt,
      myRole: (g.members[0]?.role as GroupRole | undefined) ?? null,
    }));
  }

  async get(userId: string, orgId: string, id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, orgId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const myMembership = await this.prisma.groupUser.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });

    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      myRole: (myMembership?.role as GroupRole | undefined) ?? null,
      members: group.members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        role: m.role as GroupRole,
      })),
    };
  }

  async update(userId: string, orgId: string, id: string, dto: UpdateGroupDto) {
    await this.requireRole(userId, orgId, id, "ADMIN");
    const group = await this.prisma.group.findFirst({
      where: { id, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    try {
      return await this.prisma.group.update({
        where: { id },
        data: { ...(dto.name !== undefined && { name: dto.name }) },
      });
    } catch (err: unknown) {
      // Check for Prisma unique constraint violation (P2002)
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        throw new ConflictException("Group name already exists");
      }
      throw err;
    }
  }

  async delete(userId: string, orgId: string, id: string) {
    await this.requireRole(userId, orgId, id, "OWNER");
    const group = await this.prisma.group.findFirst({
      where: { id, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    // Get group member IDs before transaction (group will be deleted)
    const memberIds = await this.permissions.getGroupMemberIds(id);

    // Clean up group permissions and secrets before deleting
    const groupPermissions = await this.prisma.permission.findMany({
      where: {
        aroType: "GROUP",
        aroId: id,
      },
      select: { acoId: true },
    });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      // Revoke group shares for each resource
      for (const perm of groupPermissions) {
        const resourceId = perm.acoId;

        // Delete group permission
        await tx.permission.deleteMany({
          where: {
            aroType: "GROUP",
            aroId: id,
            acoType: "RESOURCE",
            acoId: resourceId,
          },
        });

        // Delete secrets for group members (only those without direct user permissions)
        if (memberIds.length > 0) {
          // Get users with direct permissions to this resource
          const directUserPerms = await tx.permission.findMany({
            where: {
              aroType: "USER",
              aroId: { in: memberIds },
              acoType: "RESOURCE",
              acoId: resourceId,
            },
            select: { aroId: true },
          });
          const directUserIds = new Set(directUserPerms.map((p: any) => p.aroId));

          // Only delete secrets for users without direct permissions
          const usersWithoutDirectPerms = memberIds.filter((uid) => !directUserIds.has(uid));
          if (usersWithoutDirectPerms.length > 0) {
            await tx.secret.deleteMany({
              where: {
                resourceId,
                userId: { in: usersWithoutDirectPerms },
              },
            });
          }
        }
      }

      // Delete the group (members cascade automatically)
      await tx.group.delete({ where: { id } });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId: group.orgId,
      userId,
      action: "group.delete",
      entityType: "group",
      entityId: id,
      metadata: { name: group.name },
    });
  }


  async getRecipientKeys(userId: string, orgId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    // Verify caller is an org member
    const orgMembership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (!orgMembership) {
      throw new ForbiddenException("You are not a member of this organization");
    }

    // Return all group members with their public keys
    const groupUsers = await this.prisma.groupUser.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            gpgKey: { select: { publicKey: true } },
          },
        },
      },
    });

    return groupUsers.map((gu: any) => ({
      userId: gu.user.id,
      email: gu.user.email,
      firstName: gu.user.firstName,
      lastName: gu.user.lastName,
      publicKey: gu.user.gpgKey?.publicKey ?? null,
      isGroupMember: true,
    }));
  }

  async syncSecrets(
    userId: string,
    orgId: string,
    groupId: string,
    targetUserId: string,
    resourceShares: Record<string, string>
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.requireRole(userId, orgId, groupId, "USER");

    const [isTargetMember, targetAdminCount] = await Promise.all([
      this.prisma.groupUser.count({
        where: { groupId, userId: targetUserId },
      }),
      this.prisma.organizationMembership.count({
        where: {
          organizationId: orgId,
          userId: targetUserId,
          role: { in: ["OWNER", "ADMIN"] },
          status: "ACTIVE",
        },
      }),
    ]);
    if (isTargetMember === 0 && targetAdminCount === 0) {
      throw new BadRequestException("Target user is not a member or admin of this group");
    }

    const resourceIds = Object.keys(resourceShares);
    if (resourceIds.length === 0) {
      return { synced: 0 };
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const result = await this.prisma.$transaction(async (tx: any) => {
      let synced = 0;
      for (const resourceId of resourceIds) {
        const resource = await tx.resource.findFirst({
          where: { id: resourceId, orgId, folder: { groupId } },
        });
        if (!resource) {
          throw new BadRequestException(`Resource ${resourceId} does not belong to this group`);
        }

        const perm = await this.permissions.resolveForResource(userId, resourceId);
        if (!perm) {
          throw new ForbiddenException(`No access to resource ${resourceId}`);
        }

        const encryptedData = resourceShares[resourceId];
        await tx.secret.upsert({
          where: { resourceId_userId: { resourceId, userId: targetUserId } },
          update: { encryptedData },
          create: {
            resourceId,
            userId: targetUserId,
            encryptedData,
          },
        });
        synced += 1;
      }
      return synced;
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { synced: result };
  }

  async listMembers(userId: string, orgId: string, groupId: string) {
    await this.requireRole(userId, orgId, groupId, "USER");
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    return group.members.map((m: any) => ({
      userId: m.userId,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role,
    }));
  }

  async addMember(
    userId: string,
    orgId: string,
    groupId: string,
    email: string,
    role: GroupRole
  ) {
    await this.requireRole(userId, orgId, groupId, "ADMIN");
    const target = await this.prisma.user.findFirst({
      where: { email, orgId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException("User not found in organization");
    }
    const existing = await this.prisma.groupUser.findUnique({
      where: { groupId_userId: { groupId, userId: target.id } },
    });
    if (existing) {
      throw new ConflictException("User is already a group member");
    }
    await this.prisma.groupUser.create({
      data: { groupId, userId: target.id, role },
    });
    return { userId: target.id, email, role };
  }

  async removeMember(
    userId: string,
    orgId: string,
    groupId: string,
    targetUserId: string
  ) {
    await this.requireRole(userId, orgId, groupId, "ADMIN");
    const existing = await this.prisma.groupUser.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!existing) {
      throw new NotFoundException("Group member not found");
    }
    await this.prisma.groupUser.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
  }

  async syncMembers(userId: string, orgId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.requireRole(userId, orgId, groupId, "USER");

    const activeMembers = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { userId: true },
    });

    const existingMembers = await this.prisma.groupUser.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const existingIds = new Set(existingMembers.map((m) => m.userId));

    const toAdd = activeMembers.filter((m) => !existingIds.has(m.userId));

    if (toAdd.length > 0) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await this.prisma.groupUser.createMany({
        data: toAdd.map((m) => ({ groupId, userId: m.userId, role: "USER" as const })),
        skipDuplicates: true,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    // Return all members with public keys for key distribution
    const allMembers = await this.prisma.groupUser.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            gpgKey: { select: { publicKey: true } },
          },
        },
      },
    });

    return {
      added: toAdd.length,
      members: allMembers.map((m: any) => ({
        userId: m.userId,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        role: m.role,
        publicKey: m.user.gpgKey?.publicKey ?? null,
      })),
    };
  }

  private async requireRole(userId: string, orgId: string, groupId: string, minRole: GroupRole) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
      select: { orgId: true },
    });

    if (!group) {
      throw new NotFoundException("Group not found");
    }

    // Org OWNER/ADMIN bypass — they can manage all groups
    const orgMembership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    const isOrgAdmin = orgMembership &&
      (orgMembership.role === "OWNER" || orgMembership.role === "ADMIN") &&
      orgMembership.status === "ACTIVE";

    const membership = await this.prisma.groupUser.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership && !isOrgAdmin) {
      throw new ForbiddenException("You are not a member of this group");
    }

    // Org admins bypass role rank check
    if (isOrgAdmin && !membership) return;
    if (isOrgAdmin && rank(membership!.role as GroupRole) < rank(minRole)) return;

    if (!membership) {
      throw new ForbiddenException("You are not a member of this group");
    }
    if (rank(membership.role as GroupRole) < rank(minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role`);
    }
  }
}
