import { useState } from "react";
import { Reveal } from "./ui";

export function Explorer() {
  const [left, setLeft] = useState(400);
  const [right, setRight] = useState(250);
  const equal = left === right;
  const max = 800;
  const h = (n: number) => 48 + (n / max) * 150;

  return (
    <section className="section wrap" id="numbers">
      <Reveal>
        <p className="kicker">Try the numbers</p>
        <h2>Drag until the two bags agree.</h2>
        <p className="deck">
          Nothing here is a price. The only question is whether the amounts are the same. Equal
          bags would swap. Anything else would stay put.
        </p>
      </Reveal>
      <div className="explorer">
        <div className={`columns ${equal ? "equal" : "apart"}`}>
          <div className="col">
            <div className="bar gold" style={{ height: h(left) }} />
            <strong>{left.toLocaleString("en-US")}</strong>
            <span>First bag</span>
          </div>
          <div className={`verdict-pill ${equal ? "good" : "bad"}`}>{equal ? "PAR" : "NOT PAR"}</div>
          <div className="col">
            <div className="bar cream" style={{ height: h(right) }} />
            <strong>{right.toLocaleString("en-US")}</strong>
            <span>Second bag</span>
          </div>
        </div>
        <div className="sliders">
          <label>
            First bag
            <input
              type="range"
              min={50}
              max={max}
              step={10}
              value={left}
              onChange={(e) => setLeft(Number(e.target.value))}
            />
          </label>
          <label>
            Second bag
            <input
              type="range"
              min={50}
              max={max}
              step={10}
              value={right}
              onChange={(e) => setRight(Number(e.target.value))}
            />
          </label>
          <div className="explorer-actions">
            <button type="button" className="btn btn-gold" onClick={() => setRight(left)}>
              Make them equal
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRight(Math.min(max, left + 50))}>
              Offset the second by 50
            </button>
          </div>
          <p className="explorer-read">
            {equal
              ? "These bags would swap. Each holder would end holding the other’s LetsPAR."
              : `${left.toLocaleString("en-US")} and ${right.toLocaleString("en-US")} are different, so the board would refuse and move nothing.`}
          </p>
        </div>
      </div>
    </section>
  );
}
