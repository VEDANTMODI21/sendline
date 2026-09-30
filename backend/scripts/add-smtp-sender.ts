/**
 * Adds an SMTP identity to the sender pool (e.g. an extra Ethereal inbox, or a local sink).
 *   npx tsx scripts/add-smtp-sender.ts <email> <user> <pass> [host] [port] [displayName]
 */
import { insertSender } from '../src/modules/senders/senders.repo';
import { db } from '../src/infra/postgres';
import { migrate } from '../src/db/migrate';

async function run() {
  const [email, user, pass, host = 'smtp.ethereal.email', port = '587', name = 'Sendline'] = process.argv.slice(2);
  if (!email || !user || !pass) throw new Error('usage: add-smtp-sender <email> <user> <pass> [host] [port] [displayName]');
  await migrate();
  await insertSender({ email, user, pass, host, port: Number(port), displayName: name });
  console.log(`sender ${email} added`);
  await db.end();
}
run().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
