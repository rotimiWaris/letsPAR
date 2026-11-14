import { useSyncExternalStore } from "react";
import { explainChainError, fetchNextClaim, fetchOpenBags, fetchSpendable, fetchStats, txHash, type ChainBag, type ChainStats } from "./near";
import { parseNear, sameYocto } from "./format";
import { callContract, disconnectWallet, onAccount, showWallet } from "./wallet";

const GAS_CUSHION = 0n;

export interface Notice {
  tone: "idle" | "info" | "refuse" | "swap" | "reclaim" | "error";
  title: string;
  body: string;
  bagId?: string;
  txHash?: string;
}

export interface LogLine {
  id: string;
  text: string;
  tone: "info" | "refuse" | "swap" | "reclaim";
  txHash?: string;
}

export interface Flags {
  posted: boolean;
  refused: boolean;
  swapped: boolean;
  reclaimed: boolean;
}

export type SparkKind = "post" | "refuse" | "swap" | "reclaim";

export interface PendingTx {
  kind: SparkKind;
  bagId?: string;
}

export interface BoardState {
  bags: ChainBag[];
  stats: ChainStats;
  accountId: string | null;
  balance: string | null;
  nextClaimMs: number;
  notice: Notice;
  log: LogLine[];
  flags: Flags;
  spark: SparkKind[];
  pending: PendingTx | null;
  ready: boolean;
  syncing: boolean;
}

const IDLE_NOTICE: Notice = {
  tone: "idle",
  title: "The board is open",
  body: "Post a bag of PAR. An equal match takes 1% from each side. Half is burned and half is a reward for the matchmaker. Unequal and self-matches are refunded. Reclaim returns the whole bag.",
};

const EMPTY_STATS: ChainStats = {
  totalSwapped: "0",
  totalSupply: "0",
  totalBurned: "0",
  totalRewarded: "0",
  swapCount: 0,
  postCount: 0,
  reclaimCount: 0,
  openCount: 0,
};

let state: BoardState = {
  bags: [],
  stats: EMPTY_STATS,
  accountId: null,
  balance: null,
  nextClaimMs: 0,
  notice: IDLE_NOTICE,
  log: [],
  flags: { posted: false, refused: false, swapped: false, reclaimed: false },
  spark: [],
  pending: null,
  ready: false,
  syncing: false,
};

const listeners = new Set<() => void>();
let refreshGen = 0;
let seq = 0;
let chainBags: ChainBag[] = [];
let optimisticBags: ChainBag[] = [];
const hiddenIds = new Set<string>();

function currentBags(): ChainBag[] {
  const fresh = chainBags.filter((bag) => !hiddenIds.has(bag.id));
  for (const id of [...hiddenIds]) {
    if (!chainBags.some((bag) => bag.id === id)) hiddenIds.delete(id);
  }
  const waiting = optimisticBags.filter((bag) => {
    const landed = fresh.some(
      (chainBag) => chainBag.poster === bag.poster && chainBag.amount === bag.amount,
    );
    return !landed;
  });
  optimisticBags = waiting;
  return [...waiting, ...fresh];
}

function emit() {
  for (const listener of listeners) listener();
}

function patch(partial: Partial<BoardState>) {
  state = { ...state, ...partial };
  emit();
}

