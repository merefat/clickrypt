import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrgsService } from "./orgs.service";
import { CreateOrgDto } from "./dto/create-org.dto";
import { UpdateSmtpSettingsDto } from "./dto/smtp-settings.dto";

@ApiTags("orgs")
@Controller("orgs")
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new organization/vault" })
  createOrg(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrgDto) {
    return this.orgsService.createForUser(user.id, dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current org info" })
  getOrgInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.orgsService.getOrgInfo(user.orgId);
  }

  @Get("settings/smtp")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get SMTP settings for the organization" })
  getSmtpSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.orgsService.getSmtpSettings(user.orgId);
  }

  @Put("settings/smtp")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update SMTP settings for the organization" })
  updateSmtpSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSmtpSettingsDto,
  ) {
    return this.orgsService.updateSmtpSettings(user.orgId, dto);
  }

  @Get("settings/email-logs")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get recent email delivery logs" })
  getEmailLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.orgsService.getEmailLogs(user.orgId);
  }
}
