import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";

interface EmailJobData {
  orgId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Processor("email-queue", { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgsService: OrgsService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { orgId, to, subject, text, html } = job.data;

    // Create EmailLog as PENDING
    const log = await this.prisma.emailLog.create({
      data: { orgId, recipient: to, subject, status: "PENDING" },
    });

    try {
      // Load SMTP config from DB, fall back to env
      const smtpConfig = await this.orgsService.getFullSmtpSettings(orgId);

      let transporter: nodemailer.Transporter;
      let from: string;

      if (smtpConfig) {
        transporter = nodemailer.createTransport({
          host: smtpConfig.smtpHost,
          port: smtpConfig.smtpPort,
          secure: smtpConfig.smtpSecure,
          auth: { user: smtpConfig.smtpUser, pass: smtpConfig.smtpPass },
        });
        from = smtpConfig.smtpFrom ?? "Clickrypt <no-reply@clickrypt.local>";
      } else {
        const host = process.env.SMTP_HOST ?? "localhost";
        const port = Number(process.env.SMTP_PORT ?? 1025);
        const secure = process.env.SMTP_SECURE === "true" || port === 465;
        transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          ...(process.env.SMTP_USER
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {}),
        });
        from = process.env.SMTP_FROM ?? "Clickrypt <no-reply@clickrypt.local>";
      }

      const info = await transporter.sendMail({ from, to, subject, text, html });

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      this.logger.log(`Email sent to ${to} (messageId: ${info.messageId})`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: "FAILED", error: errorMsg },
      });
      this.logger.error(`Failed to send email to ${to}: ${errorMsg}`);
      throw error;
    }
  }
}
