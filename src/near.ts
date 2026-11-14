import { CONTRACT_ID } from "./config";

const RPCS = [
  "https://rpc.testnet.fastnear.com",
  "https://test.rpc.fastnear.com",
  "https://archival-rpc.testnet.near.org",
];

let rpcCursor = 0;

export interface ChainBag {
  id: string;
  poster: string;
  amount: string;
  createdAt: number;
}

export interface ChainStats {
  totalSwapped: string;
  totalSupply: string;
  totalBurned: string;
  totalRewarded: string;
  swapCount: number;
  postCount: number;
  reclaimCount: number;
  openCount: number;
}

interface BagJson {
  bag_id: number;
  poster: string;
  amount: string;
  created_at_ms: number;
}

interface StatsJson {
  total_swapped: string;
  total_supply?: string;
  total_burned?: string;
  total_rewarded?: string;
  swap_count: number;
  post_count: number;
  reclaim_count: number;
  open_count: number;
}

function rpcErrorMessage(error: { message?: string; data?: unknown; code?: number }): string {
  if (typeof error.data === "string" && error.data) return error.data;
  return error.message || "The testnet RPC rejected the query.";
}

function isTransportFailure(error: { message?: string; code?: number }, status: number): boolean {
  if (status === 429 || status >= 500) return true;
  const message = error.message || "";
  return error.code === -429 || /deprecated|rate|too many|timeout|temporarily/i.test(message);
}

async function rpcOnce<T>(url: string, method: string, params: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "letspar", method, params }),
  });
  const body = (await response.json().catch(() => null)) as {
    result?: T;
    error?: { message?: string; data?: unknown; code?: number };
  } | null;
  if (!body) throw new Error(`The testnet RPC returned ${response.status}.`);
  if (body.error) {
    if (!response.ok || isTransportFailure(body.error, response.status)) {
      throw new Error(rpcErrorMessage(body.error));
    }
    throw Object.assign(new Error(rpcErrorMessage(body.error)), { contract: true });
  }
  if (!response.ok) throw new Error(`The testnet RPC returned ${response.status}.`);
  return body.result as T;
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RPCS.length; attempt += 1) {
    const index = (rpcCursor + attempt) % RPCS.length;
    try {
      const result = await rpcOnce<T>(RPCS[index], method, params);
      rpcCursor = index;
      return result;
    } catch (error) {
      if (error && typeof error === "object" && "contract" in error) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The testnet network did not answer.");
}

function decodeResult(bytes: number[]): unknown {
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  return JSON.parse(text) as unknown;
}

export async function fetchOpenBags(): Promise<ChainBag[]> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    account_id: CONTRACT_ID,
    method_name: "get_open_bags",
    args_base64: btoa(JSON.stringify({ from_index: 0, limit: 50 })),
    finality: "optimistic",
  });
  const bags = decodeResult(result.result) as BagJson[];
  return bags
    .map((bag) => ({
      id: String(bag.bag_id),
      poster: bag.poster,
      amount: bag.amount,
      createdAt: bag.created_at_ms,
    }))
    .reverse();
}

export async function fetchStats(): Promise<ChainStats> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    account_id: CONTRACT_ID,
    method_name: "get_stats",
    args_base64: btoa("{}"),
    finality: "optimistic",
  });
  const stats = decodeResult(result.result) as StatsJson;
  return {
    totalSwapped: stats.total_swapped,
    totalSupply: stats.total_supply ?? "0",
    totalBurned: stats.total_burned ?? "0",
    totalRewarded: stats.total_rewarded ?? "0",
    swapCount: stats.swap_count,
    postCount: stats.post_count,
    reclaimCount: stats.reclaim_count,
    openCount: stats.open_count,
  };
}

export async function fetchNextClaim(accountId: string): Promise<number> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    account_id: CONTRACT_ID,
    method_name: "next_claim_ms",
    args_base64: btoa(JSON.stringify({ account_id: accountId })),
    finality: "optimistic",
  });
  const value = decodeResult(result.result);
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : 0;
}

export async function fetchSpendable(accountId: string): Promise<string> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    account_id: CONTRACT_ID,
    method_name: "ft_balance_of",
    args_base64: btoa(JSON.stringify({ account_id: accountId })),
    finality: "optimistic",
  });
  const balance = decodeResult(result.result);
  return typeof balance === "string" ? balance : "0";
}

export function txHash(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== "object") return null;
  const record = outcome as {
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
  };
  return record.transaction?.hash || record.transaction_outcome?.id || null;
}

export function explainChainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const panic = raw.match(/Smart contract panicked: ([^\n"]+)/);
  if (panic?.[1]) return panic[1].replace(/\\"/g, "").trim();
  if (/failed to fetch|networkerror|load failed|did not answer/i.test(raw)) {
    return "The testnet network did not answer. The board will try again.";
  }
  if (/reject|cancel|denied|closed the prompt/i.test(raw)) {
    return "The wallet closed before the transaction was sent.";
  }
  if (raw.length > 240) return `${raw.slice(0, 240)}…`;
  return raw || "The transaction failed.";
}
