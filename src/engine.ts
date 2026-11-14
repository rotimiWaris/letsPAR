export interface Holder {
  id: string;
  name: string;
  balance: number;
}

export interface OpenBag {
  id: string;
  ownerId: string;
  amount: number;
  postedAt: number;
}

export interface PendingSwap {
  bagId: string;
  matcherId: string;
  amount: number;
}

export interface Flags {
  posted: boolean;
  refused: boolean;
  swapped: boolean;
  reclaimed: boolean;
}

export interface LogLine {
  id: string;
  text: string;
  tone: "info" | "refuse" | "swap" | "reclaim";
}

export interface Notice {
  tone: "idle" | "info" | "refuse" | "swap" | "reclaim" | "error";
  title: string;
  body: string;
  bagId?: string;
}

export interface SparkPoint {
  kind: "post" | "refuse" | "swap" | "reclaim";
}

export interface Counts {
  posts: number;
  refuses: number;
  swaps: number;
  reclaims: number;
}

export interface BoardState {
  holders: Holder[];
  bags: OpenBag[];
  activeId: string;
  connectedId: string | null;
  pending: PendingSwap | null;
  notice: Notice;
  log: LogLine[];
  flags: Flags;
  spark: SparkPoint[];
  counts: Counts;
}

export interface EngineCtx {
  uid: () => string;
  now: () => number;
}

export const IDLE_NOTICE: Notice = {
  tone: "idle",
  title: "The board is open",
  body: "Post a bag. Try a different amount and watch it fail. Match the same amount and the bags swap. Leave one unmatched and take it back whole.",
};

const EMPTY_FLAGS: Flags = {
  posted: false,
  refused: false,
  swapped: false,
  reclaimed: false,
};

export function seedState(): BoardState {
  return {
    holders: [
      { id: "ada.letspar.testnet", name: "Ada", balance: 2400 },
      { id: "bao.letspar.testnet", name: "Bao", balance: 1800 },
      { id: "cleo.letspar.testnet", name: "Cleo", balance: 960 },
    ],
    bags: [],
    activeId: "ada.letspar.testnet",
    connectedId: null,
    pending: null,
    notice: IDLE_NOTICE,
    log: [],
    flags: { ...EMPTY_FLAGS },
    spark: [],
    counts: { posts: 0, refuses: 0, swaps: 0, reclaims: 0 },
  };
}

export function holderById(state: BoardState, id: string): Holder | undefined {
  return state.holders.find((h) => h.id === id);
}

export function bagById(state: BoardState, id: string): OpenBag | undefined {
  return state.bags.find((b) => b.id === id);
}

export function lockedOf(state: BoardState, id: string): number {
  const sitting = state.bags
    .filter((b) => b.ownerId === id)
    .reduce((sum, b) => sum + b.amount, 0);
  const inflight = state.pending?.matcherId === id ? state.pending.amount : 0;
  return sitting + inflight;
}

export function escrowTotal(state: BoardState): number {
  const sitting = state.bags.reduce((sum, b) => sum + b.amount, 0);
  return sitting + (state.pending?.amount ?? 0);
}

function credit(holders: Holder[], id: string, delta: number): Holder[] {
  return holders.map((h) => (h.id === id ? { ...h, balance: h.balance + delta } : h));
}

function withLog(state: BoardState, line: LogLine): LogLine[] {
  return [line, ...state.log].slice(0, 10);
}

function withSpark(state: BoardState, kind: SparkPoint["kind"]): SparkPoint[] {
  return [...state.spark, { kind }].slice(-18);
}

export function setActive(state: BoardState, id: string): BoardState {
  if (!holderById(state, id)) return state;
  return { ...state, activeId: id };
}

