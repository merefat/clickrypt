import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
  starttls: boolean;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  error?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || '';
  const secure = process.env.SMTP_SECURE === 'true';
  const starttls = process.env.SMTP_STARTTLS !== 'false';

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    from,
    secure,
    starttls,
  };
}

export function isEmailConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export function getTransporter(): Transporter {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error('SMTP service is not configured on this server');
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.starttls,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  replyTo,
  headers,
}: SendEmailOptions): Promise<EmailResult> {
  const config = getSmtpConfig();
  if (!config) {
    return {
      success: false,
      error: 'SMTP service is not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD)',
    };
  }

  const cleanRecipient = (to || '').trim().toLowerCase();
  if (!cleanRecipient) {
    return {
      success: false,
      error: 'Recipient email address is missing',
    };
  }

  try {
    const transporter = getTransporter();
    const senderFrom = from || `"ClicKrypt Security" <${config.from}>`;

    const info = await transporter.sendMail({
      from: senderFrom,
      to: cleanRecipient,
      replyTo: replyTo || config.from,
      subject,
      text,
      html,
      headers: {
        'X-Entity-Ref-ID': Date.now().toString(),
        'X-Priority': '1 (Highest)',
        Importance: 'High',
        ...(headers || {}),
      },
    });

    const accepted = Array.isArray(info.accepted)
      ? (info.accepted as string[])
      : [String(info.accepted)];
    const rejected = Array.isArray(info.rejected)
      ? (info.rejected as string[])
      : [];

    return {
      success: true,
      messageId: info.messageId,
      accepted,
      rejected,
    };
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[SMTP ERROR] Failed to send email to ${cleanRecipient}:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function verifySmtp(): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'SMTP environment variables are incomplete' };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Unknown SMTP verification failure';
    console.error('[SMTP VERIFICATION ERROR]:', message);
    return { success: false, error: message };
  }
}

export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  organizationDomain?: string
): Promise<EmailResult> {
  const cleanEmail = (email || '').trim().toLowerCase();

  const textContent = `Your ClicKrypt organization verification code is: ${code}\n\n` +
    `Enter this 6-digit code in your ClicKrypt window to complete verification for ${organizationDomain || 'your organization'}.\n\n` +
    `This code will expire in 15 minutes.\n\n` +
    `If you did not initiate this request, you can safely ignore this email.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ClicKrypt Verification Code</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 32px 16px;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0f172a 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">ClicKrypt</h1>
          <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Zero-Knowledge Enterprise Vault</p>
        </div>
        <div style="padding: 32px 28px;">
          <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 12px 0; font-weight: 700;">Verify Your Organization</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
            Please use the 6-digit verification code below to verify ownership and complete setting up ${
              organizationDomain ? `<strong>${organizationDomain}</strong>` : 'your organization'
            } on ClicKrypt:
          </p>
          <div style="background-color: #f8fafc; border: 2px dashed #0284c7; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0284c7; display: inline-block;">
              ${code}
            </span>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
            ⏱️ This verification code is valid for <strong>15 minutes</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
            If you did not request this verification code, please ignore this email.
          </p>
        </div>
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">
            © ${new Date().getFullYear()} ClicKrypt • Zero-Knowledge Enterprise Vault
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: cleanEmail,
    subject: `ClicKrypt Organization Verification Code: ${code}`,
    text: textContent,
    html: htmlContent,
  });
}
