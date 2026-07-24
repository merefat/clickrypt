import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getDeploymentMode } from "../common/deployment-mode";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = "up";
    } catch {
      // database stays "down"
    }
    return {
      status: database === "up" ? "ok" : "degraded",
      database,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("config")
  async config() {
    try {
      const installation = await this.prisma.installation.findFirst({
        include: { organization: { select: { mode: true } } },
      });
      if (installation && installation.initializedAt) {
        const mode = installation.mode ?? installation.organization?.mode ?? "ORGANIZATION";
        return {
          deploymentMode: mode === "SELF_HOSTED" ? "self-hosted" : "organization",
        };
      }
    } catch {
      // fall through to env-based mode
    }
    return {
      deploymentMode: getDeploymentMode(),
    };
  }

  @Get("setup-status")
  async setupStatus() {
    try {
      const installation = await this.prisma.installation.findFirst();
      if (installation?.initializedAt) {
        return {
          needsSetup: false,
          initialized: true,
        };
      }
      // Defensive fallback: if any user already exists, setup is effectively done.
      const userCount = await this.prisma.user.count();
      const initialized = userCount > 0;
      return {
        needsSetup: !initialized,
        initialized,
      };
    } catch {
      // Table may not exist yet (pre-migration) — safe default allows onboarding
      return {
        needsSetup: true,
        initialized: false,
      };
    }
  }
}
