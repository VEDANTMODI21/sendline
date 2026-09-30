import nodemailer, { Transporter } from 'nodemailer';
import type { Sender } from './senders.repo';

/** One pooled SMTP connection set per sender, reused across jobs. */
const cache = new Map<number, Transporter>();

function transportFor(s: Sender): Transporter {
  let t = cache.get(s.id);
  if (!t) {
    t = nodemailer.createTransport({
      pool: true,
      maxConnections: 2,
      host: s.smtp.host,
      port: s.smtp.port,
      secure: s.smtp.port === 465,
      auth: { user: s.smtp.user, pass: s.smtp.pass },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    cache.set(s.id, t);
  }
  return t;
}

export interface Outgoing {
  emailId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Delivery {
  messageId: string;
  previewUrl: string | null;
}

export async function deliver(sender: Sender, m: Outgoing): Promise<Delivery> {
  const domain = sender.email.split('@')[1] ?? 'sendline.local';
  const info = await transportFor(sender).sendMail({
    from: { name: sender.displayName, address: sender.email },
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    // Deterministic Message-ID: the email row id is traceable end-to-end in the inbox.
    messageId: `<${m.emailId}@${domain}>`,
    headers: { 'X-Sendline-Email-Id': m.emailId },
  });
  const url = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: typeof url === 'string' ? url : null };
}

export function closeTransports() {
  for (const t of cache.values()) t.close();
  cache.clear();
}
