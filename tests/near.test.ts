import assert from "node:assert/strict";
import { formatNear, middleAccount, parseNear, sameYocto, sumYocto } from "../src/format.ts";

const one = parseNear("1");
assert.equal(one.ok, true);
if (one.ok) {
  assert.equal(one.yocto, "1000000000000000000000000");
  assert.equal(formatNear(one.yocto), "1");
}

assert.equal(parseNear("0.5").ok, false);
assert.equal(formatNear("500000000000000000000000"), "0.5");

const padded = parseNear("1.0");
assert.equal(padded.ok && sameYocto(padded.yocto, "1000000000000000000000000"), true);

assert.equal(parseNear("0.009").ok, false);
assert.equal(parseNear("").ok, false);
assert.equal(parseNear("1.2.3").ok, false);
assert.equal(parseNear("51").ok, false);

const a = parseNear("2");
const b = parseNear("3");
assert.equal(a.ok && b.ok, true);
if (a.ok && b.ok) {
  assert.equal(sameYocto(a.yocto, b.yocto), false);
  assert.equal(sumYocto([a.yocto, b.yocto]), "5000000000000000000000000");
  assert.equal(formatNear(sumYocto([a.yocto, b.yocto])), "5");
}

assert.equal(middleAccount("bob.testnet"), "bob.testnet");
assert.equal(middleAccount("alice.letspar-23ec4110.testnet"), "alice.lets…10.testnet");

console.log("near amounts ok");
