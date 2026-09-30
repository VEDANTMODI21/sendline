import { db } from '../../infra/postgres';
import type { GoogleProfile } from './google';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export async function upsertFromGoogle(p: GoogleProfile): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (google_sub, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, last_login_at = now()
     RETURNING id, email, name, avatar_url`,
    [p.sub, p.email, p.name, p.picture ?? null],
  );
  return rows[0];
}

export async function findUser(id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>('SELECT id, email, name, avatar_url FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}
