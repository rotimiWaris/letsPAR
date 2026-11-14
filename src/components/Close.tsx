import { useEffect, useRef, useState } from "react";
import { accountUrl, CONTRACT_ID } from "../config";
import { Mark, Reveal } from "./ui";

const FIGURES = [
  { to: 100, suffix: "%", label: "of an unmatched bag comes back" },
  { to: 0, suffix: "", label: "partial fills. A bag moves whole, or not at all" },
  { to: 0, suffix: "", label: "price. The number is an amount, not a quote" },
  { to: 2, suffix: "", label: "bags change hands, and only when the amounts match" },
];

export function Outcomes() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="section outcomes" ref={ref}>
      <div className="wrap">
        <Reveal>
          <p className="kicker">What the rule guarantees</p>
          <h2>Fair means equal, then the bags trade.</h2>
        </Reveal>
        <div className="figures">
          {FIGURES.map((fig) => (
            <article key={fig.label}>
              <strong>
                <Count to={fig.to} on={on} />
                {fig.suffix}
              </strong>
              <span>{fig.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Count({ to, on }: { to: number; on: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (to === 0) {
      setN(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, to]);
  return <>{n}</>;
}

export function Plain() {
  return (
    <section className="section wrap plain">
      <Reveal>
        <p className="kicker">For everyone else</p>
        <h2>You do not need a terminal.</h2>
      </Reveal>
      <div className="plain-grid">
        <article>
          <h3>Connect a testnet wallet</h3>
          <p>
            The button in the corner opens MyNearWallet, Meteor, HERE, Bitte, or Intear. The open
            bags are readable before you connect. A wallet is what signs a post, a match, or a reclaim.
          </p>
        </article>
        <article>
          <h3>Type one amount</h3>
          <p>
            Post that much $PAR. It leaves your balance and shows up in the open list. Another
            wallet matches it only with the same amount.
          </p>
        </article>
        <article>
          <h3>Read the board out loud</h3>
          <p>
            An equal match takes 1% from each side. Half is burned and half is the matchmaker’s
            reward. A different amount, or matching your own bag, is refunded. Reclaim returns
            everything.
          </p>
        </article>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <a className="brand" href="#top">
            <Mark />
            <span>LetsPAR</span>
          </a>
          <p>Equal bags, or they do not move. A memecoin for the NEAR hackathon.</p>
        </div>
        <div>
          <p className="panel-label">On this page</p>
          <a href="#rule">Rule</a>
          <a href="#board">Live</a>
          <a href="#demo">Demo</a>
          <a href="#replay">Replay</a>
          <a href="#numbers">Numbers</a>
        </div>
        <div>
          <p className="panel-label">Testnet</p>
          <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
            {CONTRACT_ID}
          </a>
          <p>Posts, matches, and reclaims are transactions on NEAR testnet. Testnet NEAR has no real value.</p>
        </div>
      </div>
    </footer>
  );
}
