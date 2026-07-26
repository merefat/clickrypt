import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SetupController } from "./setup.controller";
import { SystemController } from "./system.controller";
import { SetupService } from "./setup.service";

@Module({
  imports: [AuditModule],
  controllers: [SetupController, SystemController],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
