import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSmtpSettingsDto } from "./dto/smtp-settings.dto";

export interface SmtpSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom?: string;
  appUrl: string;
}

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrgInfo(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Organization not found");
    return { id: org.id, name: org.name, mode: org.mode };
  }

  async getSmtpSettings(orgId: string): Promise<Partial<SmtpSettings>> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Organization not found");
    const settings = (org.settingsJson as Record<string, unknown>) ?? {};
    const smtp = (settings.smtp as Partial<SmtpSettings>) ?? {};
    return {
      smtpHost: smtp.smtpHost,
      smtpPort: smtp.smtpPort,
      smtpSecure: smtp.smtpSecure,
      smtpUser: smtp.smtpUser,
      smtpFrom: smtp.smtpFrom,
      appUrl: smtp.appUrl,
    };
  }

  async updateSmtpSettings(orgId: string, dto: UpdateSmtpSettingsDto): Promise<SmtpSettings> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Organization not found");

    const existingSettings = (org.settingsJson as Record<string, unknown>) ?? {};
    const smtpSettings: SmtpSettings = {
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure ?? false,
      smtpUser: dto.smtpUser,
      smtpPass: dto.smtpPass,
      smtpFrom: dto.smtpFrom,
      appUrl: dto.appUrl,
    };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        settingsJson: {
          ...existingSettings,
          smtp: smtpSettings,
        } as any,
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return smtpSettings;
  }

  async getFullSmtpSettings(orgId: string): Promise<SmtpSettings | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return null;
    const settings = (org.settingsJson as Record<string, unknown>) ?? {};
    const smtp = settings.smtp as SmtpSettings | undefined;
    if (!smtp || !smtp.smtpHost || !smtp.smtpUser || !smtp.smtpPass) return null;
    return smtp;
  }

  async getEmailLogs(orgId: string, take = 50) {
    return this.prisma.emailLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        recipient: true,
        subject: true,
        status: true,
        error: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }
}
