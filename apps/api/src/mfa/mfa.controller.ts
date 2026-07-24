import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MfaVerifyLoginDto, VerifyTotpDto } from "./dto/mfa.dto";
import { MfaService } from "./mfa.service";

@ApiTags("mfa")
@Controller("mfa")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Get("status")
  @ApiOperation({ summary: "Check if MFA is enabled" })
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.getStatus(user.id);
  }

  @Post("totp/enroll")
  @ApiOperation({ summary: "Generate TOTP secret and QR URI" })
  enroll(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.enroll(user.id, user.email);
  }

  @Post("totp/verify")
  @ApiOperation({ summary: "Verify TOTP code and enable MFA" })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyTotpDto
  ) {
    return this.mfaService.verify(user.id, dto.code);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: "Disable MFA" })
  async disable(@CurrentUser() user: AuthenticatedUser) {
    await this.mfaService.disable(user.id);
  }
}
