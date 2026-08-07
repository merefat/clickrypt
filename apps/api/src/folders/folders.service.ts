import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SyncGateway } from "../sync/sync.gateway";
import { PermissionsService } from "../permissions/permissions.service";
import { CreateFolderDto, UpdateFolderDto, ReorderFolderDto, ShareFolderDto } from "./dto/folder.dto";

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncGateway,
    private readonly permissions: PermissionsService
  ) {}

  async create(userId: string, orgId: string, dto: CreateFolderDto, userRole?: string) {
    // Validate groupId if provided and check membership/org-role access
    if (dto.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: dto.groupId, orgId },
      });
      if (!group) {
        throw new NotFoundException("Group not found in this organization");
      }

      const isOrgAdmin = await this.prisma.organizationMembership.count({
        where: {
          organizationId: orgId,
          userId,
          role: { in: ["OWNER", "ADMIN"] },
          status: "ACTIVE",
        },
      }) > 0;

      if (!isOrgAdmin) {
        const membership = await this.prisma.groupUser.findUnique({
          where: { groupId_userId: { groupId: dto.groupId, userId } },
        });
        if (!membership) {
          throw new ForbiddenException("You are not a member of this group");
        }
      }
    }

    if (!dto.groupId && userRole !== "OWNER") {
      throw new ForbiddenException("Only the organization owner can create My Workspace folders");
    }

    const workspaceType = dto.groupId ? ("GROUP" as const) : ("PRIVATE" as const);

    // Validate parent folder if provided
    if (dto.parentFolderId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: dto.parentFolderId, orgId },
        select: { id: true, groupId: true, workspaceType: true },
      });
      if (!parent) {
        throw new NotFoundException("Parent folder not found");
      }

      if (parent.workspaceType !== workspaceType) {
        throw new BadRequestException("Parent folder must be in the same workspace");
      }

      // If creating a group-scoped folder, parent must be in the same group
      if (dto.groupId && parent.groupId !== dto.groupId) {
        throw new BadRequestException("Parent folder must be in the same group");
      }

      // If parent is group-scoped, child must also be group-scoped in the same group
      if (parent.groupId && !dto.groupId) {
        throw new BadRequestException("Cannot create org-scoped folder inside group-scoped folder");
      }
    }

    // Determine sortOrder: append after last sibling
    const siblingCount = await this.prisma.folder.count({
      where: {
        orgId,
        groupId: dto.groupId ?? null,
        parentFolderId: dto.parentFolderId ?? null,
        workspaceType,
        ...(workspaceType === "PRIVATE" ? { ownerId: userId } : {}),
      },
    });

    try {
      const folder = await this.prisma.folder.create({
        data: {
          orgId,
          name: dto.name,
          parentFolderId: dto.parentFolderId ?? null,
          groupId: dto.groupId ?? null,
          createdBy: userId,
          ownerId: workspaceType === "PRIVATE" ? userId : null,
          workspaceType,
          sortOrder: siblingCount,
        },
      });
      const recipientIds = folder.groupId
        ? [...new Set([...(await this.permissions.getGroupMemberIds(folder.groupId)), userId])]
        : [userId];
      this.sync.emitToUsers(recipientIds, { type: "folder:create", entityType: "folder", entityId: folder.id, data: { id: folder.id, name: folder.name, parentFolderId: folder.parentFolderId, groupId: folder.groupId, ownerId: folder.ownerId, createdAt: folder.createdAt } });
      return folder;
    } catch (err: unknown) {
      // Check for Prisma unique constraint violation (P2002)
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        throw new ConflictException("Folder name already exists in this context");
      }
      throw err;
    }
  }

  async list(orgId: string, userId: string, groupId?: string) {
    const where: Record<string, unknown> = { orgId };
    if (groupId) {
      where.groupId = groupId;
      where.workspaceType = "GROUP";
    } else {
      where.groupId = null;
      where.workspaceType = "PRIVATE";
      // Non-group folders are always private to their owner, regardless of role
      where.ownerId = userId;
    }

    const folders = await this.prisma.folder.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return await Promise.all(folders.map(async (f) => ({
      id: f.id,
      name: f.name,
      parentFolderId: f.parentFolderId,
      groupId: f.groupId,
      sortOrder: f.sortOrder,
      createdAt: f.createdAt,
      myPermission: await this.permissions.resolveForFolder(userId, f.id),
    })));
  }

  async listByGroup(orgId: string, userId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    return this.list(orgId, userId, groupId);
  }

  async update(userId: string, orgId: string, id: string, dto: UpdateFolderDto, userRole?: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, orgId },
    });
    if (!folder) {
      throw new NotFoundException("Folder not found");
    }

    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "UPDATE")) {
      throw new ForbiddenException("You don't have permission to update this folder");
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;

    if (dto.parentFolderId !== undefined) {
      const targetId = dto.parentFolderId;
      if (targetId === null) {
        data.parentFolderId = null;
      } else {
        if (targetId === id) {
          throw new BadRequestException("A folder cannot be its own parent");
        }
        const target = await this.prisma.folder.findFirst({
          where: { id: targetId, orgId },
          select: { id: true, groupId: true, parentFolderId: true },
        });
        if (!target) {
          throw new NotFoundException("Target parent folder not found");
        }
        if (target.groupId !== folder.groupId) {
          throw new BadRequestException("Cannot move folder to a different group");
        }
        if (await this.isDescendant(id, targetId)) {
          throw new BadRequestException("Cannot move folder into its own subtree");
        }
        data.parentFolderId = targetId;
      }
    }

    const updated = await this.prisma.folder.update({
      where: { id },
      data,
    });
    const updateRecipientIds = updated.groupId
      ? [...new Set([...(await this.permissions.getGroupMemberIds(updated.groupId)), userId])]
      : [userId];
    this.sync.emitToUsers(updateRecipientIds, { type: "folder:update", entityType: "folder", entityId: id, data: { id: updated.id, name: updated.name, parentFolderId: updated.parentFolderId, groupId: updated.groupId, ownerId: updated.ownerId, createdAt: updated.createdAt } });
    return updated;
  }

  private async isDescendant(ancestorId: string, candidateId: string): Promise<boolean> {
    let current = candidateId;
    while (current) {
      if (current === ancestorId) return true;
      const parent = await this.prisma.folder.findUnique({
        where: { id: current },
        select: { parentFolderId: true },
      });
      if (!parent || !parent.parentFolderId) break;
      current = parent.parentFolderId;
    }
    return false;
  }

  async reorder(userId: string, orgId: string, id: string, dto: ReorderFolderDto, userRole?: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, orgId },
    });
    if (!folder) {
      throw new NotFoundException("Folder not found");
    }

    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "UPDATE")) {
      throw new ForbiddenException("You don't have permission to move this folder");
    }

    const newParentId = dto.parentFolderId ?? null;

    // Validate new parent if not root
    if (newParentId) {
      const parentPerm = await this.permissions.resolveForFolder(userId, newParentId);
      if (!parentPerm || !this.permissions.hasAtLeast(parentPerm, "UPDATE")) {
        throw new ForbiddenException("You don't have permission to move items into this folder");
      }
      if (newParentId === id) {
        throw new BadRequestException("A folder cannot be its own parent");
      }
      const target = await this.prisma.folder.findFirst({
        where: { id: newParentId, orgId },
        select: { id: true, groupId: true },
      });
      if (!target) {
        throw new NotFoundException("Target parent folder not found");
      }
      if (target.groupId !== folder.groupId) {
        throw new BadRequestException("Cannot move folder to a different group");
      }
      if (await this.isDescendant(id, newParentId)) {
        throw new BadRequestException("Cannot move folder into its own subtree");
      }
    }

    // Get siblings at the new parent level (excluding the folder being moved)
    const siblings = await this.prisma.folder.findMany({
      where: {
        orgId,
        groupId: folder.groupId,
        parentFolderId: newParentId,
        id: { not: id },
        workspaceType: folder.workspaceType,
        ...(folder.workspaceType === "PRIVATE" ? { ownerId: userId } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Clamp sortOrder to valid range
    const clampedOrder = Math.max(0, Math.min(dto.sortOrder, siblings.length));

    // Update the moved folder
    await this.prisma.folder.update({
      where: { id },
      data: { parentFolderId: newParentId, sortOrder: clampedOrder },
    });

    // Reindex siblings to make room for the moved folder
    let insertIndex = 0;
    for (const sibling of siblings) {
      if (insertIndex === clampedOrder) insertIndex++;
      await this.prisma.folder.update({
        where: { id: sibling.id },
        data: { sortOrder: insertIndex },
      });
      insertIndex++;
    }

    const updated = await this.prisma.folder.findFirst({ where: { id } });
    const recipientIds = updated!.groupId
      ? [...new Set([...(await this.permissions.getGroupMemberIds(updated!.groupId!)), userId])]
      : [userId];
    this.sync.emitToUsers(recipientIds, { type: "folder:update", entityType: "folder", entityId: id, data: { id: updated!.id, name: updated!.name, parentFolderId: updated!.parentFolderId, groupId: updated!.groupId, ownerId: updated!.ownerId, sortOrder: updated!.sortOrder, createdAt: updated!.createdAt } });
    return updated;
  }

  async delete(userId: string, orgId: string, id: string, userRole?: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, orgId },
    });
    if (!folder) {
      throw new NotFoundException("Folder not found");
    }

    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("You don't have permission to delete this folder");
    }

    const deleteRecipientIds = folder.groupId
      ? [...new Set([...(await this.permissions.getGroupMemberIds(folder.groupId)), userId])]
      : [userId];
    await this.prisma.folder.delete({ where: { id } });
    this.sync.emitToUsers(deleteRecipientIds, { type: "folder:delete", entityType: "folder", entityId: id });
  }

  async share(userId: string, orgId: string, id: string, dto: ShareFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, orgId } });
    if (!folder) throw new NotFoundException("Folder not found");
    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can share this folder");
    }

    const recipients = (dto.recipients ?? []).filter((r) => r.permission === "OWNER" || r.permission === "UPDATE" || r.permission === "READ");
    const groupRecipients = (dto.groupRecipients ?? []).filter((g) => g.permission === "UPDATE" || g.permission === "READ");

    for (const r of recipients) {
      await this.prisma.permission.upsert({
        where: { aroType_aroId_acoType_acoId: { aroType: "USER", aroId: r.userId, acoType: "FOLDER", acoId: id } },
        update: { level: r.permission as any },
        create: { aroType: "USER", aroId: r.userId, acoType: "FOLDER", acoId: id, level: r.permission as any },
      });
    }

    for (const g of groupRecipients) {
      await this.prisma.permission.upsert({
        where: { aroType_aroId_acoType_acoId: { aroType: "GROUP", aroId: g.groupId, acoType: "FOLDER", acoId: id } },
        update: { level: g.permission as any },
        create: { aroType: "GROUP", aroId: g.groupId, acoType: "FOLDER", acoId: id, level: g.permission as any },
      });
    }
  }

  async listPermissions(userId: string, orgId: string, id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, orgId } });
    if (!folder) throw new NotFoundException("Folder not found");
    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm) throw new NotFoundException("Folder not found");

    const perms = await this.prisma.permission.findMany({ where: { acoType: "FOLDER", acoId: id } });
    const userIds = perms.filter((p) => p.aroType === "USER").map((p) => p.aroId);
    const groupIds = perms.filter((p) => p.aroType === "GROUP").map((p) => p.aroId);

    const [users, groups] = await Promise.all([
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, firstName: true, lastName: true },
          })
        : Promise.resolve([] as any[]),
      groupIds.length > 0
        ? this.prisma.group.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

    return perms.map((p) => ({
      id: p.id,
      aroType: p.aroType,
      aroId: p.aroId,
      acoType: p.acoType,
      acoId: p.acoId,
      level: p.level,
      email: p.aroType === "USER" ? (userMap[p.aroId]?.email ?? null) : null,
      firstName: p.aroType === "USER" ? (userMap[p.aroId]?.firstName ?? null) : null,
      lastName: p.aroType === "USER" ? (userMap[p.aroId]?.lastName ?? null) : null,
      groupName: p.aroType === "GROUP" ? (groupMap[p.aroId]?.name ?? null) : null,
    }));
  }

  async revokeShare(userId: string, orgId: string, id: string, targetUserId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, orgId } });
    if (!folder) throw new NotFoundException("Folder not found");
    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can revoke sharing");
    }
    await this.prisma.permission.deleteMany({
      where: { aroType: "USER", aroId: targetUserId, acoType: "FOLDER", acoId: id },
    });
  }

  async revokeGroupShare(userId: string, orgId: string, id: string, groupId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, orgId } });
    if (!folder) throw new NotFoundException("Folder not found");
    const perm = await this.permissions.resolveForFolder(userId, id);
    if (!perm || !this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can revoke sharing");
    }
    await this.prisma.permission.deleteMany({
      where: { aroType: "GROUP", aroId: groupId, acoType: "FOLDER", acoId: id },
    });
  }
}
