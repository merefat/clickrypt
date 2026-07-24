import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ORG_ROLES_KEY } from "./org-roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/current-user.decorator";

@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user: AuthenticatedUser }).user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { orgRole: true, status: true },
    });

    if (!dbUser || dbUser.status !== "ACTIVE") {
      throw new ForbiddenException("Account is not active");
    }

    if (!requiredRoles.includes(dbUser.orgRole)) {
      throw new ForbiddenException(
        `This action requires one of: ${requiredRoles.join(", ")}`
      );
    }

    return true;
  }
}