export function connectAccount(state: BoardState, id: string, name: string): BoardState {
  const existing = holderById(state, id);
  if (existing) {
    return { ...state, activeId: id, connectedId: id };
  }
  if (state.holders.length >= 8) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "This board is full",
        body: "Eight holders are enough for the demo. Reset the board to start clean.",
      },
    };
  }
  const holder: Holder = { id, name, balance: 1200 };
  return {
    ...state,
    holders: [...state.holders, holder],
    activeId: id,
    connectedId: id,
    notice: {
      tone: "info",
      title: `${name} is on the board`,
      body: `${id} starts with 1,200 LetsPAR in this browser. Nothing has been sent to a chain.`,
    },
  };
}

export function disconnectAccount(state: BoardState): BoardState {
  return { ...state, connectedId: null };
}

export function postBag(state: BoardState, amount: number, ctx: EngineCtx): BoardState {
  const actor = holderById(state, state.activeId);
  if (!actor) return state;
  if (state.pending) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "A swap is still settling",
        body: "Wait for the bags to change hands, then post the next one.",
      },
    };
  }
  if (actor.balance < amount) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: `${actor.name} does not have ${amount.toLocaleString("en-US")}`,
        body: `Spendable balance is ${actor.balance.toLocaleString("en-US")} LetsPAR. The bag was not posted.`,
      },
    };
  }
  const bag: OpenBag = {
    id: ctx.uid(),
    ownerId: actor.id,
    amount,
    postedAt: ctx.now(),
  };
  return {
    ...state,
    holders: credit(state.holders, actor.id, -amount),
    bags: [bag, ...state.bags],
    flags: { ...state.flags, posted: true },
    counts: { ...state.counts, posts: state.counts.posts + 1 },
    spark: withSpark(state, "post"),
    log: withLog(state, {
      id: ctx.uid(),
      tone: "info",
      text: `${actor.name} posted ${amount.toLocaleString("en-US")} into escrow.`,
    }),
    notice: {
      tone: "info",
      title: `${actor.name} posted ${amount.toLocaleString("en-US")}`,
      body: "That bag left the spendable balance and is waiting on the board. An equal post from someone else swaps the two bags. Any other amount is refused.",
      bagId: bag.id,
    },
  };
}

export function tryMatch(
  state: BoardState,
  bagId: string,
  amount: number,
  ctx: EngineCtx,
): BoardState {
  const actor = holderById(state, state.activeId);
  const bag = bagById(state, bagId);
  if (!actor) return state;
  if (!bag) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "That bag is gone",
        body: "It was matched or taken back. The open list is current.",
      },
    };
  }
  if (state.pending) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "A swap is still settling",
        body: "One match at a time, so the bags stay easy to follow.",
      },
    };
  }
  const owner = holderById(state, bag.ownerId);
  const ownerName = owner?.name ?? "the poster";
  if (actor.id === bag.ownerId) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "This bag is already yours",
        body: "Switch holder to match it, or take the whole amount back.",
        bagId,
      },
    };
  }
  if (amount !== bag.amount) {
    return {
      ...state,
      flags: { ...state.flags, refused: true },
      counts: { ...state.counts, refuses: state.counts.refuses + 1 },
      spark: withSpark(state, "refuse"),
      log: withLog(state, {
        id: ctx.uid(),
        tone: "refuse",
        text: `${actor.name} offered ${amount.toLocaleString("en-US")} against ${ownerName}'s ${bag.amount.toLocaleString("en-US")}. Refused.`,
      }),
      notice: {
        tone: "refuse",
        title: "Unequal amounts do not match",
        body: `${actor.name} offered ${amount.toLocaleString("en-US")}. ${ownerName}'s bag is ${bag.amount.toLocaleString("en-US")}. Balances are unchanged and the bag stays open.`,
        bagId,
      },
    };
  }
  if (actor.balance < amount) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: `${actor.name} cannot cover ${amount.toLocaleString("en-US")}`,
        body: `Spendable balance is ${actor.balance.toLocaleString("en-US")} LetsPAR. The bag stays with ${ownerName}.`,
        bagId,
      },
    };
  }
  return {
    ...state,
    holders: credit(state.holders, actor.id, -amount),
    pending: { bagId, matcherId: actor.id, amount },
    log: withLog(state, {
      id: ctx.uid(),
      tone: "swap",
      text: `${actor.name} posted ${amount.toLocaleString("en-US")} against ${ownerName}. The bags are swapping.`,
    }),
    notice: {
      tone: "swap",
      title: "Equal amount. Swapping the bags.",
      body: `${actor.name} posted ${amount.toLocaleString("en-US")}, the same as ${ownerName}. Both bags are in escrow for a moment, then they change hands.`,
      bagId,
    },
  };
}

