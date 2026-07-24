import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles, RequireCapability } from "./roles.decorator";
import { OrganizationCapability } from "./capabilities";
import { MembershipsService } from "./memberships.service";
import { UpdateRoleDto } from "./dto/update-role.dto";

@ApiTags("memberships")
@Controller("organizations")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get("members/keys")
  @ApiOperation({ summary: "List org members with their public keys (any member)" })
  listMemberKeys(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membershipsService.listMembersWithPublicKeys(user.orgId);
  }

  @Get("members/basic")
  @ApiOperation({ summary: "List org members basic info (any member)" })
  listMembersBasic(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membershipsService.listMembersBasic(user.orgId);
  }

  @Get(":orgId/members")
  @Roles("ADMIN")
  @ApiOperation({ summary: "List organization members (ADMIN+)" })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot access another organization");
    }
    return this.membershipsService.listMembers(orgId);
  }

  @Patch(":orgId/members/:userId/role")
  @RequireCapability(OrganizationCapability.CHANGE_ROLE)
  @ApiOperation({ summary: "Change a member's role (OWNER only)" })
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot modify another organization");
    }
    return this.membershipsService.updateRole(orgId, userId, dto, user.id);
  }

  @Post(":orgId/members/:userId/suspend")
  @RequireCapability(OrganizationCapability.SUSPEND_MEMBER)
  @HttpCode(200)
  @ApiOperation({ summary: "Suspend a member (ADMIN+)" })
  suspendMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot modify another organization");
    }
    return this.membershipsService.suspendMember(orgId, userId, user.id);
  }

  @Post(":orgId/members/:userId/restore")
  @RequireCapability(OrganizationCapability.SUSPEND_MEMBER)
  @HttpCode(200)
  @ApiOperation({ summary: "Restore a suspended member (ADMIN+)" })
  restoreMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot modify another organization");
    }
    return this.membershipsService.restoreMember(orgId, userId, user.id);
  }

  @Delete(":orgId/members/:userId")
  @RequireCapability(OrganizationCapability.CHANGE_ROLE)
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a member from the organization (OWNER only)" })
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot modify another organization");
    }
    await this.membershipsService.removeMember(orgId, userId, user.id);
  }

  @Post(":orgId/transfer-ownership")
  @RequireCapability(OrganizationCapability.TRANSFER_OWNERSHIP)
  @HttpCode(200)
  @ApiOperation({ summary: "Transfer ownership to another member (OWNER only)" })
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body() body: { newOwnerId: string },
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot modify another organization");
    }
    return this.membershipsService.transferOwnership(orgId, body.newOwnerId, user.id);
  }
}
