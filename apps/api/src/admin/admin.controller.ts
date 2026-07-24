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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import { AdminService } from "./admin.service";
import { InviteUserDto, AddMemberDto } from "./dto/invite-user.dto";

@ApiTags("admin")
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  @ApiOperation({ summary: "List all users in the organization (OWNER or ADMIN)" })
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listUsers(user.orgId);
  }

  @Put("users/:id/status")
  @ApiOperation({ summary: "Update user status (OWNER or ADMIN)" })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { status: string }
  ) {
    return this.adminService.updateUserStatus(user.orgId, id, body.status, user.id);
  }

  @Put("users/:id/role")
  @Roles("OWNER")
  @ApiOperation({ summary: "Update user role (OWNER only)" })
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { role: string }
  ) {
    return this.adminService.updateUserRole(user.orgId, id, body.role);
  }

  @Post("users")
  @HttpCode(201)
  @ApiOperation({ summary: "Directly add a member to the organization (OWNER or ADMIN)" })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMemberDto
  ) {
    return this.adminService.addMember(user.orgId, user.id, dto);
  }

  @Post("users/invite")
  @HttpCode(201)
  @ApiOperation({ summary: "Invite a user to the organization (OWNER or ADMIN)" })
  inviteUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteUserDto
  ) {
    return this.adminService.inviteUser(user.orgId, user.id, dto);
  }

  @Delete("users/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a user (OWNER or ADMIN)" })
  async deleteUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    if (id === user.id) {
      throw new ForbiddenException("You cannot delete your own account");
    }
    await this.adminService.deleteUser(user.orgId, id, user.id);
  }

  @Get("audit-logs")
  @ApiOperation({ summary: "List audit logs (OWNER or ADMIN)" })
  auditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.adminService.listAuditLogs(
      user.orgId,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0
    );
  }
}
