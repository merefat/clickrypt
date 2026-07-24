import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InstallationsModule } from "../installations/installations.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TagsModule } from "../tags/tags.module";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";

@Module({
  imports: [PermissionsModule, TagsModule, AuditModule, InstallationsModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
