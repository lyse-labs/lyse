type Canon = { kind: "color" | "length" | "skip"; canonical: string };

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgba?\(([^)]+)\)$/i;
const PX = /^-?\d*\.?\d+px$/;

function hexToRgb(hex: string): string {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export function canonicalize(value: string): Canon {
  const v = value.trim();
  if (HEX.test(v)) return { kind: "color", canonical: hexToRgb(v) };
  const m = RGB.exec(v);
  if (m) {
    const parts = m[1]!.split(/[,/\s]+/).map((s) => s.trim()).filter(Boolean);
    const [r, g, b] = parts;
    return { kind: "color", canonical: `rgb(${Number(r)}, ${Number(g)}, ${Number(b)})` };
  }
  if (PX.test(v)) return { kind: "length", canonical: `${parseFloat(v)}px` };
  return { kind: "skip", canonical: v };
}
