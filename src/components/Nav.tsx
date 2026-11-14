import { useEffect, useState } from "react";
import { shortAccount } from "../format";
import { useBoard } from "../store";
import { Mark } from "./ui";

const LINKS = [
  { href: "#rule", label: "Rule" },
  { href: "#board", label: "Live" },
  { href: "#demo", label: "Demo" },
  { href: "#replay", label: "Replay" },
  { href: "#widgets", label: "Stats" },
  { href: "#numbers", label: "Numbers" },
];

export function Nav({ onConnect }: { onConnect: () => void }) {
  const board = useBoard();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const connected = board.accountId;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("menu-open");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`nav ${scrolled || open ? "scrolled" : ""}`}>
      <div className="wrap nav-inner">
        <a className="brand" href="#top" onClick={() => setOpen(false)}>
          <Mark />
          <span>LetsPAR</span>
        </a>
        <nav className={`nav-links ${open ? "open" : ""}`} aria-label="Page">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <p className="nav-note">Same amount. Bags swap.</p>
        </nav>
        <div className="nav-tools">
          <p className="status-pill" data-testid="open-count">
            <span className="dot" aria-hidden="true" />
            <span>{board.bags.length === 1 ? "1 open bag" : `${board.bags.length} open bags`}</span>
          </p>
          <button
            type="button"
            className="btn btn-gold nav-connect"
            onClick={() => {
              setOpen(false);
              onConnect();
            }}
            data-testid="connect-near"
          >
            <span className="wide-label">
              {connected ? shortAccount(connected) : "Connect NEAR testnet"}
            </span>
            <span className="short-label">{connected ? shortAccount(connected).split(".")[0] : "NEAR testnet"}</span>
          </button>
          <button
            type="button"
            className="nav-burger"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
