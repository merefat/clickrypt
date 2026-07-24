import { Global, Module } from "@nestjs/common";
import { DeploymentPolicyService } from "./deployment-policy.service";

@Global()
@Module({
  providers: [DeploymentPolicyService],
  exports: [DeploymentPolicyService],
})
export class InstallationsModule {}
