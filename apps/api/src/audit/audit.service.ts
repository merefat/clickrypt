import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    orgId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: params.orgId,
          userId: params.userId ?? null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          ipAddress: params.ipAddress ?? null,
          metadataJson: (params.metadata ?? {}) as import("@prisma/client/runtime/library").InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }

  async list(orgId: string, limit = 100, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.auditLog.count({ where: { orgId } }),
    ]);
    return { items, total };
  }
}
