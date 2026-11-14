import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatAmount, formatNearNumber } from "../format";

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 20 L13.2 28 H22.8 Z" fill="currentColor" />
      <path d="M5 15.5 H31" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="11" cy="15.5" r="2.3" fill="currentColor" />
      <circle cx="25" cy="15.5" r="2.3" fill="currentColor" />
    </svg>
  );
}

export function AnimatedNumber({ value, digits = 0 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const factor = 10 ** digits;

  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (from === to) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      shownRef.current = to;
      setShown(to);
      return;
    }
    const start = performance.now();
    const dur = 720;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round((from + (to - from) * eased) * factor) / factor;
      shownRef.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, factor]);

  return <>{digits === 0 ? formatAmount(shown) : formatNearNumber(shown, digits)}</>;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${on ? "in" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function useNow(ms = 20000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
