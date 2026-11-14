import { Reveal } from "./ui";

const STEPS = [
  {
    n: "01",
    title: "Post a bag",
    body: "Choose an amount of $PAR. It leaves your wallet and sits on the board under your account. That waiting pile is escrow.",
  },
  {
    n: "02",
    title: "Match the number",
    body: "The same number swaps the bags. 1% comes off each side. Half of that is burned, and half is paid to the matchmaker. A different amount, or matching your own bag, is refunded.",
  },
  {
    n: "03",
    title: "Or take it back",
    body: "If the bag is still open, the poster takes the whole amount back. Nothing is burned and nobody is paid.",
  },
];

export function Rule() {
  return (
    <section className="section wrap" id="rule">
      <Reveal>
        <p className="kicker">The mechanic</p>
        <h2>Two bags. One number. Then they trade places.</h2>
      </Reveal>
      <div className="rule-grid">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 90}>
            <article className="rule-card">
              <span className="rule-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
