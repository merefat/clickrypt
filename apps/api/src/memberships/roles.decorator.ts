import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const CAPABILITY_KEY = "capability";

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const RequireCapability = (capability: string) =>
  SetMetadata(CAPABILITY_KEY, capability);
