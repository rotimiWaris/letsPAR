import { useEffect, useState } from "react";
import { formatAmount } from "../format";
import { Reveal } from "./ui";

interface Frame {
  kicker: string;
  title: string;
  text: string;
  ada: number;
  bao: number;
  cleo: number;
  bags: string;
}

const FRAMES: Frame[] = [
  {
    kicker: "01",
    title: "Ada posts 400",
    text: "Ada posts 400. Her spendable balance falls from 2,400 to 2,000. The bag waits on the board with her name on it.",
    ada: 2000,
    bao: 1800,
    cleo: 840,
    bags: "Ada 400 · Cleo 120",
  },
  {
    kicker: "02",
    title: "250 is refused",
    text: "Bao types 250 against Ada’s bag. 250 is not 400. The board refuses. Balances stay. Both bags stay open.",
    ada: 2000,
    bao: 1800,
    cleo: 840,
    bags: "Ada 400 · Cleo 120",
  },
  {
    kicker: "03",
    title: "400 swaps the bags",
    text: "Bao posts 400, the same number. Ada receives Bao’s 400. Bao receives Ada’s 400. The open bag disappears. No price was set.",
    ada: 2400,
    bao: 1800,
    cleo: 840,
    bags: "Cleo 120",
  },
  {
    kicker: "04",
    title: "Cleo takes 120 back",
    text: "Nobody matched Cleo’s 120. She pulls that amount back whole. Her spendable balance is 960 again, and the board is clear.",
    ada: 2400,
    bao: 1800,
    cleo: 960,
    bags: "None",
  },
];

export function Replay() {
  const [step, setStep] = useState(0);
  const [chars, setChars] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState(false);
  const frame = FRAMES[step] ?? FRAMES[0];
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = document.getElementById("replay");
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (reduce) {
      setChars(frame.text.length);
      return;
    }
    if (chars < frame.text.length) {
      const id = window.setTimeout(() => setChars((c) => c + 1), 14);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setStep((s) => (s + 1) % FRAMES.length);
      setChars(0);
    }, 1700);
    return () => window.clearTimeout(id);
  }, [playing, chars, frame.text.length, step, reduce]);

  const choose = (index: number) => {
    setPlaying(true);
    setStep(index);
    setChars(0);
  };

  return (
    <section className="section wrap" id="replay">
      <Reveal>
        <p className="kicker">A recorded round</p>
        <div className="section-head-row">
          <h2>Watch one fair swap, then the pull-back.</h2>
          <button type="button" className="text-btn" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        <p className="deck">
          This telling is separate from the live board. Cleo already has 120 waiting, so you can
          see a refusal, a swap, and a reclaim in one pass.
        </p>
      </Reveal>
      <div className={`replay ${seen ? "in" : ""}`}>
        <ol className="milestones">
          {FRAMES.map((item, index) => (
            <li key={item.kicker}>
              <button
                type="button"
                className={index === step ? "on" : index < step ? "done" : ""}
                onClick={() => choose(index)}
              >
                <span>{item.kicker}</span>
                {item.title}
              </button>
            </li>
          ))}
        </ol>
        <div className="transcript">
          <p className="sr">{frame.text}</p>
          <p className="typed" aria-hidden="true">
            {frame.text.slice(0, reduce || (!playing && chars === 0) ? frame.text.length : chars)}
            {playing && chars < frame.text.length ? <i className="caret" /> : null}
          </p>
          <dl className="mini-ledger">
            <div>
              <dt>Ada</dt>
              <dd>{formatAmount(frame.ada)}</dd>
            </div>
            <div>
              <dt>Bao</dt>
              <dd>{formatAmount(frame.bao)}</dd>
            </div>
            <div>
              <dt>Cleo</dt>
              <dd>{formatAmount(frame.cleo)}</dd>
            </div>
            <div className="wide">
              <dt>Open</dt>
              <dd>{frame.bags}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
