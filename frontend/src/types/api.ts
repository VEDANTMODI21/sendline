// Shapes returned by the Sendline API. Kept in one place so every hook/component agrees.

export type EmailStatus = 'scheduled' | 'deferred' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type Folder = 'scheduled' | 'sent';

export interface SlackConnection {
  teamName: string;
  channelName: string;
  connectedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slack: SlackConnection | null;
}

export interface SenderUsage {
  used: number;
  cap: number;
  windowEndsAt: number;
}

export interface Sender {
  id: number;
  email: string;
  displayName: string;
  usage: SenderUsage;
}

export interface EmailListItem {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string;
  lastError: string | null;
  previewUrl: string | null;
  attempts: number;
}

export interface EmailDetail extends EmailListItem {
  bodyHtml: string;
  senderName: string;
  campaignId: string;
  createdAt: string;
  messageId: string | null;
}

export interface EmailPage {
  items: EmailListItem[];
  nextCursor: string | null;
  search: { engine: 'elasticsearch' | 'postgres' } | null;
}

export interface Overview {
  scheduled: number;
  sent: number;
  byStatus: Record<EmailStatus, number>;
  queue: Record<string, number>;
  searchHealthy: boolean;
}

export interface AppConfig {
  maxHourlyPerSender: number;
  minSendGapMs: number;
  windowMs: number;
  maxRecipients: number;
}

export interface ScheduleRequest {
  senderId: number;
  subject: string;
  bodyHtml: string;
  recipients: string[];
  startAt?: string;
  delaySeconds: number;
  hourlyLimit?: number;
}

export interface ScheduleResult {
  campaignId: string;
  scheduled: number;
  duplicatesRemoved: number;
  invalid: string[];
  firstSendAt: string | null;
  lastPlannedAt: string | null;
  hourlyLimit: number;
  replayed: boolean;
}

export interface SlackStatus {
  available: boolean;
  connection: SlackConnection | null;
}
