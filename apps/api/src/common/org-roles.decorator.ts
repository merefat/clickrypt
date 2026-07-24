import { SetMetadata } from "@nestjs/common";

export const ORG_ROLES_KEY = "orgRoles";

export const OrgRoles = (...roles: string[]) => SetMetadata(ORG_ROLES_KEY, roles);
