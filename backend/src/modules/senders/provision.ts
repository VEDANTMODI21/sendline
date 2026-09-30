import { env } from '../../config/env';
import { withAdvisoryLock } from '../../infra/postgres';
import { logger, errMsg } from '../../infra/logger';
import { countSenders, insertSender } from './senders.repo';

const log = logger('senders');
const PROVISION_LOCK = 0x5e_4d_5e_4d;

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number };
}

/**
 * Creates one fresh Ethereal inbox via the public API.
 * (nodemailer.createTestAccount() caches its first result per process, so calling it in a loop
 * returns the same inbox every time — we call the API directly to get distinct senders.)
 */
async function createEtherealAccount(): Promise<EtherealAccount> {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestor: 'sendline', version: '1.0.0' }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as Partial<EtherealAccount> & { status?: string; error?: string };
  if (!res.ok || data.status !== 'success' || !data.user || !data.pass || !data.smtp) {
    throw new Error(data.error ?? `Ethereal API responded ${res.status}`);
  }
  return { user: data.user, pass: data.pass, smtp: { host: data.smtp.host, port: data.smtp.port } };
}

// Friendly names so the From dropdown reads like real mailboxes.
const PERSONAS = ['Outreach Desk', 'Growth Team', 'Partnerships', 'Founders Office', 'Customer Success'];

/**
 * Makes sure the sender pool exists:
 *  1. accounts listed in ETHEREAL_ACCOUNTS ("user:pass,user:pass") are upserted;
 *  2. if the pool is still smaller than ETHEREAL_AUTO_PROVISION, fresh Ethereal inboxes are created.
 * An advisory lock stops two booting instances from both creating accounts.
 */
export async function ensureSenderPool() {
  await withAdvisoryLock(PROVISION_LOCK, async () => {
    const listed = env.ethereal.accounts.split(',').map((s) => s.trim()).filter(Boolean);
    for (const [i, pair] of listed.entries()) {
      const idx = pair.indexOf(':');
      if (idx < 1) {
        log.warn('ignoring malformed ETHEREAL_ACCOUNTS entry (expected user:pass)');
        continue;
      }
      const user = pair.slice(0, idx);
      await insertSender({ email: user, displayName: PERSONAS[i % PERSONAS.length], host: 'smtp.ethereal.email', port: 587, user, pass: pair.slice(idx + 1) });
    }

    let have = await countSenders();
    // Bounded: a misbehaving API (or duplicate accounts) can never spin this loop forever.
    for (let attempt = 0; have < env.ethereal.autoProvision && attempt < env.ethereal.autoProvision + 3; attempt++) {
      try {
        const acct = await createEtherealAccount();
        await insertSender({
          email: acct.user,
          displayName: PERSONAS[have % PERSONAS.length],
          host: acct.smtp.host,
          port: acct.smtp.port,
          user: acct.user,
          pass: acct.pass,
        });
        const now = await countSenders();
        if (now > have) log.info('created Ethereal sender', { email: acct.user });
        else log.warn('Ethereal returned an inbox we already have; retrying', { email: acct.user });
        have = now;
      } catch (e) {
        log.error('could not create Ethereal account (is api.nodemailer.com reachable?)', { err: errMsg(e) });
        break;
      }
    }
    log.info(`sender pool ready (${have})`);
  });
}
