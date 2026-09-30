import { db } from '../../infra/postgres';
import { seal, unseal } from '../../infra/crypto';

export interface Sender {
  id: number;
  email: string;
  displayName: string;
  smtp: { host: string; port: number; user: string; pass: string };
}

interface Row {
  id: number;
  email: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass_enc: string;
}

const toSender = (r: Row): Sender => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  smtp: { host: r.smtp_host, port: r.smtp_port, user: r.smtp_user, pass: unseal(r.smtp_pass_enc) },
});

export async function listSenders(): Promise<Sender[]> {
  const { rows } = await db.query<Row>('SELECT * FROM senders ORDER BY id');
  return rows.map(toSender);
}

export async function getSender(id: number): Promise<Sender | null> {
  const { rows } = await db.query<Row>('SELECT * FROM senders WHERE id = $1', [id]);
  return rows[0] ? toSender(rows[0]) : null;
}

export async function insertSender(s: { email: string; displayName: string; host: string; port: number; user: string; pass: string }) {
  await db.query(
    `INSERT INTO senders (email, display_name, smtp_host, smtp_port, smtp_user, smtp_pass_enc)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`,
    [s.email, s.displayName, s.host, s.port, s.user, seal(s.pass)],
  );
}

export async function countSenders(): Promise<number> {
  const { rows } = await db.query<{ n: string }>('SELECT count(*) AS n FROM senders');
  return Number(rows[0].n);
}
