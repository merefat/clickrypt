import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { isSelfHosted } from "./deployment-mode";

@Injectable()
export class DeploymentModeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (isSelfHosted()) {
      throw new ForbiddenException(
        "This feature is not available in self-hosted mode"
      );
    }
    return true;
  }
}
