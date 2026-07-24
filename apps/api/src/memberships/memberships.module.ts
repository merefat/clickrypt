import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [AuditModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, RolesGuard],
  exports: [MembershipsService, RolesGuard],
})
export class MembershipsModule {}
