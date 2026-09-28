// One-time founder setup: creates a fresh wallet for the BANDIT agent and stores its private key in Vercel
// (production, sensitive) without printing it. A private copy is saved to .agent-wallet.json (gitignored)
// so you can import it into Rabby later to withdraw leftover funds. Run: npm run agent:wallet
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const file = new URL('../.agent-wallet.json', import.meta.url);
if (existsSync(file)) {
  console.error('An agent wallet already exists in .agent-wallet.json. Delete that file first if you really want a new one.');
  process.exit(1);
}
const privateKey = generatePrivateKey();
const { address } = privateKeyToAccount(privateKey);
writeFileSync(file, JSON.stringify({ address, privateKey, createdAt: new Date().toISOString(), note: 'BANDIT agent wallet. Keep private. Import into Rabby to withdraw leftover funds.' }, null, 2), { mode: 0o600 });

const res = spawnSync('vercel', ['env', 'add', 'AGENT_PRIVATE_KEY', 'production', '--sensitive', '--yes'], { input: privateKey, stdio: ['pipe', 'inherit', 'inherit'] });
if (res.status !== 0) {
  console.error('\nCould not add AGENT_PRIVATE_KEY to Vercel. The key is saved in .agent-wallet.json; add it with: vercel env add AGENT_PRIVATE_KEY production --sensitive');
  process.exit(1);
}
console.log(`\nAgent wallet created: ${address}`);
console.log('The private key is stored in Vercel (sensitive) and in .agent-wallet.json on this machine only.');
console.log('Next: send about $40 of ETH on Robinhood Chain (chain 4663) to that address.');
