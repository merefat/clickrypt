import { Module } from "@nestjs/common";
import { MembershipsModule } from "../memberships/memberships.module";
import { AuditModule } from "../audit/audit.module";
import { OrgsModule } from "../orgs/orgs.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [MembershipsModule, AuditModule, OrgsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
