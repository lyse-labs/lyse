/**
 * WCAG 2.x contrast ratio utilities (pure, deterministic).
 */

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Named color map for common CSS color names.
 */
const NAMED_COLORS: Record<string, readonly [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  fuchsia: [255, 0, 255],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
};

/**
 * Parse a color string into RGBA components.
 * Handles: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), and named colors.
 * Returns null if unparseable.
 */
export function parseColor(s: string): Color | null {
  s = s.trim();

  // Named color
  const lower = s.toLowerCase();
  if (lower in NAMED_COLORS) {
    const color = NAMED_COLORS[lower];
    if (color) {
      const [r, g, b] = color;
      return { r, g, b, a: 1 };
    }
  }

  // Hex color
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      // #rgb
      const c0 = hex[0];
      const c1 = hex[1];
      const c2 = hex[2];
      if (!c0 || !c1 || !c2) return null;
      const r = parseInt(c0 + c0, 16);
      const g = parseInt(c1 + c1, 16);
      const b = parseInt(c2 + c2, 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 4) {
      // #rgba
      const c0 = hex[0];
      const c1 = hex[1];
      const c2 = hex[2];
      const c3 = hex[3];
      if (!c0 || !c1 || !c2 || !c3) return null;
      const r = parseInt(c0 + c0, 16);
      const g = parseInt(c1 + c1, 16);
      const b = parseInt(c2 + c2, 16);
      const a = parseInt(c3 + c3, 16) / 255;
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
      return { r, g, b, a };
    }
    if (hex.length === 6) {
      // #rrggbb
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 8) {
      // #rrggbbaa
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
      return { r, g, b, a };
    }
    return null;
  }

  // rgb() / rgba()
  const rgbMatch = s.match(/^\s*rgba?\s*\(\s*([^)]+)\s*\)\s*$/);
  if (rgbMatch) {
    const parts = rgbMatch[1]!.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) return null;

    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    const p3 = parts[3];
    if (!p0 || !p1 || !p2) return null;

    const r = parseFloat(p0);
    const g = parseFloat(p1);
    const b = parseFloat(p2);
    const a = parts.length === 4 && p3 ? parseFloat(p3) : 1;

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) return null;

    return { r, g, b, a };
  }

  // hsl() / hsla()
  const hslMatch = s.match(/^\s*hsla?\s*\(\s*([^)]+)\s*\)\s*$/);
  if (hslMatch) {
    const parts = hslMatch[1]!.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) return null;

    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    const p3 = parts[3];
    if (!p0 || !p1 || !p2) return null;

    const h = parseFloat(p0);
    const s_str = p1.replace(/%/, "");
    const l_str = p2.replace(/%/, "");
    const a = parts.length === 4 && p3 ? parseFloat(p3) : 1;

    const s = parseFloat(s_str);
    const l = parseFloat(l_str);

    if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l) || Number.isNaN(a)) return null;
    if (s < 0 || s > 100 || l < 0 || l > 100 || a < 0 || a > 1) return null;

    // HSL to RGB conversion
    const rgb = hslToRgb(h % 360, s / 100, l / 100);
    return { ...rgb, a };
  }

  return null;
}

/**
 * Convert HSL to RGB.
 * h: 0-360, s: 0-1, l: 0-1
 * Returns { r, g, b } with values 0-255.
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Calculate relative luminance per WCAG 2.x sRGB.
 * Input: { r: 0-255, g: 0-255, b: 0-255 }
 * Output: 0-1 (0=black, 1=white)
 */
export function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const linearize = (cs: number): number => {
    cs = cs / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };

  const r = linearize(c.r);
  const g = linearize(c.g);
  const b = linearize(c.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * Returns null if either color is unparseable or has alpha < 1.
 * Otherwise returns contrast ratio (1-21).
 */
export function contrastRatio(fg: string, bg: string): number | null {
  const fgColor = parseColor(fg);
  const bgColor = parseColor(bg);

  if (fgColor === null || bgColor === null) return null;
  if (fgColor.a < 1 || bgColor.a < 1) return null;

  const lf = relativeLuminance(fgColor);
  const lb = relativeLuminance(bgColor);

  const lmax = Math.max(lf, lb);
  const lmin = Math.min(lf, lb);

  return (lmax + 0.05) / (lmin + 0.05);
}
