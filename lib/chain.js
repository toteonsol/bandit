// Robinhood Chain (chain id 4663) clients. The agent key is read from AGENT_PRIVATE_KEY on the server only;
// it is never logged, returned, or sent to the browser.
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
export const EXPLORER = 'https://robinhoodchain.blockscout.com';

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } },
});

export const publicClient = createPublicClient({ chain: robinhood, transport: http(RPC_URL, { timeout: 15_000 }) });

let cachedAccount;
export function agentAccount() {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = (process.env.AGENT_PRIVATE_KEY || '').trim();
  if (!raw) return (cachedAccount = null);
  try {
    cachedAccount = privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  } catch {
    throw new Error('AGENT_PRIVATE_KEY is set but is not a valid private key.');
  }
  return cachedAccount;
}

export function agentAddress() {
  try { return agentAccount()?.address || null; } catch { return null; }
}

export const walletClient = () => createWalletClient({ account: agentAccount(), chain: robinhood, transport: http(RPC_URL, { timeout: 20_000 }) });

export const ethBalance = address => publicClient.getBalance({ address });
export const tokenBalance = (token, owner) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
export const tokenAllowance = (token, owner, spender) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });

const decimalsCache = new Map();
export async function tokenDecimals(token) {
  const key = token.toLowerCase();
  if (!decimalsCache.has(key)) {
    decimalsCache.set(key, publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }).then(Number).catch(() => 18));
  }
  return decimalsCache.get(key);
}

export const txUrl = hash => `${EXPLORER}/tx/${hash}`;
export const addressUrl = address => `${EXPLORER}/address/${address}`;

// Wallet params for wallet_addEthereumChain, shared with the browser for "Trade with BANDIT".
export const WALLET_CHAIN = {
  chainId: '0x1237',
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: [EXPLORER],
};
