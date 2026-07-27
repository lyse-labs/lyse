interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(\s*([^)]+)\s*\)$/i;
const HSL_RE = /^hsla?\(\s*([^)]+)\s*\)$/i;
// Strict, whole-token numeric patterns — `Number.parseFloat` only parses a
// prefix and silently ignores trailing junk (e.g. "59px", "Infinity" would
// otherwise slip through), so every token must match one of these in full
// before it is handed to `Number.parseFloat`. The body accepts a leading
// sign and either a leading-dot (".5") or trailing-dot ("59.") decimal, to
// match idiomatic CSS/SCSS number syntax without accepting exponents.
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const PERCENT_RE = /^[+-]?(\d+\.?\d*|\.\d+)%$/;

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, n));
}

function clampAlpha(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function parseHexChannel(hex: string): number {
  return parseInt(hex, 16);
}

function parseHex(value: string): Rgba | null {
  const match = HEX_RE.exec(value);
  if (!match) return null;
  const hex = match[1];
  if (hex === undefined) return null;
  if (hex.length === 3 || hex.length === 4) {
    const r = hex[0];
    const g = hex[1];
    const b = hex[2];
    const a = hex[3];
    if (r === undefined || g === undefined || b === undefined) return null;
    return {
      r: parseHexChannel(r + r),
      g: parseHexChannel(g + g),
      b: parseHexChannel(b + b),
      a: a === undefined ? 1 : parseHexChannel(a + a) / 255,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = hex.slice(0, 2);
    const g = hex.slice(2, 4);
    const b = hex.slice(4, 6);
    const a = hex.length === 8 ? hex.slice(6, 8) : undefined;
    return {
      r: parseHexChannel(r),
      g: parseHexChannel(g),
      b: parseHexChannel(b),
      a: a === undefined ? 1 : parseHexChannel(a) / 255,
    };
  }
  return null;
}

function parseChannelToken(token: string): number | null {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    if (!PERCENT_RE.test(trimmed)) return null;
    const pct = Number.parseFloat(trimmed.slice(0, -1));
    const value = (pct / 100) * 255;
    if (value < 0 || value > 255) return null;
    return value;
  }
  if (!NUMBER_RE.test(trimmed)) return null;
  const n = Number.parseFloat(trimmed);
  if (n < 0 || n > 255) return null;
  return n;
}

function parseAlphaToken(token: string): number | null {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    if (!PERCENT_RE.test(trimmed)) return null;
    const pct = Number.parseFloat(trimmed.slice(0, -1));
    const value = pct / 100;
    if (value < 0 || value > 1) return null;
    return value;
  }
  if (!NUMBER_RE.test(trimmed)) return null;
  const n = Number.parseFloat(trimmed);
  if (n < 0 || n > 1) return null;
  return n;
}

function splitArgs(raw: string): string[] {
  return raw
    .split("/")
    .join(" ")
    .split(",")
    .join(" ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseRgb(value: string): Rgba | null {
  const match = RGB_RE.exec(value);
  if (!match) return null;
  const inner = match[1];
  if (inner === undefined) return null;
  const parts = splitArgs(inner);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const rTok = parts[0];
  const gTok = parts[1];
  const bTok = parts[2];
  const aTok = parts[3];
  if (rTok === undefined || gTok === undefined || bTok === undefined) return null;
  const r = parseChannelToken(rTok);
  const g = parseChannelToken(gTok);
  const b = parseChannelToken(bTok);
  if (r === null || g === null || b === null) return null;
  const a = aTok === undefined ? 1 : parseAlphaToken(aTok);
  if (a === null) return null;
  return { r, g, b, a };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hueNorm = ((h % 360) + 360) % 360;
  const sat = clampAlpha(s);
  const light = clampAlpha(l);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hueNorm / 60) % 2) - 1));
  const m = light - c / 2;
  let rP = 0;
  let gP = 0;
  let bP = 0;
  if (hueNorm < 60) {
    rP = c;
    gP = x;
    bP = 0;
  } else if (hueNorm < 120) {
    rP = x;
    gP = c;
    bP = 0;
  } else if (hueNorm < 180) {
    rP = 0;
    gP = c;
    bP = x;
  } else if (hueNorm < 240) {
    rP = 0;
    gP = x;
    bP = c;
  } else if (hueNorm < 300) {
    rP = x;
    gP = 0;
    bP = c;
  } else {
    rP = c;
    gP = 0;
    bP = x;
  }
  return {
    r: clampByte((rP + m) * 255),
    g: clampByte((gP + m) * 255),
    b: clampByte((bP + m) * 255),
  };
}

function parseHsl(value: string): Rgba | null {
  const match = HSL_RE.exec(value);
  if (!match) return null;
  const inner = match[1];
  if (inner === undefined) return null;
  const parts = splitArgs(inner);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const hTok = parts[0];
  const sTok = parts[1];
  const lTok = parts[2];
  const aTok = parts[3];
  if (hTok === undefined || sTok === undefined || lTok === undefined) return null;
  const hTrimmed = hTok.trim();
  if (!NUMBER_RE.test(hTrimmed)) return null;
  const h = Number.parseFloat(hTrimmed);
  const sTrimmed = sTok.trim();
  const lTrimmed = lTok.trim();
  if (!PERCENT_RE.test(sTrimmed) || !PERCENT_RE.test(lTrimmed)) return null;
  const s = Number.parseFloat(sTrimmed.slice(0, -1));
  const l = Number.parseFloat(lTrimmed.slice(0, -1));
  if (s < 0 || s > 100 || l < 0 || l > 100) return null;
  const a = aTok === undefined ? 1 : parseAlphaToken(aTok);
  if (a === null) return null;
  const { r, g, b } = hslToRgb(h, s / 100, l / 100);
  return { r, g, b, a };
}

// Fresh, self-contained parser (ADR 0022 §3b): must not share Lyse's own
// resolver/parser, or a mined gold label could bless the resolver's own blind spots.
function parseColorIndependent(value: string): Rgba | null {
  const trimmed = value.trim();
  return parseHex(trimmed) ?? parseRgb(trimmed) ?? parseHsl(trimmed);
}

/** True iff `value` is a literal colour this independent parser recognises.
 *  Kept here (not in token-file.ts) so all colour recognition stays in the
 *  zero-import module (ADR 0022 §3b). */
export function isColorLiteral(value: string): boolean {
  return parseColorIndependent(value) !== null;
}

export function colorEquals(a: string, b: string): boolean {
  const ca = parseColorIndependent(a);
  const cb = parseColorIndependent(b);
  if (ca === null || cb === null) return false;
  const roundedAr = Math.round(ca.r);
  const roundedAg = Math.round(ca.g);
  const roundedAb = Math.round(ca.b);
  const roundedBr = Math.round(cb.r);
  const roundedBg = Math.round(cb.g);
  const roundedBb = Math.round(cb.b);
  if (roundedAr !== roundedBr || roundedAg !== roundedBg || roundedAb !== roundedBb) {
    return false;
  }
  return Math.abs(ca.a - cb.a) <= 1 / 255;
}
