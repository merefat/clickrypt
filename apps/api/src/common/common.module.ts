import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ThrottleGuard } from "./throttle.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OrganizationModeGuard } from "./organization-mode.guard";

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-me-in-production",
      signOptions: {
        expiresIn: (process.env.JWT_ACCESS_TTL ?? "15m") as unknown as number,
      },
    }),
  ],
  providers: [ThrottleGuard, JwtAuthGuard, OrganizationModeGuard],
  exports: [ThrottleGuard, JwtAuthGuard, OrganizationModeGuard, JwtModule],
})
export class CommonModule {}
