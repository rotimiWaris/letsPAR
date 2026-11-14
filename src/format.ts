export function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const YOCTO = 10n ** 24n;
const MIN_NEAR = YOCTO;
const MAX_NEAR = 50n * YOCTO;

export function formatNear(yocto: string | bigint, maxFrac = 4): string {
  const value = typeof yocto === "bigint" ? yocto : BigInt(yocto || "0");
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / YOCTO;
  const frac = abs % YOCTO;
  const wholeText = new Intl.NumberFormat("en-US").format(whole);
  if (frac === 0n) return negative ? `-${wholeText}` : wholeText;
  const fracText = frac.toString().padStart(24, "0").slice(0, maxFrac).replace(/0+$/, "");
  const body = fracText ? `${wholeText}.${fracText}` : wholeText;
  return negative ? `-${body}` : body;
}

export function formatNearNumber(value: number, digits = 4): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function yoctoToNumber(yocto: string): number {
  const value = BigInt(yocto || "0");
  const micro = value / 10n ** 18n;
  return Number(micro) / 1_000_000;
}

export function sumYocto(amounts: string[]): string {
  return amounts.reduce((total, amount) => (BigInt(total) + BigInt(amount || "0")).toString(), "0");
}

export function parseNear(
  raw: string,
): { ok: true; yocto: string } | { ok: false; text: string } {
  const t = raw.trim().replace(/[\s,]/g, "");
  if (!t) return { ok: false, text: "Enter an amount of PAR." };
  if (!/^\d+(\.\d+)?$/.test(t)) {
    return { ok: false, text: "Use a number, like 0.5." };
  }
  const [whole, frac = ""] = t.split(".");
  if (frac.length > 6) return { ok: false, text: "Use at most 6 decimal places." };
  if (whole.length > 8) return { ok: false, text: "Keep a single bag to 50 PAR." };
  const yocto = BigInt(whole) * YOCTO + BigInt((frac + "0".repeat(24)).slice(0, 24));
  if (yocto < MIN_NEAR) return { ok: false, text: "Post at least 1 PAR." };
  if (yocto > MAX_NEAR) return { ok: false, text: "Keep a single bag to 50 PAR." };
  return { ok: true, yocto: yocto.toString() };
}

export function sameYocto(a: string, b: string): boolean {
  return BigInt(a) === BigInt(b);
}

export function parseAmount(
  raw: string,
): { ok: true; value: number } | { ok: false; text: string } {
  const t = raw.trim().replace(/[\s,]/g, "");
  if (!t) return { ok: false, text: "Enter a whole amount of LetsPAR." };
  if (!/^\d+$/.test(t)) {
    return { ok: false, text: "Use a whole number. LetsPAR bags have no fractions." };
  }
  const value = Number(t);
  if (!Number.isSafeInteger(value) || value < 1) {
    return { ok: false, text: "The amount has to be at least 1." };
  }
  if (value > 1_000_000) {
    return { ok: false, text: "Keep a single bag to a million LetsPAR on this board." };
  }
  return { ok: true, value };
}

export function normalizeAccount(
  raw: string,
): { ok: true; id: string; name: string } | { ok: false; text: string } {
  let t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return { ok: false, text: "Enter a NEAR testnet account name." };
  if (!t.endsWith(".testnet")) t = `${t}.testnet`;
  const body = t.slice(0, -".testnet".length);
  if (
    body.length < 2 ||
    body.length > 54 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)*$/.test(body)
  ) {
    return {
      ok: false,
      text: "Use a NEAR account name, like ada.letspar.testnet.",
    };
  }
  const stem = body.split(".")[0] ?? body;
  const name = stem.charAt(0).toUpperCase() + stem.slice(1);
  return { ok: true, id: t, name };
}

export function shortAccount(id: string): string {
  if (id.length <= 24) return id;
  return `${id.slice(0, 20)}…`;
}

export function middleAccount(id: string): string {
  const head = 10;
  const tail = 10;
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 15) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
