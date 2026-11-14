import { useState } from "react";
import { Bento } from "./components/Bento";
import { Board } from "./components/Board";
import { Demo } from "./components/Demo";
import { Footer, Outcomes, Plain } from "./components/Close";
import { Explorer } from "./components/Explorer";
import { Hero, Marquee } from "./components/Hero";
import { Nav } from "./components/Nav";
import { Replay } from "./components/Replay";
import { Rule } from "./components/Rule";
import { WalletModal } from "./components/WalletModal";

export function App() {
  const [wallet, setWallet] = useState(false);
  return (
    <>
      <Nav onConnect={() => setWallet(true)} />
      <main>
        <Hero />
        <Marquee />
        <Rule />
        <Board />
        <Demo />
        <Replay />
        <Bento />
        <Explorer />
        <Outcomes />
        <Plain />
      </main>
      <Footer />
      {wallet ? <WalletModal onClose={() => setWallet(false)} /> : null}
    </>
  );
}
