import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Payload attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  orgId: string;
  orgRole: string;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  }
);
