import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLES_KEY, CAPABILITY_KEY } from "./roles.decorator";
import { ROLE_RANK, hasCapability } from "./capabilities";
import type { OrgRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/current-user.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();

    const requiredRoles = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, cls);
    const requiredCapability = Reflect.getMetadata(CAPABILITY_KEY, handler) ?? Reflect.getMetadata(CAPABILITY_KEY, cls);

    if (!requiredRoles && !requiredCapability) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user: AuthenticatedUser }).user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: user.orgId,
          userId: user.id,
        },
      },
      select: { role: true, status: true },
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("Account is not an active member of this organization");
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasMinRole = requiredRoles.some(
        (r: string) => ROLE_RANK[membership.role as OrgRole] >= ROLE_RANK[r as OrgRole]
      );
      if (!hasMinRole) {
        throw new ForbiddenException(
          `This action requires one of: ${requiredRoles.join(", ")}`
        );
      }
    }

    if (requiredCapability) {
      if (!hasCapability(membership.role as OrgRole, requiredCapability as any)) {
        throw new ForbiddenException(
          `This action requires capability: ${requiredCapability}`
        );
      }
    }

    return true;
  }
}
