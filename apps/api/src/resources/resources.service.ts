import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  PermissionsService,
  type PermissionLevel,
} from "../permissions/permissions.service";
import { AuditService } from "../audit/audit.service";
import { SyncGateway } from "../sync/sync.gateway";
import { DeploymentPolicyService } from "../installations/deployment-policy.service";
import { EmailService } from "../email-queue/email.service";
import { CreateResourceDto } from "./dto/create-resource.dto";
import {
  GroupShareRecipientDto,
  ShareRecipientDto,
} from "./dto/share-resource.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly sync: SyncGateway,
    private readonly deploymentPolicy: DeploymentPolicyService,
    private readonly emailService: EmailService,
  ) {}

  async create(
    userId: string,
    orgId: string,
    dto: CreateResourceDto
  ) {
    console.log("[ResourcesService.create] userId=%s orgId=%s dto=%o", userId, orgId, dto);
    if (!userId || !orgId) {
      throw new BadRequestException("Missing authenticated user context");
    }
    if (!dto.encryptedData || typeof dto.encryptedData !== "string") {
      throw new BadRequestException("A valid encrypted secret is required");
    }
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { name: dto.resourceType || "password" },
    });
    if (!resourceType) {
      throw new NotFoundException(`Resource type '${dto.resourceType || "password"}' not found`);
    }

    // Validate group access before picking a sharing mode
    if (dto.groupId) {
      const [groupMembership, folder] = await Promise.all([
        this.prisma.groupUser.findUnique({
          where: { groupId_userId: { groupId: dto.groupId, userId } },
        }),
        dto.folderId
          ? this.prisma.folder.findUnique({
              where: { id: dto.folderId },
              select: { groupId: true },
            })
          : Promise.resolve(null),
      ]);
      const isOrgAdmin = await this.prisma.organizationMembership.count({
        where: {
          organizationId: orgId,
          userId,
          role: { in: ["OWNER", "ADMIN"] },
          status: "ACTIVE",
        },
      }) > 0;
      if (!groupMembership && !isOrgAdmin) {
        throw new ForbiddenException("You are not a member of this group");
      }
      if (dto.folderId && folder?.groupId !== dto.groupId) {
        throw new BadRequestException("Folder must belong to the selected group");
      }
    }

    // Determine sharing mode based on creator's role
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    const creatorRole = membership?.role ?? "USER";
    // In ORGANIZATION mode, default to RESTRICTED (explicit sharing required)
    // Only OWNER can set AUTO if needed
    const mode = await this.deploymentPolicy.getOrgMode(orgId);
    const sharingMode = mode === "ORGANIZATION"
      ? (creatorRole === "OWNER" && dto.sharingMode === "AUTO" ? "AUTO" as const : "RESTRICTED" as const)
      : (creatorRole === "OWNER" && dto.sharingMode === "RESTRICTED" ? "RESTRICTED" as const : "AUTO" as const);

    const parentFolder = dto.folderId
      ? await this.prisma.folder.findUnique({ where: { id: dto.folderId }, select: { orgId: true, groupId: true, ownerId: true, workspaceType: true } })
      : null;
    if (dto.folderId && (!parentFolder || parentFolder.orgId !== orgId)) {
      throw new BadRequestException("Folder does not exist or does not belong to this organization");
    }
    if (dto.folderId) {
      if (parentFolder!.groupId) {
        if (parentFolder!.workspaceType !== "GROUP") {
          throw new BadRequestException("Folder must be a group folder");
        }
      } else {
        if (parentFolder!.workspaceType !== "PRIVATE" || parentFolder!.ownerId !== userId) {
          throw new BadRequestException("Private folder does not belong to you");
        }
      }
    }
    const folderGroupId = parentFolder?.groupId ?? null;
    const targetGroupId = dto.groupId ?? folderGroupId ?? null;
    const workspaceType = targetGroupId ? ("GROUP" as const) : ("PRIVATE" as const);
    const groupMembers =
      workspaceType === "GROUP"
        ? await this.prisma.groupUser.findMany({
            where: { groupId: targetGroupId! },
            select: { userId: true },
          })
        : [];
    const groupMemberIds = new Set(groupMembers.map((m: any) => m.userId));

    if (dto.additionalSecrets && workspaceType === "GROUP") {
      const recipientIds = Object.keys(dto.additionalSecrets).filter((id) => id !== userId);
      if (recipientIds.length > 0) {
        const validCount = await this.prisma.user.count({
          where: { id: { in: recipientIds }, orgId },
        });
        if (validCount !== recipientIds.length) {
          throw new BadRequestException(
            "One or more additional secret recipients are not members of this organization"
          );
        }
      }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resource = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.resource.create({
        data: {
          orgId,
          folderId: dto.folderId ?? null,
          groupId: dto.groupId ?? null,
          resourceTypeId: resourceType.id,
          workspaceType,
          name: dto.name,
          uri: dto.uri ?? null,
          metadataJson: dto.metadata ?? {},
          sharingMode,
          ownerId: userId,
          createdBy: userId,
          modifiedBy: userId,
        },
      });

      // Group resources use per-user OpenPGP ciphertexts
      // Only create Secret rows for the creator + members that have encrypted data.
      // Members without keys are skipped — they can be synced later via syncSecrets.
      if (workspaceType === "GROUP") {
        // Creator always gets a Secret row
        await tx.secret.create({
          data: {
            resourceId: created.id,
            userId,
            encryptedData: dto.encryptedData!,
          },
        });
        // Create Secret rows for group members that have entries in additionalSecrets
        for (const [memberUserId, encData] of Object.entries(dto.additionalSecrets ?? {})) {
          if (memberUserId === userId || !groupMemberIds.has(memberUserId)) continue;
          await tx.secret.create({
            data: {
              resourceId: created.id,
              userId: memberUserId,
              encryptedData: encData,
            },
          });
        }
        await tx.permission.create({
          data: {
            aroType: "USER",
            aroId: userId,
            acoType: "RESOURCE",
            acoId: created.id,
            level: "OWNER",
          },
        });
        // Group resources are open to every member of the group
        await tx.permission.create({
          data: {
            aroType: "GROUP",
            aroId: targetGroupId,
            acoType: "RESOURCE",
            acoId: created.id,
            level: "READ",
          },
        });
      } else {
        await tx.secret.create({
          data: {
            resourceId: created.id,
            userId,
            encryptedData: dto.encryptedData!,
          },
        });
        await tx.permission.create({
          data: {
            aroType: "USER",
            aroId: userId,
            acoType: "RESOURCE",
            acoId: created.id,
            level: "OWNER",
          },
        });

        // Private resources are only visible to the owner unless explicitly shared later.
      }

      return created;
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId: resource.orgId,
      userId,
      action: "resource.create",
      entityType: "resource",
      entityId: resource.id,
      metadata: resource.workspaceType === "PRIVATE" ? {} : { name: dto.name },
    });

    let groupName: string | null = null;
    if (targetGroupId) {
      const grp = await this.prisma.group.findUnique({
        where: { id: targetGroupId },
        select: { name: true },
      });
      groupName = grp?.name ?? null;
    }
    const dtoResult = this.toResourceDto(resource, targetGroupId, groupName);
    const recipientIds = targetGroupId
      ? [...new Set([...(await this.permissions.getGroupMemberIds(targetGroupId as string)), userId])]
      : [userId];
    this.sync.emitToUsers(recipientIds, {
      type: "resource:create",
      entityType: "resource",
      entityId: resource.id,
      data: { ...dtoResult },
    });

    return dtoResult;
  }

  async listForUser(userId: string, orgId: string, filters?: { q?: string; folderId?: string; tagId?: string; favorite?: boolean }) {
    const andConditions: any[] = [
      { orgId },
      { workspaceType: "PRIVATE" },
      { ownerId: userId },
      { secrets: { some: { userId } } },
    ];

    if (filters?.favorite) {
      andConditions.push({ favorites: { some: { userId } } });
    }

    if (filters?.q) {
      andConditions.push({
        OR: [
          { name: { contains: filters.q, mode: "insensitive" } },
          { uri: { contains: filters.q, mode: "insensitive" } },
        ],
      });
    }

    if (filters?.folderId) {
      andConditions.push({ folderId: filters.folderId });
    }

    if (filters?.tagId) {
      andConditions.push({ tags: { some: { tagId: filters.tagId } } });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [resources, userGroupIds] = await Promise.all([
      this.prisma.resource.findMany({
        where: { AND: andConditions },
        include: {
          tags: { include: { tag: true } },
          folder: { select: { id: true, name: true, parentFolderId: true, groupId: true } },
          group: { select: { id: true, name: true } },
          favorites: { where: { userId }, select: { resourceId: true } },
          resourceType: { select: { name: true } },
          creator: { select: { id: true, email: true, firstName: true, lastName: true } },
          modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: "desc" },
      } as any) as Promise<any[]>,
      this.prisma.groupUser.findMany({
        where: { userId },
        select: { groupId: true },
      } as any).then((rows: any[]) => rows.map((g: any) => g.groupId)),
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const groupIds = new Set<string>();
    for (const r of resources) {
      if (r.groupId) groupIds.add(r.groupId);
      if (r.folder?.groupId) groupIds.add(r.folder.groupId);
    }

    const [allFolders, groups] = await Promise.all([
      this.prisma.folder.findMany({
        where: {
          orgId,
          OR: [
            { workspaceType: "GROUP", groupId: { in: userGroupIds } },
            { workspaceType: "PRIVATE", groupId: null, ownerId: userId },
          ],
        },
        select: { id: true, name: true, parentFolderId: true, groupId: true },
      } as any) as Promise<any[]>,
      groupIds.size > 0
        ? (this.prisma.group.findMany({
            where: { id: { in: [...groupIds] }, orgId },
            select: { id: true, name: true },
          } as any) as Promise<any[]>)
        : Promise.resolve([] as any[]),
    ]);

    const folderMap: Record<string, any> = Object.fromEntries(allFolders.map((f: any) => [f.id, f]));
    const groupMap: Record<string, any> = Object.fromEntries(groups.map((g: any) => [g.id, g]));

    const buildPath = (folderId: string | null): string | null => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let current = folderId ? folderMap[folderId] : null;
      while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        parts.unshift(current.name);
        current = current.parentFolderId ? folderMap[current.parentFolderId] : null;
      }
      return parts.length ? parts.join(" / ") : null;
    };

    return resources.map((r: any) => {
      const groupId = r.groupId || r.folder?.groupId || null;
      const group = groupId ? groupMap[groupId] : null;
      const folder = r.folder ? { id: r.folder.id, name: r.folder.name } : null;
      const folderPath = buildPath(r.folderId);
      const source = group ? "group" : "workplace";
      const location =
        source === "group"
          ? `${group?.name ?? "Group"}${folderPath ? " / " + folderPath : ""}`
          : (folderPath ?? null);

      return {
        id: r.id,
        name: r.name,
        uri: r.uri,
        folder,
        tags: r.tags.map((rt: any) => ({
          id: rt.tag.id,
          name: rt.tag.name,
          color: rt.tag.color,
        })),
        metadata: r.metadataJson,
        resourceType: r.resourceType.name,
        sharingMode: r.sharingMode,
        isFavorite: r.favorites.length > 0,
        createdBy: r.creator ? { email: r.creator.email, name: `${r.creator.firstName} ${r.creator.lastName}` } : null,
        modifiedBy: r.modifier ? { email: r.modifier.email, name: `${r.modifier.firstName} ${r.modifier.lastName}` } : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        source,
        groupId,
        groupName: group?.name ?? null,
        folderPath: location,
      };
    });
  }

  async listAll(
    userId: string,
    orgId: string,
    filters?: { q?: string; folderId?: string; tagId?: string; favorite?: boolean }
  ) {
    const andConditions: any[] = [
      { orgId },
      {
        OR: [
          { workspaceType: "PRIVATE", ownerId: userId, secrets: { some: { userId } } },
          { workspaceType: "GROUP", group: { members: { some: { userId } } } },
          { workspaceType: "GROUP", folder: { group: { members: { some: { userId } } } } },
        ],
      },
    ];

    if (filters?.favorite) {
      andConditions.push({ favorites: { some: { userId } } });
    }

    if (filters?.q) {
      andConditions.push({
        OR: [
          { name: { contains: filters.q, mode: "insensitive" } },
          { uri: { contains: filters.q, mode: "insensitive" } },
        ],
      });
    }

    if (filters?.folderId) {
      andConditions.push({ folderId: filters.folderId });
    }

    if (filters?.tagId) {
      andConditions.push({ tags: { some: { tagId: filters.tagId } } });
    }

    const [resources, userGroupIds] = await Promise.all([
      this.prisma.resource.findMany({
        where: { AND: andConditions },
        include: {
          tags: { include: { tag: true } },
          folder: { select: { id: true, name: true, parentFolderId: true, groupId: true } },
          group: { select: { id: true, name: true } },
          favorites: { where: { userId }, select: { resourceId: true } },
          resourceType: { select: { name: true } },
          creator: { select: { id: true, email: true, firstName: true, lastName: true } },
          modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: "desc" },
      } as any) as Promise<any[]>,
      this.prisma.groupUser.findMany({
        where: { userId },
        select: { groupId: true },
      } as any).then((rows: any[]) => rows.map((g: any) => g.groupId)),
    ]);

    const groupIds = new Set<string>();
    for (const r of resources) {
      if (r.groupId) groupIds.add(r.groupId);
      if (r.folder?.groupId) groupIds.add(r.folder.groupId);
    }

    const [allFolders, groups] = await Promise.all([
      this.prisma.folder.findMany({
        where: {
          orgId,
          OR: [
            { workspaceType: "GROUP", groupId: { in: userGroupIds } },
            { workspaceType: "PRIVATE", groupId: null, ownerId: userId },
          ],
        },
        select: { id: true, name: true, parentFolderId: true, groupId: true },
      } as any) as Promise<any[]>,
      groupIds.size > 0
        ? (this.prisma.group.findMany({
            where: { id: { in: [...groupIds] }, orgId },
            select: { id: true, name: true },
          } as any) as Promise<any[]>)
        : Promise.resolve([] as any[]),
    ]);

    const folderMap: Record<string, any> = Object.fromEntries(allFolders.map((f: any) => [f.id, f]));
    const groupMap: Record<string, any> = Object.fromEntries(groups.map((g: any) => [g.id, g]));

    const buildPath = (folderId: string | null): string | null => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let current = folderId ? folderMap[folderId] : null;
      while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        parts.unshift(current.name);
        current = current.parentFolderId ? folderMap[current.parentFolderId] : null;
      }
      return parts.length ? parts.join(" / ") : null;
    };

    return await Promise.all(resources.map(async (r: any) => {
      const groupId = r.groupId || r.folder?.groupId || null;
      const group = groupId ? groupMap[groupId] : null;
      const folder = r.folder ? { id: r.folder.id, name: r.folder.name } : null;
      const folderPath = buildPath(r.folderId);
      const source = group ? "group" : "workplace";
      const location =
        source === "group"
          ? `${group?.name ?? "Group"}${folderPath ? " / " + folderPath : ""}`
          : (folderPath ?? null);
      const myPermission = await this.permissions.resolveForResource(userId, r.id);

      return {
        id: r.id,
        name: r.name,
        uri: r.uri,
        folder,
        tags: r.tags.map((rt: any) => ({
          id: rt.tag.id,
          name: rt.tag.name,
          color: rt.tag.color,
        })),
        metadata: r.metadataJson,
        resourceType: r.resourceType.name,
        sharingMode: r.sharingMode,
        isFavorite: r.favorites.length > 0,
        createdBy: r.creator ? { email: r.creator.email, name: `${r.creator.firstName} ${r.creator.lastName}` } : null,
        modifiedBy: r.modifier ? { email: r.modifier.email, name: `${r.modifier.firstName} ${r.modifier.lastName}` } : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        source,
        groupId,
        groupName: group?.name ?? null,
        folderPath: location,
        myPermission,
      };
    }));
  }

  async listForGroup(
    userId: string,
    orgId: string,
    groupId: string,
    filters?: { folderId?: string | null; q?: string; tagId?: string }
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    // Auto-sync: ensure all active org members are in this group (best-effort, no role check)
    const activeMembers = await this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { userId: true },
    });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.groupUser.createMany({
      data: activeMembers.map((m) => ({ groupId, userId: m.userId, role: "USER" as const })),
      skipDuplicates: true,
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Find all resource IDs belonging to this group (direct or via folder)
    const directResources = await this.prisma.resource.findMany({
      where: { orgId, workspaceType: "GROUP", groupId },
      select: { id: true },
    });
    const groupFolders = await this.prisma.folder.findMany({
      where: { orgId, groupId, workspaceType: "GROUP" },
      select: { id: true },
    });
    const folderResources = groupFolders.length > 0
      ? await this.prisma.resource.findMany({
          where: { orgId, workspaceType: "GROUP", folderId: { in: groupFolders.map((f) => f.id) } },
          select: { id: true },
        })
      : [];
    const allGroupResourceIds = new Set([
      ...directResources.map((r) => r.id),
      ...folderResources.map((r) => r.id),
    ]);

    if (allGroupResourceIds.size === 0) return [];

    // Group members can see every resource in their group; decryption is gated by getSecret
    const andConditions: any[] = [
      { orgId },
      { id: { in: [...allGroupResourceIds] } },
      { workspaceType: "GROUP" },
    ];

    if (filters?.folderId !== undefined) {
      andConditions.push({ folderId: filters.folderId });
    }

    if (filters?.q) {
      andConditions.push({
        OR: [
          { name: { contains: filters.q, mode: "insensitive" } },
          { uri: { contains: filters.q, mode: "insensitive" } },
        ],
      });
    }

    if (filters?.tagId) {
      andConditions.push({ tags: { some: { tagId: filters.tagId } } });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resources: any[] = await this.prisma.resource.findMany({
      where: { AND: andConditions },
      include: {
        tags: { include: { tag: true } },
        folder: { select: { id: true, name: true, parentFolderId: true } },
        favorites: { where: { userId }, select: { resourceId: true } },
        resourceType: { select: { name: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const allFolders = (await this.prisma.folder.findMany({
      where: { orgId, groupId, workspaceType: "GROUP" },
      select: { id: true, name: true, parentFolderId: true, groupId: true },
    } as any)) as any[];

    const folderMap: Record<string, any> = Object.fromEntries(allFolders.map((f: any) => [f.id, f]));

    const buildPath = (folderId: string | null): string | null => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let current = folderId ? folderMap[folderId] : null;
      while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        parts.unshift(current.name);
        current = current.parentFolderId ? folderMap[current.parentFolderId] : null;
      }
      return parts.length ? parts.join(" / ") : null;
    };

    return await Promise.all(resources.map(async (r: any) => {
      const folder = r.folder ? { id: r.folder.id, name: r.folder.name } : null;
      const folderPath = buildPath(r.folderId);
      const location = `${group.name}${folderPath ? " / " + folderPath : ""}`;
      const myPermission = await this.permissions.resolveForResource(userId, r.id);

      return {
        id: r.id,
        name: r.name,
        uri: r.uri,
        folder,
        tags: r.tags.map((rt: any) => ({
          id: rt.tag.id,
          name: rt.tag.name,
          color: rt.tag.color,
        })),
        metadata: r.metadataJson,
        resourceType: r.resourceType.name,
        sharingMode: r.sharingMode,
        isFavorite: r.favorites.length > 0,
        createdBy: r.creator ? { email: r.creator.email, name: `${r.creator.firstName} ${r.creator.lastName}` } : null,
        modifiedBy: r.modifier ? { email: r.modifier.email, name: `${r.modifier.firstName} ${r.modifier.lastName}` } : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        source: "group",
        groupId,
        groupName: group.name,
        folderPath: location,
        myPermission,
      };
    }));
  }

  async getOne(userId: string, resourceId: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resource: any = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        tags: { include: { tag: true } },
        folder: { select: { id: true, name: true, groupId: true } },
        group: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    // Gate access on resolved permissions (group members can view metadata)
    const perm = await this.permissions.resolveForResource(userId, resource.id);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }

    return {
      id: resource.id,
      name: resource.name,
      uri: resource.uri,
      folder: resource.folder
        ? { id: resource.folder.id, name: resource.folder.name }
        : null,
      tags: resource.tags.map((rt: any) => ({
        id: rt.tag.id,
        name: rt.tag.name,
        color: rt.tag.color,
      })),
      metadata: resource.metadataJson,
      sharingMode: resource.sharingMode,
      myPermission: perm,
      createdBy: resource.creator ? { email: resource.creator.email, name: `${resource.creator.firstName} ${resource.creator.lastName}` } : null,
      modifiedBy: resource.modifier ? { email: resource.modifier.email, name: `${resource.modifier.firstName} ${resource.modifier.lastName}` } : null,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  async getSecret(userId: string, resourceId: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { ownerId: true, workspaceType: true },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("No secret found for this user");
    }

    const secret = await this.prisma.secret.findUnique({
      where: { resourceId_userId: { resourceId, userId } },
    });
    if (!secret) {
      throw new NotFoundException("No secret found for this user");
    }

    return { encryptedData: secret.encryptedData };
  }

  async update(
    userId: string,
    resourceId: string,
    dto: UpdateResourceDto
  ) {
    const existing = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { orgId: true, groupId: true, workspaceType: true, ownerId: true, folder: { select: { groupId: true } } },
    } as any);
    if (!existing) {
      throw new NotFoundException("Resource not found");
    }

    const targetGroupId = (existing as any).groupId ?? (existing as any).folder?.groupId ?? null;

    // Permission check: owner or UPDATE permission for private resources
    if (existing.ownerId !== userId) {
      const perm = await this.permissions.resolveForResource(userId, resourceId);
      if (!perm) {
        throw new NotFoundException("Resource not found");
      }
      if (!this.permissions.hasAtLeast(perm, "UPDATE")) {
        throw new ForbiddenException("You need UPDATE permission");
      }
    }

    if (dto.folderId !== undefined && existing?.groupId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: dto.folderId },
        select: { groupId: true },
      });
      if (folder?.groupId !== existing.groupId) {
        throw new BadRequestException("Folder must belong to the same group");
      }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.resource.update({
        where: { id: resourceId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.uri !== undefined && { uri: dto.uri }),
          ...(dto.folderId !== undefined && { folderId: dto.folderId }),
          ...(dto.metadata !== undefined && {
            metadataJson: dto.metadata,
          }),
          ...(dto.sharingMode !== undefined && { sharingMode: dto.sharingMode }),
          modifiedBy: userId,
        },
      });

      // Update caller's own secret
      if (dto.encryptedData) {
        await tx.secret.upsert({
          where: { resourceId_userId: { resourceId, userId } },
          update: { encryptedData: dto.encryptedData },
          create: {
            resourceId,
            userId,
            encryptedData: dto.encryptedData,
          },
        });
      }

      // Update per-user secrets for all additional recipients (group resources only)
      if (dto.additionalSecrets && existing.workspaceType !== "PRIVATE") {
        for (const [memberUserId, encData] of Object.entries(dto.additionalSecrets)) {
          if (memberUserId === userId && dto.encryptedData) continue;
          await tx.secret.upsert({
            where: { resourceId_userId: { resourceId, userId: memberUserId } },
            update: { encryptedData: encData },
            create: {
              resourceId,
              userId: memberUserId,
              encryptedData: encData,
            },
          });
        }
      }
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await this.audit.log({
      orgId: existing?.orgId ?? "",
      userId,
      action: "resource.update",
      entityType: "resource",
      entityId: resourceId,
      metadata: existing.workspaceType === "PRIVATE" ? {} : { name: dto.name },
    });

    const updated = await this.getOne(userId, resourceId);
    const recipientIds = await this.permissions.getResourceUserIds(resourceId);
    this.sync.emitToUsers(recipientIds, {
      type: "resource:update",
      entityType: "resource",
      entityId: resourceId,
      data: targetGroupId ? { ...updated, groupId: targetGroupId } : updated,
    });

    return updated;
  }

  async delete(userId: string, resourceId: string, orgRole?: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, orgId: true, createdBy: true, ownerId: true, groupId: true, workspaceType: true, folder: { select: { groupId: true } } },
    } as any);
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    const targetGroupId = resource.groupId ?? (resource as any).folder?.groupId ?? null;
    const recipientIds = await this.permissions.getResourceUserIds(resourceId);

    // Allow deletion if user is org OWNER/ADMIN, is the owner/creator, or has OWNER permission
    const isOrgOwnerOrAdmin = orgRole === "OWNER" || orgRole === "ADMIN";
    const isOwner = resource.ownerId === userId;
    const isCreator = resource.createdBy === userId;
    const perm = await this.permissions.resolveForResource(userId, resourceId);

    if (!perm && !isOrgOwnerOrAdmin && !isOwner && !isCreator) {
      throw new NotFoundException("Resource not found");
    }

    const hasOwnerPermission = perm && this.permissions.hasAtLeast(perm, "OWNER");

    if (!isOrgOwnerOrAdmin && !isOwner && !isCreator && !hasOwnerPermission) {
      throw new ForbiddenException("You need OWNER permission to delete");
    }

    await this.prisma.resource.delete({ where: { id: resourceId } });

    await this.audit.log({
      orgId: resource.orgId,
      userId,
      action: "resource.delete",
      entityType: "resource",
      entityId: resourceId,
    });

    this.sync.emitToUsers(recipientIds, {
      type: "resource:delete",
      entityType: "resource",
      entityId: resourceId,
      data: targetGroupId ? { groupId: targetGroupId } : undefined,
    });
  }

  async listPermissions(userId: string, resourceId: string) {
    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }
    if (!this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can view permissions");
    }

    const perms = await this.permissions.listForResource(resourceId);

    const userIds = perms
      .filter((p) => p.aroType === "USER")
      .map((p) => p.aroId);

    const groupIds = perms
      .filter((p) => p.aroType === "GROUP")
      .map((p) => p.aroId);

    const [users, groups] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      this.prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      }),
    ]);

    return perms.map((p) => {
      const user = users.find((u) => u.id === p.aroId);
      const group = groups.find((g) => g.id === p.aroId);
      return {
        ...p,
        email: user?.email ?? null,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        groupName: group?.name ?? null,
      };
    });
  }

  async share(
    userId: string,
    resourceId: string,
    recipients: ShareRecipientDto[],
    groupRecipients?: GroupShareRecipientDto[]
  ) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { orgId: true, name: true, workspaceType: true },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }
    if (resource.workspaceType === "PRIVATE") {
      throw new ForbiddenException("My Workplace resources cannot be shared");
    }

    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }
    if (!this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can share");
    }

    const hasRecipients = Array.isArray(recipients) && recipients.length > 0;
    const hasGroups = Array.isArray(groupRecipients) && groupRecipients.length > 0;
    if (!hasRecipients && !hasGroups) {
      throw new BadRequestException("No recipients or groups provided");
    }

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await this.prisma.$transaction(async (tx: any) => {
        // Individual user recipients
        for (const r of recipients ?? []) {
          const level = r.permission as PermissionLevel;

          await tx.permission.upsert({
            where: {
              aroType_aroId_acoType_acoId: {
                aroType: "USER",
                aroId: r.userId,
                acoType: "RESOURCE",
                acoId: resourceId,
              },
            },
            update: { level },
            create: {
              aroType: "USER",
              aroId: r.userId,
              acoType: "RESOURCE",
              acoId: resourceId,
              level,
            },
          });

          await tx.secret.upsert({
            where: {
              resourceId_userId: { resourceId, userId: r.userId },
            },
            update: { encryptedData: r.encryptedData },
            create: {
              resourceId,
              userId: r.userId,
              encryptedData: r.encryptedData,
            },
          });

          await tx.shareHistory.create({
            data: {
              resourceId,
              sharedById: userId,
              sharedWithId: r.userId,
              level,
            },
          });
        }

        // Group recipients — create group permission + per-member secrets
        for (const g of groupRecipients ?? []) {
          const level = g.permission as PermissionLevel;

          await tx.permission.upsert({
            where: {
              aroType_aroId_acoType_acoId: {
                aroType: "GROUP",
                aroId: g.groupId,
                acoType: "RESOURCE",
                acoId: resourceId,
              },
            },
            update: { level },
            create: {
              aroType: "GROUP",
              aroId: g.groupId,
              acoType: "RESOURCE",
              acoId: resourceId,
              level,
            },
          });

          // Create secrets for each group member (skip empty groups)
          const entries = Object.entries(g.memberSecrets ?? {});
          for (const [memberUserId, encryptedData] of entries) {
            await tx.secret.upsert({
              where: {
                resourceId_userId: { resourceId, userId: memberUserId },
              },
              update: { encryptedData },
              create: {
                resourceId,
                userId: memberUserId,
                encryptedData,
              },
            });
          }
        }
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const recipientIds = new Set<string>();
      recipientIds.add(userId);
      for (const r of recipients ?? []) {
        recipientIds.add(r.userId);
      }
      if (groupRecipients) {
        for (const g of groupRecipients) {
          for (const memberUserId of Object.keys(g.memberSecrets ?? {})) {
            recipientIds.add(memberUserId);
          }
        }
      }
      const updated = await this.getOne(userId, resourceId);
      const groupId = await this.prisma.resource
        .findUnique({ where: { id: resourceId }, select: { groupId: true, folder: { select: { groupId: true } } } })
        .then((r: any) => r?.groupId ?? r?.folder?.groupId ?? null);
      this.sync.emitToUsers([...recipientIds], {
        type: "resource:update",
        entityType: "resource",
        entityId: resourceId,
        data: groupId ? { ...updated, groupId } : updated,
      });

      // Send share notification emails (async, non-blocking)
      const sender = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const senderName = sender ? `${sender.firstName} ${sender.lastName}` : "Someone";
      const recipientUsers = await this.prisma.user.findMany({
        where: { id: { in: [...recipientIds].filter((id) => id !== userId) } },
        select: { id: true, email: true },
      });
      for (const recipientUser of recipientUsers) {
        try {
          await this.emailService.sendShareNotification({
            orgId: resource.orgId,
            recipientEmail: recipientUser.email,
            senderName,
            resourceName: resource.name,
          });
        } catch {
          // Email queue failed — don't block the share operation
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ForbiddenException || err instanceof NotFoundException) {
        throw err;
      }
      throw new BadRequestException("Failed to share resource. Please check recipients and try again.");
    }
  }

  async revokeShare(userId: string, resourceId: string, targetUserId: string) {
    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }
    if (!this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can revoke sharing");
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.permission.deleteMany({
        where: {
          aroType: "USER",
          aroId: targetUserId,
          acoType: "RESOURCE",
          acoId: resourceId,
        },
      });
      await tx.secret.deleteMany({
        where: {
          resourceId,
          userId: targetUserId,
        },
      });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async revokeGroupShare(userId: string, resourceId: string, groupId: string) {
    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }
    if (!this.permissions.hasAtLeast(perm, "OWNER")) {
      throw new ForbiddenException("Only owners can revoke sharing");
    }

    const memberIds = await this.permissions.getGroupMemberIds(groupId);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.$transaction(async (tx: any) => {
      await tx.permission.deleteMany({
        where: {
          aroType: "GROUP",
          aroId: groupId,
          acoType: "RESOURCE",
          acoId: resourceId,
        },
      });
      if (memberIds.length > 0) {
        await tx.secret.deleteMany({
          where: {
            resourceId,
            userId: { in: memberIds },
          },
        });
      }
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async toggleFavorite(userId: string, resourceId: string) {
    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) {
      throw new NotFoundException("Resource not found");
    }

    const existing = await this.prisma.userFavorite.findUnique({
      where: { userId_resourceId: { userId, resourceId } },
    });

    if (existing) {
      await this.prisma.userFavorite.delete({
        where: { userId_resourceId: { userId, resourceId } },
      });
      return { isFavorite: false };
    }

    await this.prisma.userFavorite.create({
      data: { userId, resourceId },
    });
    return { isFavorite: true };
  }

  async listFavorites(userId: string, orgId: string) {
    return this.listForUser(userId, orgId, { favorite: true });
  }

  async exportForUser(
    userId: string,
    orgId: string,
    scope?: { mode: "all" | "workplace" | "groups"; groupIds?: string[] }
  ) {
    const mode = scope?.mode ?? "all";

    let items: any[];
    if (mode === "workplace") {
      items = await this.listForUser(userId, orgId);
    } else if (mode === "groups" && scope?.groupIds?.length) {
      const groupResults: any[] = [];
      for (const groupId of scope.groupIds) {
        const groupItems = await this.listForGroup(userId, orgId, groupId);
        groupResults.push(...groupItems);
      }
      // Deduplicate by resource id (a resource could appear via multiple groups)
      const seen = new Set<string>();
      items = groupResults.filter((item: any) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    } else {
      items = await this.listAll(userId, orgId);
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const results: any[] = [];

    for (const item of items) {
      const secret = await this.prisma.secret.findUnique({
        where: { resourceId_userId: { resourceId: item.id, userId } },
      });
      if (!secret) continue;

      results.push({
        id: item.id,
        name: item.name,
        uri: item.uri,
        resourceType: item.resourceType,
        encryptedData: secret.encryptedData,
        groupId: item.groupId ?? null,
        folderId: item.folder?.id ?? null,
        metadata: item.metadata ?? {},
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return results;
  }

  async getActivity(userId: string, id: string) {
    const perm = await this.permissions.resolveForResource(userId, id);
    if (!perm) throw new NotFoundException("Resource not found");

    const entries = await this.prisma.auditLog.findMany({
      where: { entityType: "RESOURCE", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarBase64: true } } },
    });

    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      user: e.user,
      metadata: e.metadataJson as Record<string, unknown>,
      createdAt: e.createdAt,
    }));
  }

  private toResourceDto(r: {
    id: string;
    name: string;
    uri: string | null;
    createdAt: Date;
    updatedAt: Date;
  }, groupId?: string | null, groupName?: string | null) {
    const source = groupId ? "group" : "workplace";
    return {
      id: r.id,
      name: r.name,
      uri: r.uri,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      source,
      groupId: groupId ?? null,
      groupName: groupName ?? null,
    };
  }
}
