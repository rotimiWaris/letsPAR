import { useEffect, useState } from "react";

type Tone = "gold" | "cream";

interface Pouch {
  amt: string;
  tone: Tone;
  label: string;
}

interface Beat {
  left: Pouch;
  right: Pouch;
  cross: boolean;
  tilt: boolean;
  verdict: string;
  detail: string;
  caption: string;
  note: string;
}

const EQUAL_LEFT: Pouch = { amt: "400", tone: "gold", label: "Bag one" };
const EQUAL_RIGHT: Pouch = { amt: "400", tone: "cream", label: "Bag two" };
const ODD_LEFT: Pouch = { amt: "250", tone: "cream", label: "Lighter" };
const ODD_RIGHT: Pouch = { amt: "400", tone: "gold", label: "Heavier" };

const BEATS: Beat[] = [
  {
    left: EQUAL_LEFT,
    right: EQUAL_RIGHT,
    cross: false,
    tilt: false,
    verdict: "PAR",
    detail: "400 = 400",
    caption: "Same amount on both hooks.",
    note: "The bags are free to swap.",
  },
  {
    left: EQUAL_LEFT,
    right: EQUAL_RIGHT,
    cross: true,
    tilt: false,
    verdict: "SWAP",
    detail: "Changing hands",
    caption: "The bags cross. The amounts stay equal.",
    note: "No price. Each side takes the other bag.",
  },
  {
    left: EQUAL_RIGHT,
    right: EQUAL_LEFT,
    cross: false,
    tilt: false,
    verdict: "SWAPPED",
    detail: "Hands changed",
    caption: "Each hook holds the bag that started on the other side.",
    note: "Equal amounts. The bags swapped.",
  },
  {
    left: ODD_LEFT,
    right: ODD_RIGHT,
    cross: false,
    tilt: false,
    verdict: "CHECK",
    detail: "250 ≠ 400",
    caption: "A different amount shows up.",
    note: "The board compares the two numbers.",
  },
  {
    left: ODD_LEFT,
    right: ODD_RIGHT,
    cross: false,
    tilt: true,
    verdict: "NOT PAR",
    detail: "Refused",
    caption: "Unequal amounts do not match. Nothing is exchanged.",
    note: "Both bags stay where they are.",
  },
];

const DELAYS = [1800, 1050, 1600, 900, 2000];

export function Hero() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(0);
  const [noTrans, setNoTrans] = useState(false);
  const beat = BEATS[reduce ? 0 : step] ?? BEATS[0];

  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(() => {
      const next = (step + 1) % BEATS.length;
      if (next === 2) setNoTrans(true);
      setStep(next);
    }, DELAYS[step]);
    return () => window.clearTimeout(id);
  }, [step, reduce]);

  useEffect(() => {
    if (!noTrans) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setNoTrans(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [noTrans]);

  return (
    <section className="hero wrap" id="top">
      <div className="hero-copy">
        <p className="kicker">
          <span className="dot" aria-hidden="true" />
          NEAR hackathon · one fair rule
        </p>
        <div className="hero-title">
          <h1>
            Same amount.
            <br />
            <em>Bags swap.</em>
          </h1>
        </div>
        <p className="lede">
          Post $PAR. An equal match takes 1% from each side: half is burned, and half is a reward
          for the matchmaker. A different amount, or matching your own bag, is refunded. If nobody
          matches, the whole bag comes back.
        </p>
        <div className="hero-actions">
          <a className="btn btn-gold" href="#board">
            Post a bag
            <Arrow />
          </a>
          <a className="btn btn-ghost" href="#rule">
            Read the rule
          </a>
        </div>
        <ul className="hero-facts">
          <li>1% from each side</li>
          <li>Half burned, half rewarded</li>
          <li>Live on NEAR testnet</li>
        </ul>
      </div>
      <div className={`hero-frame ${beat.tilt ? "tilt" : ""} ${beat.cross ? "crossing" : ""} ${noTrans ? "no-trans" : ""}`}>
        <div className="frame-label">
          <span>01</span>
          <span>Equal swap</span>
          <span className="live-chip">
            <span className="dot" aria-hidden="true" />
            Illustration
          </span>
        </div>
        <div className="stage" aria-hidden="true">
          <div className="scene">
            <div className="pivot">
              <div className="beam" />
              <div className="hub" />
              <PouchView pouch={beat.left} side="left" />
              <PouchView pouch={beat.right} side="right" />
            </div>
            <div className="fulcrum" />
            <div className="base" />
          </div>
          <p className="stage-caption">{beat.caption}</p>
        </div>
        <aside className={`callout ${beat.verdict === "NOT PAR" ? "is-bad" : "is-good"}`}>
          <span>{beat.verdict}</span>
          <strong>{beat.detail}</strong>
          <em>{beat.note}</em>
        </aside>
      </div>
    </section>
  );
}

function PouchView({ pouch, side }: { pouch: Pouch; side: "left" | "right" }) {
  return (
    <div className={`pouch ${pouch.tone} side-${side}`}>
      <span className="amt">{pouch.amt}</span>
      <span className="who">{pouch.label}</span>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Marquee() {
  const items = [
    "Post a bag",
    "Match the number",
    "Bags swap",
    "Unequal is refused",
    "Unmatched comes back whole",
    "No price",
  ];
  const row = [...items, ...items];
  return (
    <div className="marquee-wrap" aria-hidden="true">
      <div className="marquee">
        {row.map((item, i) => (
          <span key={`${item}-${i}`}>
            {item}
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}
