import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

export interface InviteEmailJobData {
  orgId: string;
  email: string;
  inviteLink: string;
  orgName: string;
  role: string;
}

export interface ShareNotificationJobData {
  orgId: string;
  recipientEmail: string;
  senderName: string;
  resourceName: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue("email-queue") private readonly emailQueue: Queue,
  ) {}

  async sendInviteEmail(data: InviteEmailJobData): Promise<void> {
    const subject = `You've been invited to join ${data.orgName} on Clickrypt`;
    const text = [
      `You've been invited to join ${data.orgName} on Clickrypt as ${data.role}.`,
      "",
      "Click the link below to set up your account:",
      data.inviteLink,
      "",
      "This invitation expires in 48 hours.",
    ].join("\n");
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been invited to Clickrypt</h2>
        <p>You've been invited to join <strong>${data.orgName}</strong> as <strong>${data.role}</strong>.</p>
        <p>
          <a href="${data.inviteLink}" style="display: inline-block; background: #1e88e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Set up your account
          </a>
        </p>
        <p style="color: #667; font-size: 13px;">Or copy this link into your browser:<br/>${data.inviteLink}</p>
        <p style="color: #667; font-size: 13px;">This invitation expires in 48 hours.</p>
      </div>
    `;

    await this.emailQueue.add("send-email", {
      orgId: data.orgId,
      to: data.email,
      subject,
      text,
      html,
    });
    this.logger.log(`Enqueued invite email to ${data.email}`);
  }

  async sendShareNotification(data: ShareNotificationJobData): Promise<void> {
    const subject = `${data.senderName} shared a password with you on Clickrypt`;
    const text = [
      `${data.senderName} shared a password item "${data.resourceName}" with you on Clickrypt.`,
      "",
      "Log in to your Clickrypt vault to view it.",
    ].join("\n");
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Item shared with you</h2>
        <p><strong>${data.senderName}</strong> shared a password item <strong>${data.resourceName}</strong> with you on Clickrypt.</p>
        <p>Log in to your Clickrypt vault to view it.</p>
      </div>
    `;

    await this.emailQueue.add("send-email", {
      orgId: data.orgId,
      to: data.recipientEmail,
      subject,
      text,
      html,
    });
    this.logger.log(`Enqueued share notification to ${data.recipientEmail}`);
  }
}
