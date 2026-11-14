import { useEffect, useId } from "react";
import { accountUrl, CONTRACT_ID, NETWORK_ID } from "../config";
import { formatNear, shortAccount } from "../format";
import { actions, useBoard } from "../store";
import { WALLETS } from "../wallet";

export function WalletModal({ onClose }: { onClose: () => void }) {
  const board = useBoard();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("overlay-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("overlay-open");
    };
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="kicker">NEAR {NETWORK_ID}</p>
        <h2 id={titleId}>{board.accountId ? "This wallet" : "Connect a wallet"}</h2>
        <p className="deck">
          {board.accountId
            ? `${shortAccount(board.accountId)} can post, match, and reclaim on ${CONTRACT_ID}.`
            : "Pick a testnet wallet."}
        </p>
        <p className="network-pill">
          <span className="dot" aria-hidden="true" />
          Network · {NETWORK_ID}
        </p>
        {board.accountId ? (
          <div className="account-card">
            <strong>{board.accountId}</strong>
            <span>{board.balance ? `${formatNear(board.balance)} PAR` : "Balance loading"}</span>
            <a href={accountUrl(board.accountId)} target="_blank" rel="noreferrer">
              View account on explorer
            </a>
          </div>
        ) : (
          <p className="hint">Wallets: {WALLETS.join(", ")}.</p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              actions.connect();
              onClose();
            }}
          >
            {board.accountId ? "Switch wallet" : "Choose a wallet"}
          </button>
          {board.accountId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void actions.disconnect();
                onClose();
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
    </div>
  );
}