function nextId(): string {
  seq += 1;
  return `lp_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function pushLog(line: Omit<LogLine, "id">) {
  return [{ ...line, id: nextId() }, ...state.log].slice(0, 8);
}

function pushSpark(kind: SparkKind) {
  return [...state.spark, kind].slice(-18);
}

export function getState(): BoardState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, getState, getState);
}

async function refresh(quiet = false) {
  const gen = ++refreshGen;
  if (!quiet) patch({ syncing: true });
  try {
    const [bags, stats] = await Promise.all([fetchOpenBags(), fetchStats()]);
    if (gen !== refreshGen) return;
    chainBags = bags;
    const accountId = state.accountId;
    let balance = state.balance;
    let nextClaimMs = state.nextClaimMs;
    if (accountId) {
      try {
        [balance, nextClaimMs] = await Promise.all([
          fetchSpendable(accountId),
          fetchNextClaim(accountId),
        ]);
      } catch {
        balance = state.balance;
      }
    }
    if (gen !== refreshGen) return;
    const shown = currentBags();
    const pendingLocal = optimisticBags.length > 0 || hiddenIds.size > 0;
    patch({
      bags: shown,
      stats: pendingLocal
        ? {
            totalSwapped:
              BigInt(stats.totalSwapped) > BigInt(state.stats.totalSwapped)
                ? stats.totalSwapped
                : state.stats.totalSwapped,
            totalSupply: stats.totalSupply || state.stats.totalSupply,
            totalBurned:
              BigInt(stats.totalBurned || "0") > BigInt(state.stats.totalBurned || "0")
                ? stats.totalBurned
                : state.stats.totalBurned,
            totalRewarded:
              BigInt(stats.totalRewarded || "0") > BigInt(state.stats.totalRewarded || "0")
                ? stats.totalRewarded
                : state.stats.totalRewarded,
            swapCount: Math.max(stats.swapCount, state.stats.swapCount),
            postCount: Math.max(stats.postCount, state.stats.postCount),
            reclaimCount: Math.max(stats.reclaimCount, state.stats.reclaimCount),
            openCount: shown.length,
          }
        : stats,
      balance,
      nextClaimMs,
      ready: true,
      syncing: false,
    });
  } catch (error) {
    if (gen !== refreshGen) return;
    patch({
      ready: state.ready,
      syncing: false,
      notice: state.ready
        ? state.notice
        : {
            tone: "error",
            title: "The board could not be read",
            body: explainChainError(error),
          },
    });
  }
}

function bagById(id: string): ChainBag | undefined {
  return state.bags.find((bag) => bag.id === id);
}

function requireAccount(): string | null {
  if (state.accountId) return state.accountId;
  patch({
    notice: {
      tone: "error",
      title: "Connect a testnet wallet",
      body: "The open bags stay visible either way. A wallet is only needed to post, match, or reclaim.",
    },
  });
  showWallet();
  return null;
}

function afford(yocto: string): boolean {
  if (!state.balance) return true;
  return BigInt(state.balance) >= BigInt(yocto) + GAS_CUSHION;
}

async function settle(
  kind: Exclude<SparkKind, "refuse">,
  bagId: string | undefined,
  run: () => Promise<unknown>,
  success: (hash: string | null) => Notice,
  logText: () => string,
  flag: keyof Flags,
) {
  patch({ pending: { kind, bagId } });
  try {
    const outcome = await run();
    const hash = txHash(outcome);
    const notice = success(hash);
    patch({
      pending: null,
      bags: currentBags(),
      notice,
      flags: { ...state.flags, [flag]: true },
      spark: pushSpark(kind),
      log: pushLog({
        tone: kind === "post" ? "info" : kind,
        text: logText(),
        txHash: hash ?? undefined,
      }),
    });
    void refresh(true);
    window.setTimeout(() => void refresh(true), 2500);
    return true;
  } catch (error) {
    patch({
      pending: null,
      bags: currentBags(),
      notice: {
        tone: "error",
        title: "The transaction did not land",
        body: explainChainError(error),
      },
    });
    void refresh(true);
    return false;
  }
}

function rememberPost(accountId: string, amount: string) {
  optimisticBags = [
    {
      id: `opt-${nextId()}`,
      poster: accountId,
      amount,
      createdAt: Date.now(),
    },
    ...optimisticBags,
  ];
  state = {
    ...state,
    stats: { ...state.stats, postCount: state.stats.postCount + 1, openCount: state.stats.openCount + 1 },
  };
}

function hideBag(bagId: string, kind: "swap" | "reclaim", amount: string) {
  hiddenIds.add(bagId);
  optimisticBags = optimisticBags.filter((bag) => bag.id !== bagId);
  state = {
    ...state,
    stats:
      kind === "swap"
        ? {
            ...state.stats,
            swapCount: state.stats.swapCount + 1,
            totalSwapped: (BigInt(state.stats.totalSwapped) + BigInt(amount)).toString(),
            totalBurned: (BigInt(state.stats.totalBurned) + BigInt(amount) / 100n).toString(),
            totalRewarded: (BigInt(state.stats.totalRewarded) + BigInt(amount) / 100n).toString(),
            openCount: Math.max(0, state.stats.openCount - 1),
          }
        : {
            ...state.stats,
            reclaimCount: state.stats.reclaimCount + 1,
            openCount: Math.max(0, state.stats.openCount - 1),
          },
  };
}

export const actions = {
  refresh() {
    void refresh();
  },
  connect() {
    showWallet();
  },
  async disconnect() {
    await disconnectWallet();
  },
  async post(raw: string): Promise<boolean> {
    const parsed = parseNear(raw);
    if (!parsed.ok) {
      patch({ notice: { tone: "error", title: "That amount does not post", body: parsed.text } });
      return false;
    }
    const accountId = requireAccount();
    if (!accountId) return false;
    if (state.pending) {
      patch({
        notice: {
          tone: "error",
          title: "A transaction is still open",
          body: "Wait for the wallet to finish, then post the next bag.",
        },
      });
      return false;
    }
    if (!afford(parsed.yocto)) {
      patch({
        notice: {
          tone: "error",
          title: "Not enough PAR in this wallet",
          body: "Claim from the faucet if this account has not yet, then post again. Gas is still paid in testnet NEAR.",
        },
      });
      return false;
    }
    patch({
      pending: { kind: "post" },
      notice: {
        tone: "info",
        title: "Confirm the post in your wallet",
        body: "Confirm the transfer in your wallet. The PAR becomes the open bag when the transaction lands.",
      },
    });
    return settle(
      "post",
      undefined,
      async () => {
        const outcome = await callContract(accountId, "post", {}, parsed.yocto);
        rememberPost(accountId, parsed.yocto);
        return outcome;
      },
      (hash) => ({
        tone: "info",
        title: "The bag is on the board",
        body: "That PAR left your balance and is waiting for an equal match.",
        txHash: hash ?? undefined,
      }),
      () => "Posted a bag into escrow.",
      "posted",
    );
  },
  async match(bagId: string, raw: string): Promise<boolean> {
    const parsed = parseNear(raw);
    if (!parsed.ok) {
      patch({
        notice: { tone: "error", title: "That amount does not post", body: parsed.text, bagId },
      });
      return false;
    }
    const bag = bagById(bagId);
    if (!bag) {
      patch({
        notice: {
          tone: "error",
          title: "That bag is gone",
          body: "It was matched or taken back. The open list is current.",
          bagId,
        },
      });
      return false;
    }
    const accountId = requireAccount();
    if (!accountId) return false;
    if (accountId === bag.poster) {
      patch({
        notice: {
          tone: "error",
          title: "This bag is already yours",
          body: "Take the whole amount back, or let someone else match it.",
          bagId,
        },
      });
      return false;
    }
    if (!sameYocto(parsed.yocto, bag.amount)) {
      patch({
        flags: { ...state.flags, refused: true },
        spark: pushSpark("refuse"),
        log: pushLog({
          tone: "refuse",
          text: `Offered an unequal amount against bag ${bagId}. Refused before it was sent.`,
        }),
        notice: {
          tone: "refuse",
          title: "Unequal amounts do not match",
          body: "The contract only accepts the exact bag amount, so this was not sent. Balances stay, and the bag stays open.",
          bagId,
        },
      });
      return false;
    }
    if (state.pending) {
      patch({
        notice: {
          tone: "error",
          title: "A transaction is still open",
          body: "One match at a time, so the bags stay easy to follow.",
          bagId,
        },
      });
      return false;
    }
    if (!afford(parsed.yocto)) {
      patch({
        notice: {
          tone: "error",
          title: "Not enough PAR to match this bag",
          body: "The wallet has to hold the same amount of PAR. Testnet NEAR is only used for gas. The bag stays where it is.",
          bagId,
        },
      });
      return false;
    }
    patch({
      pending: { kind: "swap", bagId },
      notice: {
        tone: "swap",
        title: "Equal amount. Confirm the swap.",
        body: "1% comes off each side. Half is burned, and half is your reward as the matchmaker. A mismatch is refunded.",
        bagId,
      },
    });
    return settle(
      "swap",
      bagId,
      async () => {
        const outcome = await callContract(accountId, "match_bag", { bag_id: Number(bagId) }, parsed.yocto);
        hideBag(bagId, "swap", bag.amount);
        return outcome;
      },
      (hash) => ({
        tone: "swap",
        title: "The bags swapped",
        body: "The poster received 99%. The matchmaker received 99% plus the other 1% as a reward. The remaining 1% was burned.",
        bagId,
        txHash: hash ?? undefined,
      }),
      () => `Matched bag ${bagId}. The bags swapped.`,
      "swapped",
    );
  },
  async claim() {
    const accountId = requireAccount();
    if (!accountId || state.pending) return;
    patch({
      pending: { kind: "post" },
      notice: {
        tone: "info",
        title: "Claiming 100 PAR",
        body: "The faucet pays 100 PAR, then again after 3 hours. This transaction also registers storage if the account is new.",
      },
    });
    try {
      const outcome = await callContract(accountId, "claim", {}, "0");
      patch({
        pending: null,
        notice: {
          tone: "info",
          title: "100 PAR claimed",
          body: "The balance updates as soon as the chain shows it. The next claim from this account opens in 3 hours.",
          txHash: txHash(outcome) ?? undefined,
        },
      });
      void refresh(true);
    } catch (error) {
      patch({
        pending: null,
        notice: {
          tone: "error",
          title: "The faucet did not pay",
          body: explainChainError(error),
        },
      });
    }
  },
  async reclaim(bagId: string) {
    const bag = bagById(bagId);
    const accountId = requireAccount();
    if (!accountId || !bag) return;
    if (accountId !== bag.poster) {
      patch({
        notice: {
          tone: "error",
          title: "Only the poster can take it back",
          body: "Match the amount exactly, or leave it for its owner.",
          bagId,
        },
      });
      return;
    }
    if (state.pending) return;
    patch({
      pending: { kind: "reclaim", bagId },
      notice: {
        tone: "reclaim",
        title: "Confirm the reclaim",
        body: "The whole bag comes back. Waiting does not skim it.",
        bagId,
      },
    });
    await settle(
      "reclaim",
      bagId,
      async () => {
        const outcome = await callContract(accountId, "reclaim", { bag_id: Number(bagId) }, "0");
        hideBag(bagId, "reclaim", bag.amount);
        return outcome;
      },
      (hash) => ({
        tone: "reclaim",
        title: "The whole bag came back",
        body: "The whole bag is back with the poster. Nothing was burned and no reward was paid.",
        bagId,
        txHash: hash ?? undefined,
      }),
      () => `Reclaimed bag ${bagId} whole.`,
      "reclaimed",
    );
  },
};

onAccount((accountId) => {
  patch({ accountId, balance: null });
  void refresh(true);
});

void refresh();
window.setInterval(() => {
  if (document.visibilityState === "hidden") return;
  void refresh(true);
}, 15000);
