export const NETWORK_ID = "testnet" as const;

export const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID || "par3.letspar-23ec4110.testnet").trim();

export const STORAGE_DEPOSIT = (2n * 10n ** 21n).toString();

export const EXPLORER_URL = "https://testnet.nearblocks.io";

export const GAS_POST = (150n * 10n ** 12n).toString();
export const GAS_MATCH = (150n * 10n ** 12n).toString();
export const GAS_RECLAIM = (50n * 10n ** 12n).toString();
export const GAS_STORAGE = (30n * 10n ** 12n).toString();
export const GAS_CLAIM = (40n * 10n ** 12n).toString();

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/txns/${hash}`;
}

export function accountUrl(accountId: string): string {
  return `${EXPLORER_URL}/address/${accountId}`;
}
