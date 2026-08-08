import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeploymentPolicyService } from "../installations/deployment-policy.service";
import { TagsService } from "../tags/tags.service";
import { CreateResourceDto } from "./dto/create-resource.dto";
import { ShareResourceDto } from "./dto/share-resource.dto";
import { UpdateResourceDto } from "./dto/update-resource.dto";
import { ReorderResourceDto } from "./dto/reorder-resource.dto";
import { ResourcesService } from "./resources.service";

@ApiTags("resources")
@Controller("resources")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly tagsService: TagsService,
    private readonly deploymentPolicy: DeploymentPolicyService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a new password entry with encrypted secret" })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResourceDto
  ) {
    console.log("[ResourcesController.create] user:", user, "dto:", dto);
    if (!user?.id || !user?.orgId) {
      throw new UnauthorizedException("Invalid authentication context");
    }
    try {
      return await this.resourcesService.create(user.id, user.orgId, dto);
    } catch (err) {
      console.error("[ResourcesController.create] unhandled error:", err);
      throw err;
    }
  }

  @Get()
  @ApiOperation({ summary: "List all resources visible to the caller (workplace + groups)" })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("folderId") folderId?: string,
    @Query("tagId") tagId?: string,
    @Query("favorite") favorite?: string,
    @Query("groupId") groupId?: string
  ) {
    if (groupId) {
      return this.resourcesService.listForGroup(user.id, user.orgId, groupId, {
        folderId: folderId ? folderId : null,
        q: q || undefined,
        tagId: tagId || undefined,
      });
    }
    return this.resourcesService.listAll(user.id, user.orgId, {
      q: q || undefined,
      folderId: folderId || undefined,
      tagId: tagId || undefined,
      favorite: favorite === "true" || undefined,
    });
  }

  @Get("favorites")
  @ApiOperation({ summary: "List favorited resources" })
  listFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.resourcesService.listFavorites(user.id, user.orgId);
  }

  @Get("export")
  @ApiOperation({ summary: "Export user-visible resources with encrypted secrets for client-side decryption (scope: all, workplace, or groups)" })
  exportForUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query("scope") scope?: string,
    @Query("groupIds") groupIds?: string
  ) {
    const validScopes = ["all", "workplace", "groups"] as const;
    const mode = (validScopes as readonly string[]).includes(scope ?? "all")
      ? (scope as "all" | "workplace" | "groups") ?? "all"
      : "all";
    const parsedGroupIds = groupIds
      ? groupIds.split(",").map((g) => g.trim()).filter(Boolean)
      : undefined;
    return this.resourcesService.exportForUser(user.id, user.orgId, {
      mode,
      groupIds: parsedGroupIds,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single resource's metadata" })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.resourcesService.getOne(user.id, id);
  }

  @Get(":id/secret")
  @ApiOperation({ summary: "Get the caller's encrypted secret for a resource" })
  getSecret(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.resourcesService.getSecret(user.id, id);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update resource metadata and/or secret" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto
  ) {
    return this.resourcesService.update(user.id, id, dto);
  }

  @Put(":id/reorder")
  @ApiOperation({ summary: "Reorder/move a resource" })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReorderResourceDto,
  ) {
    return this.resourcesService.reorder(user.id, user.orgId, id, dto, user.orgRole);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a resource (OWNER only)" })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.resourcesService.delete(user.id, id, user.orgRole);
  }

  @Get(":id/permissions")
  @ApiOperation({ summary: "List permissions for a resource (OWNER only)" })
  listPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.resourcesService.listPermissions(user.id, id);
  }

  @Post(":id/tags/:tagId")
  @HttpCode(201)
  @ApiOperation({ summary: "Attach a tag to a resource" })
  attachTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("tagId", ParseUUIDPipe) tagId: string
  ) {
    return this.tagsService.attachToResource(id, tagId);
  }

  @Delete(":id/tags/:tagId")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a tag from a resource" })
  async detachTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("tagId", ParseUUIDPipe) tagId: string
  ) {
    await this.tagsService.detachFromResource(id, tagId);
  }

  @Post(":id/favorite")
  @ApiOperation({ summary: "Toggle favorite on a resource" })
  toggleFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.resourcesService.toggleFavorite(user.id, id);
  }

  @Post(":id/share")
  @HttpCode(200)
  @ApiOperation({ summary: "Share a resource with users and/or groups (OWNER only)" })
  async share(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ShareResourceDto
  ) {
    await this.deploymentPolicy.assertCanShare(user.orgId);
    await this.resourcesService.share(
      user.id,
      id,
      dto.recipients ?? [],
      dto.groupRecipients
    );
    return { success: true };
  }

  @Delete(":id/share/:userId")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke sharing for a user (OWNER only)" })
  async revokeShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string
  ) {
    await this.resourcesService.revokeShare(user.id, id, targetUserId);
  }

  @Delete(":id/share/group/:groupId")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke group sharing (OWNER only)" })
  async revokeGroupShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("groupId", ParseUUIDPipe) groupId: string
  ) {
    await this.resourcesService.revokeGroupShare(user.id, id, groupId);
  }

  @Get(":id/activity")
  @ApiOperation({ summary: "List activity for a resource" })
  getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.resourcesService.getActivity(user.id, id);
  }
}
