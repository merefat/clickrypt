import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DeploymentPolicyService } from "../installations/deployment-policy.service";
import type { AuthenticatedUser } from "../auth/current-user.decorator";

@Injectable()
export class OrganizationModeGuard implements CanActivate {
  constructor(private readonly policy: DeploymentPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.orgId) {
      throw new UnauthorizedException("Authentication required");
    }
    await this.policy.assertOrganizationMode(user.orgId);
    return true;
  }
}
