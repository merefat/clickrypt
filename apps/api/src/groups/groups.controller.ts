import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AddGroupMemberDto, CreateGroupDto, SetGroupKeyDto, UpdateGroupDto } from "./dto/group.dto";
import { SyncGroupSecretsDto } from "./dto/sync-group-secrets.dto";
import { GroupsService } from "./groups.service";

@ApiTags("groups")
@Controller("groups")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: "List groups in organization" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.list(user.orgId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get group details" })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.groupsService.get(user.id, user.orgId, id);
  }

  @Post()
  @ApiOperation({ summary: "Create a group" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupDto
  ) {
    return this.groupsService.create(user.id, user.orgId, dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Rename a group" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto
  ) {
    return this.groupsService.update(user.id, user.orgId, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a group" })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.groupsService.delete(user.id, user.orgId, id);
  }

  @Get(":id/recipients")
  @ApiOperation({ summary: "List users who should receive group secrets" })
  getRecipients(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.groupsService.getRecipientKeys(user.id, user.orgId, id);
  }

  @Get(":id/my-key")
  @ApiOperation({ summary: "Get the caller's encrypted group symmetric key" })
  getMyKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.groupsService.getMyGroupKey(user.id, user.orgId, id);
  }

  @Post(":id/keys")
  @ApiOperation({ summary: "Set a member's encrypted group symmetric key" })
  setKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetGroupKeyDto
  ) {
    return this.groupsService.setGroupKey(user.id, user.orgId, id, dto.userId, dto.encryptedGroupKey, dto.rawGroupKey);
  }

  @Get(":id/members")
  @ApiOperation({ summary: "List group members" })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.groupsService.listMembers(user.id, user.orgId, id);
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Add a member to the group by email" })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddGroupMemberDto
  ) {
    return this.groupsService.addMember(user.id, user.orgId, id, dto.email, dto.role);
  }

  @Delete(":id/members/:userId")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a member from the group" })
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ) {
    await this.groupsService.removeMember(user.id, user.orgId, id, userId);
  }

  @Post(":id/sync-members")
  @ApiOperation({ summary: "Sync org members into this group (add missing members)" })
  syncMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.groupsService.syncMembers(user.id, user.orgId, id);
  }

  @Post(":id/sync/:userId")
  @ApiOperation({ summary: "Bulk-share existing group secrets to a user" })
  syncSecrets(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SyncGroupSecretsDto
  ) {
    return this.groupsService.syncSecrets(user.id, user.orgId, id, userId, dto.resourceShares);
  }
}
