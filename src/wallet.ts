import { actionCreators } from "@near-js/transactions";
import { setupWalletSelector, type WalletModuleFactory, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupBitteWallet } from "@near-wallet-selector/bitte-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { CONTRACT_ID, GAS_CLAIM, GAS_MATCH, GAS_POST, GAS_RECLAIM, GAS_STORAGE, NETWORK_ID, STORAGE_DEPOSIT } from "./config";

export const WALLETS = ["MyNearWallet", "Meteor", "HERE", "Bitte", "Intear"] as const;

type AccountListener = (accountId: string | null) => void;

let selectorPromise: Promise<WalletSelector> | null = null;
let modal: { show: () => void } | null = null;
const listeners = new Set<AccountListener>();

function activeAccount(selector: WalletSelector): string | null {
  const { accounts } = selector.store.getState();
  return accounts[0]?.accountId ?? null;
}

export function onAccount(listener: AccountListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(accountId: string | null) {
  for (const listener of listeners) listener(accountId);
}

export function getSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK_ID,
      modules: [
        setupMyNearWallet(),
        setupMeteorWallet(),
        setupHereWallet(),
        setupBitteWallet(),
        setupIntearWallet(),
      ] as WalletModuleFactory[],
    }).then((selector) => {
      modal = setupModal(selector, {
        contractId: CONTRACT_ID,
        theme: "dark",
      });
      publish(activeAccount(selector));
      selector.on("signedIn", ({ accounts }) => {
        publish(accounts[0]?.accountId ?? null);
      });
      selector.on("signedOut", () => {
        publish(null);
      });
      return selector;
    });
  }
  return selectorPromise;
}

export function showWallet() {
  void getSelector().then(() => modal?.show());
}

export async function disconnectWallet() {
  const selector = await getSelector();
  if (!selector.isSignedIn()) return;
  const wallet = await selector.wallet();
  await wallet.signOut();
}

export async function callContract(
  accountId: string,
  methodName: "post" | "match_bag" | "reclaim" | "claim",
  args: Record<string, unknown>,
  deposit: string,
): Promise<unknown> {
  const selector = await getSelector();
  const wallet = await selector.wallet();
  const register = actionCreators.functionCall(
    "storage_deposit",
    { account_id: accountId },
    BigInt(GAS_STORAGE),
    BigInt(STORAGE_DEPOSIT),
  );
  const actions =
    methodName === "post"
      ? [
          register,
          actionCreators.functionCall(
            "ft_transfer_call",
            { receiver_id: CONTRACT_ID, amount: deposit, memo: null, msg: "post" },
            BigInt(GAS_POST),
            1n,
          ),
        ]
      : methodName === "match_bag"
        ? [
            register,
            actionCreators.functionCall(
              "ft_transfer_call",
              { receiver_id: CONTRACT_ID, amount: deposit, memo: null, msg: `match:${args.bag_id}` },
              BigInt(GAS_MATCH),
              1n,
            ),
          ]
        : methodName === "claim"
          ? [register, actionCreators.functionCall("claim", {}, BigInt(GAS_CLAIM), 0n)]
          : [actionCreators.functionCall("reclaim", args, BigInt(GAS_RECLAIM), 0n)];
  return wallet.signAndSendTransaction({
    signerId: accountId,
    receiverId: CONTRACT_ID,
    actions,
  });
}

void getSelector();
