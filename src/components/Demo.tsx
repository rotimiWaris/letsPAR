import { useRef, useState, type FormEvent } from "react";
import {
  finishSwap,
  holderById,
  lockedOf,
  postBag,
  reclaimBag,
  seedState,
  setActive,
  tryMatch,
  type BoardState,
  type EngineCtx,
  type Notice,
} from "../engine";
import { formatAmount, parseAmount } from "../format";

export function Demo() {
  const [board, setBoard] = useState<BoardState>(seedState);
  const [burned, setBurned] = useState(0);
  const [rewarded, setRewarded] = useState(0);
  const seq = useRef(0);
  const active = holderById(board, board.activeId);
  const [raw, setRaw] = useState("");

  const ctx = (): EngineCtx => ({
    uid: () => {
      seq.current += 1;
      return `demo_${seq.current}`;
    },
    now: () => Date.now(),
  });

  const apply = (next: BoardState) => {
    if (!next.pending) {
      setBoard(next);
      return;
    }
    const pending = next.pending;
    const bag = next.bags.find((item) => item.id === pending.bagId);
    const finished = finishSwap(next, ctx());
    const cut = Math.floor(pending.amount / 100);
    const poster = holderById(finished, bag?.ownerId ?? "");
    const matcher = holderById(finished, pending.matcherId);
    setBurned((value) => value + cut);
    setRewarded((value) => value + cut);
    setBoard({
      ...finished,
      holders: finished.holders.map((holder) =>
        holder.id === bag?.ownerId ? { ...holder, balance: holder.balance - cut } : holder,
      ),
      notice: {
        tone: "swap",
        title: "The bags swapped",
        body: `${poster?.name ?? "The poster"} keeps ${formatAmount(pending.amount - cut)}. ${matcher?.name ?? "The matchmaker"} gets their bag back plus ${formatAmount(cut)} as a reward. ${formatAmount(cut)} is burned.`,
      },
    });
  };

  const onPost = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseAmount(raw);
    if (!parsed.ok) {
      setBoard({ ...board, notice: { tone: "error", title: "That amount does not post", body: parsed.text } });
      return;
    }
    if (parsed.value < 100) {
      setBoard({
        ...board,
        notice: {
          tone: "error",
          title: "That amount does not post",
          body: "Use at least 100 so the 1% cut is a whole number in this demo.",
        },
      });
      return;
    }
    const next = postBag(board, parsed.value, ctx());
    if (next.notice.tone === "info") setRaw("");
    apply(next);
  };

  return (
    <section className="section wrap" id="demo">
      <div className="section-head">
        <p className="kicker">Demo</p>
        <h2>Try the rule with no wallet.</h2>
        <p className="deck">
          Ada, Bao, and Cleo live only in this browser. This demo just swaps equal amounts. It does
          not burn, pay a reward, or touch the live contract. On the live board, an equal match takes
          1% from each side: half is burned and half goes to the matchmaker.
        </p>
      </div>
      <div className="product">
        <div className="product-bar">
          <span className="product-name">letspar · demo</span>
          <span className="product-meta">
            Play money. Burned {formatAmount(burned)}. Rewarded {formatAmount(rewarded)}.
          </span>
        </div>
        <div className="board-grid">
          <div className="holders">
            <p className="panel-label">Holding as</p>
            <div className="holder-list">
              {board.holders.map((holder) => {
                const locked = lockedOf(board, holder.id);
                const on = holder.id === board.activeId;
                return (
                  <button
                    key={holder.id}
                    type="button"
                    className={`holder ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => setBoard(setActive(board, holder.id))}
                  >
                    <span className="avatar" aria-hidden="true">
                      {holder.name.slice(0, 1)}
                    </span>
                    <span className="holder-id">
                      <strong>{holder.name}</strong>
                      <small title={holder.id}>{holder.name}</small>
                    </span>
                    <span className="holder-figures">
                      <em>{formatAmount(holder.balance)}</em>
                      <small>{locked > 0 ? `${formatAmount(locked)} locked` : "spendable"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="desk">
            <form className="post-form" onSubmit={onPost}>
              <label htmlFor="demo-amount">Amount to post</label>
              <div className="post-row">
                <input
                  id="demo-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="400"
                  value={raw}
                  onChange={(event) => setRaw(event.target.value)}
                />
                <span className="unit">PAR</span>
                <button type="submit" className="btn btn-gold">
                  Post into escrow
                </button>
              </div>
              <p className="hint">
                {active
                  ? `${active.name} can post up to ${formatAmount(active.balance)}. Switch names to play the other side.`
                  : "Pick a name."}
              </p>
            </form>
            <DemoNotice notice={board.notice} />
            <div className="open-head">
              <h3>Open bags</h3>
              <span>{board.bags.length === 0 ? "None waiting" : `${board.bags.length} waiting`}</span>
            </div>
            <ul className="bag-list">
              {board.bags.length === 0 ? (
                <li className="bag-empty">No demo bags yet. Post one, then switch holder and answer it.</li>
              ) : (
                board.bags.map((bag) => {
                  const owner = holderById(board, bag.ownerId);
                  const mine = board.activeId === bag.ownerId;
                  return (
                    <DemoBag
                      key={bag.id}
                      name={owner?.name ?? "Holder"}
                      amount={bag.amount}
                      mine={mine}
                      flagged={board.notice.bagId === bag.id && (board.notice.tone === "refuse" || board.notice.tone === "error")}
                      title={board.notice.bagId === bag.id ? board.notice.title : ""}
                      onMatch={(amount) => apply(tryMatch(board, bag.id, amount, ctx()))}
                      onReclaim={() => apply(reclaimBag(board, bag.id, ctx()))}
                    />
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoNotice({ notice }: { notice: Notice }) {
  const mark = notice.tone === "refuse" ? "≠" : notice.tone === "swap" ? "⇄" : notice.tone === "reclaim" ? "↩" : notice.tone === "error" ? "!" : "+";
  return (
    <div className={`notice tone-${notice.tone}`} role="status">
      <span className="notice-mark" aria-hidden="true">
        {mark}
      </span>
      <div>
        <h3>{notice.title}</h3>
        <p>{notice.body}</p>
      </div>
    </div>
  );
}

function DemoBag({
  name,
  amount,
  mine,
  flagged,
  title,
  onMatch,
  onReclaim,
}: {
  name: string;
  amount: number;
  mine: boolean;
  flagged: boolean;
  title: string;
  onMatch: (amount: number) => void;
  onReclaim: () => void;
}) {
  const [raw, setRaw] = useState("");
  return (
    <li className={`bag-row ${flagged ? "flagged" : ""}`}>
      <div className="bag-main">
        <span className="avatar sm" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <div>
          <strong>
            {name} · {formatAmount(amount)}
          </strong>
          <small>{mine ? "your bag" : "demo bag"}</small>
        </div>
        <em className="bag-amt">{formatAmount(amount)}</em>
      </div>
      {mine ? (
        <div className="row-actions">
          <p className="row-note">Yours, and still unmatched.</p>
          <button type="button" className="btn btn-ghost" onClick={onReclaim}>
            Reclaim {formatAmount(amount)} whole
          </button>
        </div>
      ) : (
        <form
          className="match-form"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseAmount(raw);
            if (!parsed.ok) return;
            onMatch(parsed.value);
          }}
        >
          <label className="sr" htmlFor={`demo-match-${name}-${amount}`}>
            Amount to match against {name}
          </label>
          <input
            id={`demo-match-${name}-${amount}`}
            inputMode="numeric"
            placeholder={formatAmount(amount)}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
          <button type="submit" className="btn btn-gold">
            Try to match
          </button>
        </form>
      )}
      {flagged && title ? <p className="row-error">{title}</p> : null}
    </li>
  );
}
