import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InstallationsModule } from "../installations/installations.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AuthModule, InstallationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
