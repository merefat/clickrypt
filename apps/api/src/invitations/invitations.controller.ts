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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../memberships/roles.guard";
import { Roles } from "../memberships/roles.decorator";
import { InvitationsService } from "./invitations.service";
import { OrganizationModeGuard } from "../common/organization-mode.guard";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";

@ApiTags("invitations")
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // ── Public endpoints (token-gated) ─────────────────────────────────────

  @Get("invitations/:token")
  @ApiOperation({ summary: "Preview an invitation by token (public)" })
  preview(@Param("token") token: string) {
    return this.invitationsService.preview(token);
  }

  @Post("invitations/:token/accept")
  @HttpCode(201)
  @ApiOperation({ summary: "Accept an invitation by token and create account" })
  accept(
    @Param("token") token: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.accept(token, dto);
  }

  // ── Authenticated endpoints ─────────────────────────────────────────────

  @Post("organizations/:orgId/invitations")
  @UseGuards(JwtAuthGuard, OrganizationModeGuard, RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @HttpCode(201)
  @ApiOperation({ summary: "Create an invitation (ADMIN+)" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot invite to another organization");
    }
    return this.invitationsService.create(orgId, user.id, dto);
  }

  @Get("organizations/:orgId/invitations")
  @UseGuards(JwtAuthGuard, OrganizationModeGuard, RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List pending invitations (ADMIN+)" })
  listPending(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot access another organization");
    }
    return this.invitationsService.listPending(orgId);
  }

  @Delete("organizations/:orgId/invitations/:inviteId")
  @UseGuards(JwtAuthGuard, OrganizationModeGuard, RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke a pending invitation (ADMIN+)" })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
  ) {
    if (orgId !== user.orgId) {
      throw new ForbiddenException("Cannot access another organization");
    }
    return this.invitationsService.revoke(orgId, inviteId, user.id);
  }
}
