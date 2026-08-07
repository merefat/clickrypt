import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type PermissionLevel = "READ" | "UPDATE" | "OWNER";

const LEVEL_RANK: Record<PermissionLevel, number> = {
  READ: 1,
  UPDATE: 2,
  OWNER: 3,
};

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForResource(
    userId: string,
    resourceId: string
  ): Promise<PermissionLevel | null> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { ownerId: true, workspaceType: true, groupId: true, folder: { select: { groupId: true } } },
    });
    if (!resource) return null;

    // Owner always has OWNER
    if (resource.ownerId === userId) return "OWNER";

    // Private resources are only visible to the owner
    if (resource.workspaceType === "PRIVATE") {
      return null;
    }

    // Group resources are visible to any member of the group
    if (resource.workspaceType === "GROUP") {
      const groupId = resource.groupId || (resource as any).folder?.groupId;
      if (groupId) {
        const isMember = await this.prisma.groupUser.count({
          where: { groupId, userId },
        });
        if (isMember > 0) return "READ";
      }
    }

    // Check direct user permission for private resources
    const userPerm = await this.prisma.permission.findFirst({
      where: {
        aroType: "USER",
        aroId: userId,
        acoType: "RESOURCE",
        acoId: resourceId,
      },
    });

    // Check group permissions via group memberships for private resources
    const groupIds = await this.prisma.groupUser.findMany({
      where: { userId },
      select: { groupId: true },
    });

    let groupLevel: PermissionLevel | null = null;
    if (groupIds.length > 0) {
      const groupPerms = await this.prisma.permission.findMany({
        where: {
          aroType: "GROUP",
          aroId: { in: groupIds.map((g) => g.groupId) },
          acoType: "RESOURCE",
          acoId: resourceId,
        },
      });
      for (const gp of groupPerms) {
        const lvl = gp.level as PermissionLevel;
        if (!groupLevel || LEVEL_RANK[lvl] > LEVEL_RANK[groupLevel]) {
          groupLevel = lvl;
        }
      }
    }

    const userLevel = userPerm ? (userPerm.level as PermissionLevel) : null;
    if (!userLevel && !groupLevel) return null;
    if (!userLevel) return groupLevel;
    if (!groupLevel) return userLevel;
    return LEVEL_RANK[userLevel] >= LEVEL_RANK[groupLevel] ? userLevel : groupLevel;
  }

  async resolveForFolder(
    userId: string,
    folderId: string
  ): Promise<PermissionLevel | null> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, workspaceType: true, groupId: true, ownerId: true, createdBy: true },
    });
    if (!folder) return null;

    if (folder.workspaceType === "PRIVATE") {
      if (folder.ownerId === userId || folder.createdBy === userId) return "OWNER";
    }

    const isGroupMember = folder.groupId
      ? (await this.prisma.groupUser.count({
          where: { groupId: folder.groupId, userId },
        })) > 0
      : false;

    const userPerm = await this.prisma.permission.findFirst({
      where: {
        aroType: "USER",
        aroId: userId,
        acoType: "FOLDER",
        acoId: folderId,
      },
    });

    const groupIds = await this.prisma.groupUser.findMany({
      where: { userId },
      select: { groupId: true },
    });

    let groupLevel: PermissionLevel | null = null;
    if (folder.groupId && isGroupMember) {
      groupLevel = "READ";
    }

    if (groupIds.length > 0) {
      const groupPerms = await this.prisma.permission.findMany({
        where: {
          aroType: "GROUP",
          aroId: { in: groupIds.map((g) => g.groupId) },
          acoType: "FOLDER",
          acoId: folderId,
        },
      });
      for (const gp of groupPerms) {
        const lvl = gp.level as PermissionLevel;
        if (!groupLevel || LEVEL_RANK[lvl] > LEVEL_RANK[groupLevel]) {
          groupLevel = lvl;
        }
      }
    }

    const userLevel = userPerm ? (userPerm.level as PermissionLevel) : null;
    if (!userLevel && !groupLevel) return null;
    if (!userLevel) return groupLevel;
    if (!groupLevel) return userLevel;
    return LEVEL_RANK[userLevel] >= LEVEL_RANK[groupLevel] ? userLevel : groupLevel;
  }

  hasAtLeast(actual: PermissionLevel | null, required: PermissionLevel): boolean {
    if (!actual) return false;
    return LEVEL_RANK[actual] >= LEVEL_RANK[required];
  }

  async listForResource(resourceId: string) {
    const perms = await this.prisma.permission.findMany({
      where: { acoType: "RESOURCE", acoId: resourceId },
      orderBy: { createdAt: "asc" },
    });
    return perms.map((p) => ({
      id: p.id,
      aroType: p.aroType,
      aroId: p.aroId,
      level: p.level,
    }));
  }

  async create(
    aroType: "USER" | "GROUP",
    aroId: string,
    acoType: "RESOURCE" | "FOLDER",
    acoId: string,
    level: PermissionLevel
  ) {
    return this.prisma.permission.create({
      data: { aroType, aroId, acoType, acoId, level },
    });
  }

  async delete(aroId: string, acoType: "RESOURCE" | "FOLDER", acoId: string) {
    await this.prisma.permission.deleteMany({
      where: { aroType: "USER", aroId, acoType, acoId },
    });
  }

  async getGroupMemberIds(groupId: string): Promise<string[]> {
    const members = await this.prisma.groupUser.findMany({
      where: { groupId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  async getResourceUserIds(resourceId: string): Promise<string[]> {
    const perms = await this.prisma.permission.findMany({
      where: { acoType: "RESOURCE", acoId: resourceId },
    });

    const userIds = new Set<string>();
    const groupIds: string[] = [];

    for (const p of perms) {
      if (p.aroType === "USER") {
        userIds.add(p.aroId);
      } else if (p.aroType === "GROUP") {
        groupIds.push(p.aroId);
      }
    }

    if (groupIds.length > 0) {
      const members = await this.prisma.groupUser.findMany({
        where: { groupId: { in: groupIds } },
        select: { userId: true },
      });
      for (const m of members) userIds.add(m.userId);
    }

    return [...userIds];
  }
}
