import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom?: string;
  appUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST ?? "localhost";
    const port = Number(process.env.SMTP_PORT ?? 1025);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(process.env.SMTP_USER
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
        : {}),
    });
    const mailhog = host === "localhost" && port === 1025;
    this.logger.log(
      `MailService initialized: SMTP ${host}:${port} (secure=${secure})${mailhog ? " [MailHog — emails captured locally, not delivered]" : ""}`,
    );
  }

  private createTransporter(config: SmtpConfig): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }

  async sendInviteEmail(params: {
    email: string;
    inviteLink: string;
    orgName: string;
    role: string;
    smtpConfig?: SmtpConfig | null;
  }): Promise<void> {
    const { email, inviteLink, orgName, role, smtpConfig } = params;
    const transporter = smtpConfig
      ? this.createTransporter(smtpConfig)
      : this.transporter;
    const from = smtpConfig?.smtpFrom ?? process.env.SMTP_FROM ?? "Clickrypt <no-reply@clickrypt.local>";
    try {
      const info = await transporter.sendMail({
        from,
        to: email,
        subject: `You've been invited to join ${orgName} on Clickrypt`,
        text: [
          `You've been invited to join ${orgName} on Clickrypt as ${role}.`,
          "",
          "Click the link below to set up your account:",
          inviteLink,
          "",
          "This invitation expires in 48 hours.",
        ].join("\n"),
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>You've been invited to Clickrypt</h2>
            <p>You've been invited to join <strong>${orgName}</strong> as <strong>${role}</strong>.</p>
            <p>
              <a href="${inviteLink}" style="display: inline-block; background: #1e88e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Set up your account
              </a>
            </p>
            <p style="color: #667; font-size: 13px;">Or copy this link into your browser:<br/>${inviteLink}</p>
            <p style="color: #667; font-size: 13px;">This invitation expires in 48 hours.</p>
          </div>
        `,
      });
      this.logger.log(`Invite email sent to ${email} (messageId: ${info.messageId})`);
    } catch (error) {
      this.logger.error(
        `Failed to send invite email to ${email}: ${error instanceof Error ? error.message : error}`
      );
      throw new Error(`Failed to send invitation email: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}
