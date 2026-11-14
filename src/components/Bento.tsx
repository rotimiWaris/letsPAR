import { useMemo, useState } from "react";
import { accountUrl } from "../config";
import { formatAmount, formatNear, sumYocto, yoctoToNumber } from "../format";
import type { SparkKind } from "../store";
import { actions, useBoard } from "../store";
import { AnimatedNumber, Reveal } from "./ui";

export function Bento() {
  const board = useBoard();
  const locked = sumYocto(board.bags.filter((bag) => bag.poster === board.accountId).map((bag) => bag.amount));
  const escrow = sumYocto(board.bags.map((bag) => bag.amount));
  const spendable = board.balance ? yoctoToNumber(board.balance) : 0;
  const lockedNum = yoctoToNumber(locked);
  const pool = spendable + lockedNum;
  const pct = pool === 0 ? 0 : Math.round((spendable / pool) * 100);
  const mine = board.bags.find((bag) => bag.poster === board.accountId);
  const name = board.accountId ? board.accountId.split(".")[0] : "Wallet";

  return (
    <section className="section wrap" id="widgets">
      <Reveal>
        <p className="kicker">Live on testnet</p>
        <h2>The same board, in six small instruments.</h2>
        <p className="deck">
          These read the contract. Post, match, or pull a bag back, and the tiles follow the open list.
        </p>
      </Reveal>
      <div className="bento">
        <article className="tile tile-open">
          <header>
            <span>Open bags</span>
            <strong>{board.bags.length}</strong>
          </header>
          {board.bags.length === 0 ? (
            <p className="tile-empty">Nothing is waiting. A post on the board will land here.</p>
          ) : (
            <ul>
              {board.bags.slice(0, 5).map((bag) => (
                <li key={bag.id}>
                  <a href={accountUrl(bag.poster)} target="_blank" rel="noreferrer">
                    {bag.poster.split(".")[0]}
                  </a>
                  <em>{formatNear(bag.amount)}</em>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="tile">
          <header>
            <span>{name} spendable</span>
          </header>
          {board.accountId && board.balance ? (
            <>
              <p className="tile-figure">
                <AnimatedNumber value={spendable} digits={4} />
              </p>
              <div className="gauge" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="tile-foot">{pct}% of this wallet’s PAR is free to post.</p>
            </>
          ) : (
            <>
              <p className="tile-empty">Connect a wallet to see a real testnet balance.</p>
              <button type="button" className="btn btn-ghost" onClick={() => actions.connect()}>
                Connect
              </button>
            </>
          )}
        </article>
        <article className="tile">
          <header>
            <span>In escrow</span>
          </header>
          <p className="tile-figure">
            <AnimatedNumber value={yoctoToNumber(escrow)} digits={4} />
          </p>
          <p className="tile-foot">
            Supply {formatNear(board.stats.totalSupply)}. Burned {formatNear(board.stats.totalBurned)}. Rewarded{" "}
            {formatNear(board.stats.totalRewarded)}.
          </p>
        </article>
        <article className="tile">
          <header>
            <span>Swaps</span>
            <strong>
              {formatAmount(board.stats.swapCount)} swap{board.stats.swapCount === 1 ? "" : "s"}
            </strong>
          </header>
          <Spark spark={board.spark} />
          <p className="tile-foot">
            {formatNear(board.stats.totalSwapped)} PAR swapped · {formatNear(board.stats.totalBurned)} burned ·{" "}
            {formatNear(board.stats.totalRewarded)} rewarded · {formatAmount(board.stats.postCount)} posted ·{" "}
            {formatAmount(board.stats.reclaimCount)} reclaimed
          </p>
        </article>
        <ParTile />
        <article className="tile tile-reclaim">
          <header>
            <span>Pull it back</span>
          </header>
          {mine ? (
            <>
              <p className="tile-figure sm">{formatNear(mine.amount)}</p>
              <p className="tile-foot">Your open bag, still unmatched.</p>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={board.pending !== null}
                onClick={() => void actions.reclaim(mine.id)}
              >
                Reclaim whole
              </button>
            </>
          ) : (
            <p className="tile-empty">
              {board.accountId ? "This wallet has no open bag to pull back." : "Connect a wallet to reclaim a bag you posted."}
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

function Spark({ spark }: { spark: SparkKind[] }) {
  const bars = useMemo(() => spark.slice(-16), [spark]);
  if (bars.length === 0) {
    return <p className="tile-empty">Your moves this session draw themselves here.</p>;
  }
  return (
    <svg className="spark" viewBox="0 0 160 48" role="img" aria-label="Recent posts, refusals, swaps, and reclaims">
      {bars.map((kind, index) => {
        const h = kind === "swap" ? 40 : kind === "reclaim" ? 30 : kind === "refuse" ? 16 : 24;
        const fill = kind === "refuse" ? "var(--clay)" : kind === "swap" ? "var(--sea)" : "var(--gold)";
        return <rect key={`${kind}-${index}`} x={index * 10} y={46 - h} width="6" height={h} rx="1" fill={fill} />;
      })}
    </svg>
  );
}

function readAmount(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function ParTile() {
  const [left, setLeft] = useState("0.5");
  const [right, setRight] = useState("0.25");
  const a = readAmount(left);
  const b = readAmount(right);
  const good = a !== null && b !== null && a === b;
  const verdict = a === null || b === null ? "Enter two amounts" : good ? "Par. These would swap." : "Not par. These would be refused.";
  return (
    <article className="tile">
      <header>
        <span>Par check</span>
      </header>
      <div className="par-inputs">
        <input inputMode="decimal" aria-label="First amount" value={left} onChange={(e) => setLeft(e.target.value)} />
        <span aria-hidden="true">{good ? "=" : "≠"}</span>
        <input inputMode="decimal" aria-label="Second amount" value={right} onChange={(e) => setRight(e.target.value)} />
      </div>
      <p className={`tile-foot ${good ? "good" : "bad"}`}>{verdict}</p>
    </article>
  );
}
