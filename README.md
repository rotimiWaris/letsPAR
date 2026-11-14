# LetsPAR

LetsPAR is a NEAR hackathon entry for the Memecoins With Mechanics track. The live asset is the NEP-141 token `$PAR` on testnet. Two people post the same amount and the bags change hands. An equal match takes 1% from each side. Half of that is burned and half is paid to the matchmaker, so supply shrinks only when a pair matches. A different amount is refunded. Matching your own bag is refunded. An unmatched bag comes back whole.

The token and the escrow are the same account: `par3.letspar-23ec4110.testnet`.

https://testnet.nearblocks.io/address/par3.letspar-23ec4110.testnet

A wallet can claim 100 PAR, then again after 3 hours. Earlier tokens remain at `par.letspar-23ec4110.testnet` and `par2.letspar-23ec4110.testnet`. The site does not use them.

There is also an earlier native-NEAR escrow at `letspar-23ec4110.testnet`. The site no longer posts NEAR bags there. A separate Demo section on the page still lets you try the rule with play money and no wallet.

## The rule

1. Register storage with `storage_deposit` (0.002 NEAR), then `claim`. The faucet sends 100 PAR, and the same account can claim again after 3 hours.
2. `ft_transfer_call` with message `post` locks that PAR as an open bag.
3. `ft_transfer_call` with message `match:<bag id>` must send exactly the same amount, from a different account. The poster receives 99%. The matchmaker receives 99% plus the other 1% as a reward. The last 1% is burned.
4. `reclaim` is only for the poster. The whole bag comes back. Nothing is burned and no reward is paid.
5. `get_open_bags`, `get_bag`, and `get_stats` are views. Stats include total supply, total burned, total rewarded, and the swap count.

The bag is removed before the payouts. Logs use the `EVENT_JSON` prefix from NEP-297. A failed match refunds the PAR that was transferred in.

## Run the site

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. The live board reads open bags even when no wallet is connected. Connect MyNearWallet, Meteor, HERE, Bitte, or Intear on testnet to claim, post, match, or reclaim. Amounts are PAR, with 24 decimals. The page registers storage in the same transaction as a claim, post, or match.

The contract id defaults to `par3.letspar-23ec4110.testnet`. Set `VITE_CONTRACT_ID` to point a build at a different account.

The Demo section is separate. It does not sign anything and it does not read the contract.

```bash
npm test
npm run build
```

`npm test` checks the equal-swap rule and the NEAR amount conversion. The built site is static files in `dist`.

## Contracts

Both crates use near-sdk 5. You need Rust 1.95 or newer, the wasm target, [cargo-near](https://github.com/near/cargo-near), and [near-cli-rs](https://github.com/near/near-cli-rs).

`$PAR` lives in `token/`. The older native-NEAR escrow lives in `contract/`.

```bash
cd token
cargo test
cargo near build non-reproducible-wasm
```

```bash
rustup target add wasm32-unknown-unknown
cd contract
cargo test
cargo near build non-reproducible-wasm
```

Create a testnet account, deploy, and init. Leave a few NEAR on the contract account. Open bags lock a little storage, and that balance is the reserve. Keys belong in the local keychain, not in this repo.

```bash
near account create-account sponsor-by-faucet-service <name>.testnet \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config testnet create

near contract deploy <name>.testnet \
  use-file ./target/near/letspar.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-legacy-keychain send
```

From `contract/`, the wasm path above is correct. From the repo root it is `contract/target/near/letspar.wasm`.
