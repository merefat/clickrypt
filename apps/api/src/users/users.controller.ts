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
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "../common/throttle.decorator";
import { ThrottleGuard } from "../common/throttle.guard";
import { RegisterUserDto } from "./dto/register-user.dto";
import { CompleteSetupDto } from "./dto/complete-setup.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdatePassphraseDto } from "./dto/update-passphrase.dto";
import { UploadAvatarDto } from "./dto/upload-avatar.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("register")
  @HttpCode(201)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowSeconds: 60 })
  @ApiOperation({ summary: "Register with a public key + encrypted private key blob" })
  register(@Body() dto: RegisterUserDto) {
    return this.usersService.register(dto);
  }

  @Post("setup")
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowSeconds: 60 })
  @ApiOperation({ summary: "Complete setup for an invited (PENDING) user" })
  setup(@Body() dto: CompleteSetupDto) {
    return this.usersService.completeSetup(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user profile" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.toProfile(user.id);
  }

  @Put("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update current user profile" })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Put("me/passphrase")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update encrypted private key with new passphrase" })
  updatePassphrase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePassphraseDto,
  ) {
    return this.usersService.updatePassphrase(user.id, dto.encryptedPrivateKey);
  }

  @Post("me/avatar")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload avatar image (base64 data URI)" })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadAvatarDto,
  ) {
    return this.usersService.uploadAvatar(user.id, dto.avatarBase64);
  }

  @Delete("me/avatar")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove avatar image" })
  removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.removeAvatar(user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List users in the caller's organization" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listOrgUsers(user.orgId);
  }

  @Get("lookup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Look up a user by email within the caller's org" })
  lookup(@CurrentUser() user: AuthenticatedUser, @Query("email") email: string) {
    return this.usersService.findByEmail(user.orgId, email);
  }

  @Get("me/sessions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List active sessions for the current user" })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listSessions(user.id, user.sessionId);
  }

  @Get("me/public-key")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Fetch the current user's armored public key" })
  myPublicKey(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPublicKey(user.id);
  }

  @Delete("me/sessions/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke a specific session" })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) sessionId: string,
  ) {
    await this.usersService.revokeSession(user.id, sessionId);
  }

  @Get(":id/public-key")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Fetch a user's armored public key" })
  publicKey(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.getPublicKey(id);
  }
}
