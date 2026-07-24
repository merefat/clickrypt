import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DeploymentPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getInstallation() {
    return this.prisma.installation.findFirst();
  }

  async getOrgMode(orgId: string): Promise<"SELF_HOSTED" | "ORGANIZATION"> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { mode: true },
    });
    if (!org) {
      throw new ConflictException("Organization not found");
    }
    return org.mode;
  }

  async assertOrganizationMode(orgId: string): Promise<void> {
    const mode = await this.getOrgMode(orgId);
    if (mode === "SELF_HOSTED") {
      throw new ForbiddenException(
        "This operation is not available in self-hosted mode"
      );
    }
  }

  async assertCanInvite(orgId: string): Promise<void> {
    await this.assertOrganizationMode(orgId);
  }

  async assertCanShare(orgId: string): Promise<void> {
    await this.assertOrganizationMode(orgId);
  }

  async assertRegistrationOpen(orgId: string): Promise<void> {
    await this.assertOrganizationMode(orgId);
  }

  async assertSelfHostedCapacity(orgId: string): Promise<void> {
    const mode = await this.getOrgMode(orgId);
    if (mode === "SELF_HOSTED") {
      const count = await this.prisma.organizationMembership.count({
        where: { organizationId: orgId, status: "ACTIVE" },
      });
      if (count >= 1) {
        throw new ForbiddenException(
          "Self-hosted mode allows only one user"
        );
      }
    }
  }
}
