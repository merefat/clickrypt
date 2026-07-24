import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InstallationsModule } from "../installations/installations.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { OrgsModule } from "../orgs/orgs.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  imports: [AuditModule, InstallationsModule, MembershipsModule, OrgsModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
