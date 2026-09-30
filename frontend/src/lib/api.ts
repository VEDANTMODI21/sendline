import { http } from './http';
import type {
  AppConfig, EmailDetail, EmailPage, EmailStatus, Folder, Overview, ScheduleRequest, ScheduleResult, Sender, SlackStatus, User,
} from '@/types/api';

export const api = {
  me: () => http.get<User>('/api/me'),
  logout: () => http.post<void>('/auth/logout'),
  config: () => http.get<AppConfig>('/api/config'),
  senders: () => http.get<Sender[]>('/api/senders'),
  overview: () => http.get<Overview>('/api/overview'),

  emails: (p: { folder: Folder; q?: string; status?: EmailStatus[]; cursor?: string | null; limit?: number }) => {
    const qs = new URLSearchParams({ folder: p.folder, limit: String(p.limit ?? 30) });
    if (p.q) qs.set('q', p.q);
    if (p.status?.length) qs.set('status', p.status.join(','));
    if (p.cursor) qs.set('cursor', p.cursor);
    return http.get<EmailPage>(`/api/emails?${qs}`);
  },
  email: (id: string) => http.get<EmailDetail>(`/api/emails/${id}`),
  cancelEmail: (id: string) => http.post<{ ok: true }>(`/api/emails/${id}/cancel`),

  schedule: (body: ScheduleRequest, idempotencyKey: string) =>
    http.post<ScheduleResult>('/api/campaigns', body as unknown as Record<string, unknown>, { 'Idempotency-Key': idempotencyKey }),

  slack: () => http.get<SlackStatus>('/api/integrations/slack'),
  slackTest: () => http.post<{ ok: true }>('/api/integrations/slack/test'),
  slackDisconnect: () => http.del<void>('/api/integrations/slack'),
};

/** Full-page navigations (OAuth needs real redirects, not fetch). */
export const links = {
  googleLogin: '/auth/google',
  slackInstall: '/api/integrations/slack/install',
  queueBoard: '/admin/queues',
};
