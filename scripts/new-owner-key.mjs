// One-time founder setup: creates an OWNER_KEY passphrase, stores it in Vercel (production, sensitive),
// and prints it once so you can unlock Owner mode in the app. Run: npm run owner:key
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const bytes = randomBytes(24);
const key = 'bandit-' + [...bytes].map(b => alphabet[b % alphabet.length]).join('').match(/.{1,6}/g).join('-');
const res = spawnSync('vercel', ['env', 'add', 'OWNER_KEY', 'production', '--sensitive', '--yes'], { input: key, stdio: ['pipe', 'inherit', 'inherit'] });
if (res.status !== 0) { console.error('\nCould not add OWNER_KEY to Vercel.'); process.exit(1); }
writeFileSync(new URL('../.owner-key.txt', import.meta.url), key + '\n', { mode: 0o600 });
console.log(`\nYour owner key (also saved to .owner-key.txt, gitignored):\n\n  ${key}\n\nPaste it into BANDIT > Agent > Owner mode. Keep it private.`);
