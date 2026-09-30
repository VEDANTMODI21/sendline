import { Client } from '@elastic/elasticsearch';
import { env } from '../../config/env';
import { db } from '../../infra/postgres';
import { logger, errMsg } from '../../infra/logger';

/**
 * Elasticsearch is the read-optimised search side. every document is derived from Postgres rows:
 * every write here is best-effort, and search falls back to Postgres ILIKE when ES is down.
 */
const log = logger('search');
const INDEX = env.elastic.index;

export const es = new Client({
  node: env.elastic.url,
  auth: env.elastic.apiKey ? { apiKey: env.elastic.apiKey } : undefined,
  requestTimeout: 5_000,
  maxRetries: 1,
});

let healthy = false;
let lastWarn = 0;
export const searchHealthy = () => healthy;

/** Log ES outages once a minute instead of once per email. */
function degraded(msg: string, meta: Record<string, unknown>) {
  healthy = false;
  if (Date.now() - lastWarn > 60_000) {
    lastWarn = Date.now();
    log.warn(msg, meta);
  }
}

export async function initSearch() {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        settings: {
          analysis: {
            analyzer: { email_addr: { type: 'custom', tokenizer: 'uax_url_email', filter: ['lowercase'] } },
          },
        },
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            campaign_id: { type: 'keyword' },
            recipient: { type: 'text', analyzer: 'email_addr', fields: { raw: { type: 'keyword' }, words: { type: 'text' } } },
            sender: { type: 'keyword' },
            subject: { type: 'text', fields: { raw: { type: 'keyword', ignore_above: 256 } } },
            body_text: { type: 'text' },
            status: { type: 'keyword' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
          },
        },
      });
      log.info(`created index ${INDEX}`);
      healthy = true;
      void backfill();
    }
    healthy = true;
  } catch (e) {
    degraded('Elasticsearch unavailable — search will fall back to Postgres', { err: errMsg(e) });
  }
}

interface DocSource {
  id: string;
  user_id: string;
  campaign_id: string;
  recipient: string;
  sender: string;
  subject: string;
  body_text: string;
  status: string;
  scheduled_at: Date | string;
  sent_at: Date | string | null;
}

const SELECT_DOCS = `
  SELECT e.id, e.user_id, e.campaign_id, e.recipient, s.email AS sender, c.subject, c.body_text,
         e.status, e.scheduled_at, e.sent_at
    FROM emails e JOIN campaigns c ON c.id = e.campaign_id JOIN senders s ON s.id = e.sender_id
   WHERE e.id = ANY($1::uuid[])`;

/** Re-reads rows from Postgres and bulk-upserts them, so ES can never hold a state PG never had. */
export async function syncToIndex(ids: string[]) {
  if (!ids.length) return;
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      const { rows } = await db.query<DocSource>(SELECT_DOCS, [ids.slice(i, i + 1000)]);
      if (!rows.length) continue;
      const ops = rows.flatMap(({ id, ...doc }) => [{ index: { _index: INDEX, _id: id } }, doc]);
      const res = await es.bulk({ operations: ops, refresh: false });
      if (res.errors) log.warn('bulk index reported item errors');
    }
    healthy = true;
  } catch (e) {
    degraded('index sync skipped (Elasticsearch unreachable)', { err: errMsg(e), count: ids.length });
  }
}

export const syncOne = (id: string) => syncToIndex([id]);

/** Fresh index (first boot, or ES volume wiped): rebuild it from Postgres in the background. */
export async function backfill() {
  let after: string | null = null;
  let total = 0;
  for (;;) {
    const { rows }: { rows: { id: string }[] } = await db.query(
      'SELECT id FROM emails WHERE ($1::uuid IS NULL OR id > $1) ORDER BY id LIMIT 1000',
      [after],
    );
    if (!rows.length) break;
    await syncToIndex(rows.map((r) => r.id));
    after = rows[rows.length - 1].id;
    total += rows.length;
  }
  if (total) log.info(`backfilled ${total} emails into ${INDEX}`);
}

/** Returns matching email ids ordered by relevance, or null if ES could not answer. */
export async function searchIds(userId: string, q: string, statuses: string[]): Promise<string[] | null> {
  try {
    const res = await es.search<unknown>({
      index: INDEX,
      size: 200,
      _source: false,
      query: {
        bool: {
          filter: [{ term: { user_id: userId } }, { terms: { status: statuses } }],
          should: [
            // typo-tolerant on prose…
            { multi_match: { query: q, fields: ['subject^3', 'body_text'], fuzziness: 'AUTO', prefix_length: 1 } },
            // …search-as-you-type everywhere…
            { multi_match: { query: q, type: 'phrase_prefix', fields: ['subject^3', 'body_text', 'recipient.words^2'] } },
            // …but addresses match exactly or by substring, never fuzzily (lead7 ≠ lead8).
            { match: { recipient: { query: q, boost: 4 } } },
            { wildcard: { 'recipient.raw': { value: `*${q.toLowerCase().replace(/[*?\\]/g, '')}*`, case_insensitive: true } } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    healthy = true;
    return res.hits.hits.map((h) => String(h._id));
  } catch (e) {
    degraded('search failed, falling back to Postgres', { err: errMsg(e) });
    return null;
  }
}