export function finishSwap(state: BoardState, ctx: EngineCtx): BoardState {
  const pending = state.pending;
  if (!pending) return state;
  const bag = bagById(state, pending.bagId);
  const matcher = holderById(state, pending.matcherId);
  if (!bag || !matcher) {
    const holders = matcher ? credit(state.holders, matcher.id, pending.amount) : state.holders;
    return {
      ...state,
      holders,
      pending: null,
      notice: {
        tone: "error",
        title: "The swap could not finish",
        body: "The matching bag was returned to the spendable balance.",
      },
    };
  }
  const owner = holderById(state, bag.ownerId);
  const ownerName = owner?.name ?? "the poster";
  return {
    ...state,
    holders: credit(credit(state.holders, bag.ownerId, pending.amount), pending.matcherId, pending.amount),
    bags: state.bags.filter((b) => b.id !== bag.id),
    pending: null,
    flags: { ...state.flags, swapped: true },
    counts: { ...state.counts, swaps: state.counts.swaps + 1 },
    spark: withSpark(state, "swap"),
    log: withLog(state, {
      id: ctx.uid(),
      tone: "swap",
      text: `${ownerName}'s ${pending.amount.toLocaleString("en-US")} went to ${matcher.name}. ${matcher.name}'s ${pending.amount.toLocaleString("en-US")} went to ${ownerName}.`,
    }),
    notice: {
      tone: "swap",
      title: "The bags swapped",
      body: `${ownerName} received ${matcher.name}'s ${pending.amount.toLocaleString("en-US")}. ${matcher.name} received ${ownerName}'s ${pending.amount.toLocaleString("en-US")}. Same token, same amount, no price. The open bag is gone.`,
      bagId: bag.id,
    },
  };
}

export function reclaimBag(state: BoardState, bagId: string, ctx: EngineCtx): BoardState {
  const actor = holderById(state, state.activeId);
  const bag = bagById(state, bagId);
  if (!actor || !bag) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "That bag is not on the board",
        body: "The open list is already up to date.",
      },
    };
  }
  if (state.pending?.bagId === bagId) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "This bag is mid-swap",
        body: "Let the equal match finish. It can no longer be pulled back.",
        bagId,
      },
    };
  }
  if (bag.ownerId !== actor.id) {
    return {
      ...state,
      notice: {
        tone: "error",
        title: "Only the poster can take it back",
        body: `Switch to ${holderById(state, bag.ownerId)?.name ?? "the owner"}, or match the amount exactly.`,
        bagId,
      },
    };
  }
  return {
    ...state,
    holders: credit(state.holders, actor.id, bag.amount),
    bags: state.bags.filter((b) => b.id !== bag.id),
    flags: { ...state.flags, reclaimed: true },
    counts: { ...state.counts, reclaims: state.counts.reclaims + 1 },
    spark: withSpark(state, "reclaim"),
    log: withLog(state, {
      id: ctx.uid(),
      tone: "reclaim",
      text: `${actor.name} took ${bag.amount.toLocaleString("en-US")} back whole.`,
    }),
    notice: {
      tone: "reclaim",
      title: "The whole bag came back",
      body: `${actor.name} pulled ${bag.amount.toLocaleString("en-US")} LetsPAR out of escrow. The amount is unchanged. Nothing was kept.`,
      bagId,
    },
  };
}

export function explainAmount(text: string): BoardState["notice"] {
  return { tone: "error", title: "That amount does not post", body: text };
}
