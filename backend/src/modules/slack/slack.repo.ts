import { db } from '../../infra/postgres';
import { seal, unseal } from '../../infra/crypto';

export interface SlackConnection {
  teamName: string;
  channelName: string;
  connectedAt: string;
}

export async function saveConnection(userId: string, c: { teamId: string; teamName: string; channel: string; webhookUrl: string }) {
  await db.query(
    `INSERT INTO slack_connections (user_id, team_id, team_name, channel_name, webhook_enc)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET team_id = $2, team_name = $3, channel_name = $4, webhook_enc = $5, connected_at = now()`,
    [userId, c.teamId, c.teamName, c.channel, seal(c.webhookUrl)],
  );
}

export async function getConnection(userId: string): Promise<SlackConnection | null> {
  const { rows } = await db.query<SlackConnection>(
    `SELECT team_name AS "teamName", channel_name AS "channelName", connected_at AS "connectedAt"
       FROM slack_connections WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Read at send time (never cached) → connect/disconnect takes effect without a redeploy. */
export async function getWebhook(userId: string): Promise<string | null> {
  const { rows } = await db.query<{ webhook_enc: string }>('SELECT webhook_enc FROM slack_connections WHERE user_id = $1', [userId]);
  return rows[0] ? unseal(rows[0].webhook_enc) : null;
}

export async function deleteConnection(userId: string) {
  await db.query('DELETE FROM slack_connections WHERE user_id = $1', [userId]);
}
