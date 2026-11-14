import { useState, type FormEvent } from "react";
import { accountUrl, CONTRACT_ID, txUrl } from "../config";
import { formatNear, middleAccount, shortAccount, sumYocto, timeAgo, yoctoToNumber } from "../format";
import { actions, useBoard, type Notice } from "../store";
import type { ChainBag } from "../near";
import { AnimatedNumber, useNow } from "./ui";

const PATH = [
  { key: "posted", label: "Post" },
  { key: "refused", label: "Unequal fails" },
  { key: "swapped", label: "Equal swaps" },
  { key: "reclaimed", label: "Reclaim" },
] as const;

export function Board() {
  const board = useBoard();
  const now = useNow();
  const [raw, setRaw] = useState("");
  const mine = board.bags.filter((bag) => bag.poster === board.accountId);
  const locked = sumYocto(mine.map((bag) => bag.amount));
  const posters = postersOf(board.bags, board.accountId);

  const onPost = (event: FormEvent) => {
    event.preventDefault();
    void actions.post(raw).then((ok) => {
      if (ok) setRaw("");
    });
  };

  return (
    <section className="section wrap" id="board">
      <div className="section-head">
        <p className="kicker">Live</p>
        <div className="section-head-row">
          <h2>Try the rule yourself.</h2>
          <button type="button" className="text-btn" onClick={() => actions.refresh()} data-testid="refresh-board">
            {board.syncing ? "Refreshing" : "Refresh"}
          </button>
        </div>
        <p className="deck">
          Open bags are read from the $PAR contract on NEAR testnet. An equal match takes 1% from
          each side: half is burned, and half is a reward for the matchmaker. Unequal and self-matches
          are refunded. Reclaim returns the whole bag. With no wallet, this list is still live.
        </p>
      </div>
      <div className="product">
        <div className="product-bar">
          <span className="product-name">letspar · testnet</span>
          <a className="product-meta" href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
            {CONTRACT_ID}
          </a>
          <ol className="path" aria-label="Moves you have tried">
            {PATH.map((item) => (
              <li
                key={item.key}
                className={board.flags[item.key] ? "done" : ""}
                data-testid={`flag-${item.key}`}
                data-done={board.flags[item.key] ? "true" : "false"}
              >
                {item.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="board-grid">
          <div className="holders">
            <p className="panel-label">Holding as</p>
            {board.accountId ? (
              <div className="holder on" data-testid="connected-holder">
                <span className="avatar" aria-hidden="true">
                  {board.accountId.slice(0, 1).toUpperCase()}
                </span>
                <span className="holder-id">
                  <strong title={board.accountId}>{middleAccount(board.accountId)}</strong>
                  <small>testnet wallet</small>
                </span>
                <span className="holder-figures">
                  <em data-testid="wallet-balance">
                    {board.balance === null ? "…" : <AnimatedNumber value={yoctoToNumber(board.balance)} digits={4} />}
                  </em>
                  <small>{BigInt(locked) > 0n ? `${formatNear(locked)} locked` : "PAR"}</small>
                </span>
              </div>
            ) : (
              <button type="button" className="holder" onClick={() => actions.connect()}>
                <span className="avatar" aria-hidden="true">
                  +
                </span>
                <span className="holder-id">
                  <strong>Connect a wallet</strong>
                  <small>The bags stay visible either way</small>
                </span>
              </button>
            )}
            {posters.length > 0 && (
              <>
                <p className="panel-label spaced">Open posters</p>
                <div className="holder-list">
                  {posters.map((poster) => (
                    <a
                      key={poster.id}
                      className="holder static"
                      href={accountUrl(poster.id)}
                      title={poster.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="avatar" aria-hidden="true">
                        {poster.id.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="holder-id">
                        <strong title={poster.id}>{middleAccount(poster.id)}</strong>
                        <small>{poster.count === 1 ? "1 bag" : `${poster.count} bags`}</small>
                      </span>
                      <span className="holder-figures">
                        <em>{formatNear(poster.locked)}</em>
                        <small>locked</small>
                      </span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="desk">
            <form className="post-form" onSubmit={onPost}>
              <label htmlFor="post-amount">Amount to post</label>
              <div className="post-row">
                <input
                  id="post-amount"
                  data-testid="post-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.5"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  disabled={board.pending !== null}
                />
                <span className="unit">PAR</span>
                <button type="submit" className="btn btn-gold" data-testid="post-submit" disabled={board.pending !== null}>
                  {board.pending?.kind === "post" ? "Posting…" : "Post into escrow"}
                </button>
              </div>
              <p className="hint">
                {board.accountId
                  ? board.balance
                    ? `Spendable balance is ${formatNear(board.balance)} PAR. An equal match keeps 99% for the poster. The matchmaker gets their 99% plus the other 1% as a reward. Gas is testnet NEAR.`
                    : "Reading the PAR balance."
                  : "Connect a testnet wallet to post. Open bags below are already live."}
              </p>
              {board.accountId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={board.pending !== null || board.nextClaimMs > now}
                  onClick={() => void actions.claim()}
                >
                  {board.nextClaimMs > now
                    ? `Next claim in ${Math.floor((board.nextClaimMs - now) / 3600000)}h ${Math.floor(((board.nextClaimMs - now) % 3600000) / 60000)}m`
                    : "Claim 100 PAR"}
                </button>
              ) : null}
            </form>
            <NoticeView notice={board.notice} />
            <div className="open-head">
              <h3>Open bags</h3>
              <span>
                {!board.ready ? "Reading" : board.bags.length === 0 ? "None waiting" : `${board.bags.length} waiting`}
              </span>
            </div>
            <ul className="bag-list" data-testid="open-list">
              {!board.ready ? (
                <li className="bag-empty">Reading open bags from testnet.</li>
              ) : board.bags.length === 0 ? (
                <li className="bag-empty">
                  No bags on the contract. Post one, then match it from a second wallet with the same amount.
                </li>
              ) : (
                board.bags.map((bag) => <BagRow key={bag.id} bag={bag} now={now} notice={board.notice} />)
              )}
            </ul>
            {board.log.length > 0 && (
              <ol className="ledger" data-testid="ledger">
                {board.log.slice(0, 4).map((line) => (
                  <li key={line.id} className={line.tone}>
                    {line.text}
                    {line.txHash ? (
                      <>
                        {" "}
                        <a href={txUrl(line.txHash)} target="_blank" rel="noreferrer">
                          Explorer
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function postersOf(bags: ChainBag[], self: string | null) {
  const map = new Map<string, { id: string; locked: string; count: number }>();
  for (const bag of bags) {
    if (bag.poster === self) continue;
    const current = map.get(bag.poster);
    if (!current) {
      map.set(bag.poster, { id: bag.poster, locked: bag.amount, count: 1 });
    } else {
      current.locked = sumYocto([current.locked, bag.amount]);
      current.count += 1;
    }
  }
  return [...map.values()];
}

function NoticeView({ notice }: { notice: Notice }) {
  return (
    <div className={`notice tone-${notice.tone}`} data-testid="notice" data-tone={notice.tone} role="status">
      <span className="notice-mark" aria-hidden="true">
        {markFor(notice.tone)}
      </span>
      <div>
        <h3>{notice.title}</h3>
        <p>{notice.body}</p>
        {notice.txHash ? (
          <a href={txUrl(notice.txHash)} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
      </div>
    </div>
  );
}

function markFor(tone: Notice["tone"]): string {
  if (tone === "refuse") return "≠";
  if (tone === "swap") return "⇄";
  if (tone === "reclaim") return "↩";
  if (tone === "error") return "!";
  return "+";
}

function BagRow({ bag, now, notice }: { bag: ChainBag; now: number; notice: Notice }) {
  const board = useBoard();
  const mine = board.accountId === bag.poster;
  const settling = board.pending?.bagId === bag.id;
  const [raw, setRaw] = useState("");
  const rowNotice = notice.bagId === bag.id && (notice.tone === "refuse" || notice.tone === "error");
  const label = shortAccount(bag.poster);

  const onMatch = (event: FormEvent) => {
    event.preventDefault();
    if (!board.accountId) {
      actions.connect();
      return;
    }
    void actions.match(bag.id, raw);
  };

  return (
    <li
      className={`bag-row ${settling ? "settling" : ""} ${rowNotice ? "flagged" : ""}`}
      data-testid={`bag-${bag.id}`}
      data-owner={bag.poster}
      data-amount={bag.amount}
    >
      <div className="bag-main">
        <span className="avatar sm" aria-hidden="true">
          {bag.poster.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>
            {label} · {formatNear(bag.amount)} PAR
          </strong>
          <small>
            {timeAgo(bag.createdAt, now)}
            {mine ? " · your bag" : ""}
            {settling ? " · confirming" : ""}
          </small>
        </div>
        <em className="bag-amt">{formatNear(bag.amount)}</em>
      </div>
      {settling ? (
        <p className="row-note">Waiting for the wallet and the testnet receipt.</p>
      ) : mine ? (
        <div className="row-actions">
          <p className="row-note">Yours, and still unmatched.</p>
          <button
            type="button"
            className="btn btn-ghost"
            data-testid={`reclaim-${bag.id}`}
            disabled={board.pending !== null}
            onClick={() => void actions.reclaim(bag.id)}
          >
            Reclaim {formatNear(bag.amount)} whole
          </button>
        </div>
      ) : (
        <form className="match-form" onSubmit={onMatch}>
          <label className="sr" htmlFor={`match-${bag.id}`}>
            Amount to match against {label}
          </label>
          <input
            id={`match-${bag.id}`}
            data-testid={`match-amount-${bag.id}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatNear(bag.amount)}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            disabled={board.pending !== null}
          />
          <button type="submit" className="btn btn-gold" data-testid={`match-submit-${bag.id}`} disabled={board.pending !== null}>
            {board.accountId ? "Try to match" : "Connect to match"}
          </button>
        </form>
      )}
      {rowNotice && <p className="row-error">{notice.title}</p>}
    </li>
  );
}
