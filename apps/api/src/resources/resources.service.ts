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

    let folderGroupId: string | null = null;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resource = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.resource.create({
        data: {
          orgId,
          folderId: dto.folderId ?? null,
          groupId: dto.groupId ?? null,
          resourceTypeId: resourceType.id,
          name: dto.name,
          uri: dto.uri ?? null,
          metadataJson: dto.metadata ?? {},
          sharingMode,
          createdBy: userId,
          modifiedBy: userId,
        },
      });

      // Group resources use a single group-key ciphertext
      if (dto.groupId) {
        await tx.permission.create({
          data: {
            aroType: "GROUP",
            aroId: dto.groupId,
            acoType: "RESOURCE",
            acoId: created.id,
            level: "READ",
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
        await tx.groupSecret.create({
          data: {
            resourceId: created.id,
            encryptedData: dto.groupEncryptedData!,
          },
        });
        folderGroupId = dto.groupId;
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

        folderGroupId = dto.folderId
          ? (await tx.folder.findUnique({
              where: { id: dto.folderId },
              select: { groupId: true },
            }))?.groupId ?? null
          : null;

        // Auto-share to additional recipients for non-group resources
        if (dto.additionalSecrets && !folderGroupId) {
          for (const [memberUserId, encData] of Object.entries(dto.additionalSecrets)) {
            if (memberUserId === userId) continue;
            await tx.secret.create({
              data: {
                resourceId: created.id,
                userId: memberUserId,
                encryptedData: encData,
              },
            });
            await tx.permission.create({
              data: {
                aroType: "USER",
                aroId: memberUserId,
                acoType: "RESOURCE",
                acoId: created.id,
                level: "READ",
              },
            });
          }
        }
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
      metadata: { name: dto.name },
    });

    const dtoResult = this.toResourceDto(resource);
    const recipientIds = folderGroupId
      ? [...new Set([...(await this.permissions.getGroupMemberIds(folderGroupId)), userId])]
      : [userId, ...Object.keys(dto.additionalSecrets ?? {})];
    this.sync.emitToUsers(recipientIds, {
      type: "resource:create",
      entityType: "resource",
      entityId: resource.id,
      data: folderGroupId ? { ...dtoResult, groupId: folderGroupId } : { ...dtoResult },
    });

    return dtoResult;
  }

  async listForUser(userId: string, orgId: string, filters?: { q?: string; folderId?: string; tagId?: string; favorite?: boolean }) {
    // Both ORGANIZATION and SELF_HOSTED modes now use permission-based access
    // Resources are only visible if explicitly shared with the user
    const perms = await this.prisma.permission.findMany({
      where: {
        aroType: "USER",
        aroId: userId,
        acoType: "RESOURCE",
      },
      select: { acoId: true },
    });
    let resourceIds = perms.map((p) => p.acoId);

    // Also include resources via group permissions
    const groupIds = await this.prisma.groupUser.findMany({
      where: { userId },
      select: { groupId: true },
    });
    if (groupIds.length > 0) {
      const groupPerms = await this.prisma.permission.findMany({
        where: {
          aroType: "GROUP",
          aroId: { in: groupIds.map((g) => g.groupId) },
          acoType: "RESOURCE",
        },
        select: { acoId: true },
      });
      resourceIds = [...new Set([...resourceIds, ...groupPerms.map((p) => p.acoId)])];
    }

    if (resourceIds.length === 0) return [];

    // Filter by favorites if requested
    if (filters?.favorite) {
      const favs = await this.prisma.userFavorite.findMany({
        where: { userId, resourceId: { in: resourceIds } },
        select: { resourceId: true },
      });
      resourceIds = favs.map((f) => f.resourceId);
      if (resourceIds.length === 0) return [];
    }

    const andConditions: any[] = [
      { orgId },
      { id: { in: resourceIds } },
      { groupId: null },
      {
        OR: [
          { folderId: null },
          { folder: { groupId: null } },
        ],
      },
    ];

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

    const resources = await this.prisma.resource.findMany({
      where: { AND: andConditions },
      include: {
        tags: { include: { tag: true } },
        folder: { select: { id: true, name: true } },
        favorites: { where: { userId }, select: { resourceId: true } },
        resourceType: { select: { name: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return resources.map((r) => ({
      id: r.id,
      name: r.name,
      uri: r.uri,
      folder: r.folder
        ? { id: r.folder.id, name: r.folder.name }
        : null,
      tags: r.tags.map((rt) => ({
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
    }));
  }

  async listAll(
    userId: string,
    orgId: string,
    filters?: { q?: string; folderId?: string; tagId?: string; favorite?: boolean }
  ) {
    const [userPerms, memberships] = await Promise.all([
      this.prisma.permission.findMany({
        where: { aroType: "USER", aroId: userId, acoType: "RESOURCE" },
        select: { acoId: true },
      }),
      this.prisma.groupUser.findMany({
        where: { userId },
        select: { groupId: true },
      }),
    ]);

    let resourceIds = userPerms.map((p) => p.acoId);

    if (memberships.length > 0) {
      const groupPerms = await this.prisma.permission.findMany({
        where: {
          aroType: "GROUP",
          aroId: { in: memberships.map((m) => m.groupId) },
          acoType: "RESOURCE",
        },
        select: { acoId: true },
      });
      resourceIds = [...new Set([...resourceIds, ...groupPerms.map((p) => p.acoId)])];
    }

    // Also include ALL group resources in the org (any org member can see group passwords)
    const groupResources = await this.prisma.resource.findMany({
      where: {
        orgId,
        OR: [
          { groupId: { not: null } },
          { folder: { groupId: { not: null } } },
        ],
      },
      select: { id: true },
    } as any);
    resourceIds = [...new Set([...resourceIds, ...groupResources.map((r: any) => r.id)])];

    if (resourceIds.length === 0) return [];

    if (filters?.favorite) {
      const favs = await this.prisma.userFavorite.findMany({
        where: { userId, resourceId: { in: resourceIds } },
        select: { resourceId: true },
      });
      resourceIds = favs.map((f) => f.resourceId);
      if (resourceIds.length === 0) return [];
    }

    const andConditions: any[] = [{ orgId }, { id: { in: resourceIds } }];

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

    const resources: any[] = await this.prisma.resource.findMany({
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
    } as any);

    const groupIds = new Set<string>();
    for (const r of resources) {
      if (r.groupId) groupIds.add(r.groupId);
      if (r.folder?.groupId) groupIds.add(r.folder.groupId);
    }

    const allFolders = (await this.prisma.folder.findMany({
      where: { orgId },
      select: { id: true, name: true, parentFolderId: true, groupId: true },
    } as any)) as any[];

    const groups =
      groupIds.size > 0
        ? (await this.prisma.group.findMany({
            where: { id: { in: [...groupIds] }, orgId },
            select: { id: true, name: true },
          } as any)) as any[]
        : [];

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

    // Any org member can list group resources — no membership check needed

    const andConditions: any[] = [
      { orgId },
      {
        OR: [
          { groupId },
          { folder: { groupId } },
        ],
      },
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

    const resources = await this.prisma.resource.findMany({
      where: { AND: andConditions },
      include: {
        tags: { include: { tag: true } },
        folder: { select: { id: true, name: true } },
        favorites: { where: { userId }, select: { resourceId: true } },
        resourceType: { select: { name: true } },
        creator: { select: { id: true, email: true, firstName: true, lastName: true } },
        modifier: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return resources.map((r) => ({
      id: r.id,
      name: r.name,
      uri: r.uri,
      folder: r.folder
        ? { id: r.folder.id, name: r.folder.name }
        : null,
      tags: r.tags.map((rt) => ({
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

    // For group resources, any org member can access — skip permission check
    const isGroupResource = resource.groupId || resource.folder?.groupId;
    if (!isGroupResource) {
      const perm = await this.permissions.resolveForResource(userId, resourceId);
      if (!perm) {
        throw new NotFoundException("Resource not found");
      }
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
      createdBy: resource.creator ? { email: resource.creator.email, name: `${resource.creator.firstName} ${resource.creator.lastName}` } : null,
      modifiedBy: resource.modifier ? { email: resource.modifier.email, name: `${resource.modifier.firstName} ${resource.modifier.lastName}` } : null,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  async getSecret(userId: string, resourceId: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: {
        groupId: true,
        folder: { select: { groupId: true } },
      },
    } as any);
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    const isGroupResource = (resource as any).groupId || (resource as any).folder?.groupId;

    // For group resources, any org member can access — skip permission check
    if (!isGroupResource) {
      const perm = await this.permissions.resolveForResource(userId, resourceId);
      if (!perm) {
        throw new NotFoundException("Resource not found");
      }
    }
    if (isGroupResource) {
      const groupSecret = await this.prisma.groupSecret.findUnique({
        where: { resourceId },
      });
      if (!groupSecret) {
        throw new NotFoundException("No secret found for this group resource");
      }
      return { encryptedData: groupSecret.encryptedData };
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
      select: { orgId: true, groupId: true, folder: { select: { groupId: true } } },
    } as any);
    if (!existing) {
      throw new NotFoundException("Resource not found");
    }

    const targetGroupId = (existing as any).groupId ?? (existing as any).folder?.groupId ?? null;

    // For group resources, any org member can update — skip permission check
    if (!targetGroupId) {
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

      if (dto.encryptedData) {
        await tx.secret.update({
          where: { resourceId_userId: { resourceId, userId } },
          data: { encryptedData: dto.encryptedData },
        });
      }

      if (dto.groupEncryptedData) {
        await tx.groupSecret.upsert({
          where: { resourceId },
          update: { encryptedData: dto.groupEncryptedData },
          create: { resourceId, encryptedData: dto.groupEncryptedData },
        });
      }

      // Update auto-shared secrets if additionalSecrets provided
      if (dto.additionalSecrets) {
        for (const [memberUserId, encData] of Object.entries(dto.additionalSecrets)) {
          if (memberUserId === userId) continue;
          await tx.secret.upsert({
            where: { resourceId_userId: { resourceId, userId: memberUserId } },
            update: { encryptedData: encData },
            create: {
              resourceId,
              userId: memberUserId,
              encryptedData: encData,
            },
          });
          await tx.permission.upsert({
            where: {
              aroType_aroId_acoType_acoId: {
                aroType: "USER",
                aroId: memberUserId,
                acoType: "RESOURCE",
                acoId: resourceId,
              },
            },
            update: {},
            create: {
              aroType: "USER",
              aroId: memberUserId,
              acoType: "RESOURCE",
              acoId: resourceId,
              level: "READ",
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
      metadata: { name: dto.name },
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
      select: { id: true, orgId: true, createdBy: true, groupId: true, folder: { select: { groupId: true } } },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    const targetGroupId = resource.groupId ?? (resource as any).folder?.groupId ?? null;
    const recipientIds = await this.permissions.getResourceUserIds(resourceId);

    // Allow deletion if user is org OWNER/ADMIN, is the creator, or has OWNER permission
    const isOrgOwnerOrAdmin = orgRole === "OWNER" || orgRole === "ADMIN";
    const isCreator = resource.createdBy === userId;
    const perm = await this.permissions.resolveForResource(userId, resourceId);

    if (!perm && !isOrgOwnerOrAdmin && !isCreator) {
      throw new NotFoundException("Resource not found");
    }

    const hasOwnerPermission = perm && this.permissions.hasAtLeast(perm, "OWNER");

    if (!isOrgOwnerOrAdmin && !isCreator && !hasOwnerPermission) {
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
      select: { orgId: true, name: true },
    });
    if (!resource) {
      throw new NotFoundException("Resource not found");
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

  async exportForUser(userId: string, orgId: string) {
    const items = await this.listAll(userId, orgId);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const results: any[] = [];

    for (const item of items) {
      const resource = await this.prisma.resource.findUnique({
        where: { id: item.id },
        select: {
          groupId: true,
          folder: { select: { groupId: true } },
          resourceType: { select: { name: true } },
        },
      });

      if (!resource) continue;

      const isGroupResource = resource.groupId || resource.folder?.groupId;

      let encryptedData: string | null = null;
      let groupId: string | null = null;

      if (isGroupResource) {
        groupId = resource.groupId ?? resource.folder?.groupId ?? null;
        const groupSecret = await this.prisma.groupSecret.findUnique({
          where: { resourceId: item.id },
        });
        if (groupSecret) {
          encryptedData = groupSecret.encryptedData;
        }
      } else {
        const secret = await this.prisma.secret.findUnique({
          where: { resourceId_userId: { resourceId: item.id, userId } },
        });
        if (secret) {
          encryptedData = secret.encryptedData;
        }
      }

      results.push({
        id: item.id,
        name: item.name,
        uri: item.uri,
        resourceType: resource.resourceType?.name ?? "password",
        encryptedData,
        groupId,
        folderId: item.folder?.id ?? null,
        metadata: item.metadata ?? {},
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return results;
  }

  private toResourceDto(r: {
    id: string;
    name: string;
    uri: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      uri: r.uri,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
