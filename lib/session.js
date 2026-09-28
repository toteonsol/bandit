// Wallet sign-in for "My agent": the visitor signs a free message (no gas, no funds), the server verifies it
// and issues a short-lived HMAC session token. Nothing is stored in the browser but that token.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyMessage, getAddress } from 'viem';
import { redis } from './store.js';

const SESSION_DAYS = 7;
const secret = () => createHmac('sha256', 'bandit-session-v1').update(String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.OWNER_KEY || '')).digest();

export const signInMessage = (address, nonce) =>
  `Sign in to BANDIT\n\nThis creates your personal BANDIT agent. It costs nothing and moves no funds.\n\nAddress: ${address}\nNonce: ${nonce}`;

export async function issueNonce(address) {
  const addr = getAddress(address);
  const nonce = randomBytes(12).toString('hex');
  await redis('SET', `bandit:nonce:${nonce}`, addr, 'EX', 600);
  return { nonce, message: signInMessage(addr, nonce) };
}

export async function verifySignIn({ address, nonce, signature }) {
  const addr = getAddress(address);
  const stored = await redis('GET', `bandit:nonce:${nonce}`);
  if (!stored || stored !== addr) throw new Error('That sign-in request expired. Try again.');
  const ok = await verifyMessage({ address: addr, message: signInMessage(addr, nonce), signature });
  if (!ok) throw new Error('The signature did not match this wallet.');
  await redis('DEL', `bandit:nonce:${nonce}`);
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const body = `${addr}.${exp}`;
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return { token: `${body}.${mac}`, address: addr, expires: new Date(exp).toISOString() };
}

// Returns the signed-in address, or null.
export function sessionAddress(request) {
  const token = request.headers.get('x-bandit-session') || '';
  const [addr, exp, mac] = token.split('.');
  if (!addr || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = Buffer.from(createHmac('sha256', secret()).update(`${addr}.${exp}`).digest('base64url'));
  const got = Buffer.from(mac);
  return got.length === want.length && timingSafeEqual(got, want) ? addr : null;
}
