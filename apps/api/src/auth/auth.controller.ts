import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Throttle } from "../common/throttle.decorator";
import { ThrottleGuard } from "../common/throttle.guard";
import { AuthService } from "./auth.service";
import { LoginDto, VerifyDto } from "./dto/auth.dto";
import { MfaVerifyLoginDto } from "../mfa/dto/mfa.dto";

export const REFRESH_COOKIE = "clickrypt_refresh";

@ApiTags("auth")
@Controller("auth")
@UseGuards(ThrottleGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post("verify")
  @HttpCode(200)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary:
      "Start login: returns a challenge encrypted to the user's public key",
  })
  async verify(@Body() dto: VerifyDto) {
    try {
      return await this.authService.createChallenge(dto.email);
    } catch (error) {
      this.logger.error(`Auth verify failed for ${dto.email}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: "Complete login with the decrypted challenge token" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(dto.email, dto.token);

    if (result.mfaRequired) {
      return { mfaRequired: true, mfaToken: (result as any).mfaToken, user: result.user };
    }

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const { refreshToken: _refreshToken, refreshExpiresAt: _exp, ...body } =
      result;
    return body;
  }

  @Post("login/mfa")
  @HttpCode(200)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: "Complete login with MFA verification" })
  async loginMfa(
    @Body() dto: MfaVerifyLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.loginWithMfa(dto.mfaToken, dto.code);
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const { refreshToken: _refreshToken, refreshExpiresAt: _exp, ...body } =
      result;
    return body;
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: "Rotate the refresh token and get a new access token" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.refresh(
      req.cookies?.[REFRESH_COOKIE]
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  @Throttle({ limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: "Revoke the current session" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      expires: expiresAt,
    });
  }
}
