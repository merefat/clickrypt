import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SECURE, SMTP_STARTTLS } = process.env;

function getTransporter(): Transporter {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    throw new Error('SMTP is not configured');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    requireTLS: SMTP_STARTTLS !== 'false',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD && SMTP_FROM);
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export async function sendEmail({ to, subject, text, html, from }: SendEmailOptions) {
  const transporter = getTransporter();

  return transporter.sendMail({
    from: from || `ClicKrypt <${SMTP_FROM}>`,
    to,
    subject,
    text,
    html,
  });
}

export async function verifySmtp(): Promise<boolean> {
  if (!isEmailConfigured()) {
    return false;
  }

  const transporter = getTransporter();
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('SMTP verification failed:', message);
    return false;
  }
}

export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function sendVerificationEmail(email: string, code: string) {
  if (!isEmailConfigured()) {
    console.log(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }
  await sendEmail({
    to: email,
    subject: 'Your Clickrypt organization verification code',
    text: `Your verification code is: ${code}`,
    html: `<p>Your verification code is: <strong>${code}</strong></p>`,
  });
}
