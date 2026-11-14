import assert from "node:assert/strict";
import {
  escrowTotal,
  finishSwap,
  lockedOf,
  postBag,
  reclaimBag,
  seedState,
  tryMatch,
  type EngineCtx,
} from "../src/engine.ts";

let n = 0;
const ctx: EngineCtx = {
  uid: () => `id${++n}`,
  now: () => 1_700_000_000_000 + n,
};

const ada = "ada.letspar.testnet";
const bao = "bao.letspar.testnet";
const cleo = "cleo.letspar.testnet";

let state = seedState();
state = postBag({ ...state, activeId: ada }, 400, ctx);
assert.equal(state.holders.find((h) => h.id === ada)?.balance, 2000);
assert.equal(state.bags.length, 1);
assert.equal(state.bags[0]?.amount, 400);
assert.equal(escrowTotal(state), 400);
assert.equal(state.flags.posted, true);

const bagId = state.bags[0]!.id;
const beforeRefuse = structuredClone(state);
state = tryMatch({ ...state, activeId: bao }, bagId, 250, ctx);
assert.equal(state.flags.refused, true);
assert.equal(state.notice.tone, "refuse");
assert.equal(state.holders.find((h) => h.id === bao)?.balance, 1800);
assert.equal(state.holders.find((h) => h.id === ada)?.balance, 2000);
assert.equal(state.bags.length, 1);
assert.equal(state.bags[0]?.id, beforeRefuse.bags[0]?.id);
assert.equal(escrowTotal(state), 400);
assert.equal(state.pending, null);

state = tryMatch(state, bagId, 400, ctx);
assert.equal(state.holders.find((h) => h.id === bao)?.balance, 1400);
assert.equal(state.pending?.amount, 400);
assert.equal(state.bags.length, 1);
assert.equal(escrowTotal(state), 800);
assert.equal(lockedOf(state, bao), 400);

state = finishSwap(state, ctx);
assert.equal(state.pending, null);
assert.equal(state.bags.length, 0);
assert.equal(state.flags.swapped, true);
assert.equal(state.notice.title, "The bags swapped");
assert.equal(state.holders.find((h) => h.id === ada)?.balance, 2400);
assert.equal(state.holders.find((h) => h.id === bao)?.balance, 1800);
assert.equal(escrowTotal(state), 0);

state = postBag({ ...state, activeId: cleo }, 120, ctx);
assert.equal(state.holders.find((h) => h.id === cleo)?.balance, 840);
const cleoBag = state.bags[0]!.id;
state = reclaimBag({ ...state, activeId: cleo }, cleoBag, ctx);
assert.equal(state.holders.find((h) => h.id === cleo)?.balance, 960);
assert.equal(state.bags.length, 0);
assert.equal(state.flags.reclaimed, true);
assert.equal(state.notice.tone, "reclaim");

state = postBag({ ...state, activeId: ada }, 50, ctx);
const own = state.bags[0]!.id;
const refusedOwn = tryMatch(state, own, 50, ctx);
assert.equal(refusedOwn.notice.tone, "error");
assert.equal(refusedOwn.bags.length, 1);

console.log("rules ok");
