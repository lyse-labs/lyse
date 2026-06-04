export type DtcgType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "cubicBezier"
  | "shadow"
  | "gradient"
  | "typography"
  | "transition"
  | "border"
  | "strokeStyle"
  | "number"
  | "string";

export type DtcgAlias = string;

export interface DtcgTokenBase {
  $type?: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
  $deprecated?: boolean | string;
}

export interface DtcgToken<TValue = unknown> extends DtcgTokenBase {
  $value: TValue | DtcgAlias;
}

export interface DtcgShadowValue {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread?: string;
  inset?: boolean;
}

export interface DtcgTypographyValue {
  fontFamily?: string | string[];
  fontSize?: string;
  fontWeight?: string | number;
  lineHeight?: string | number;
  letterSpacing?: string;
}

export interface DtcgTransitionValue {
  duration: string;
  delay?: string;
  timingFunction: number[] | string;
}

export interface DtcgBorderValue {
  color: string;
  width: string;
  style: string;
}

export interface DtcgGradientStop {
  color: string;
  position: number;
}

export type DtcgGradientValue = DtcgGradientStop[];

export type DtcgCubicBezierValue = [number, number, number, number];

export interface DtcgGroup {
  $type?: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [key: string]: DtcgGroup | DtcgToken<unknown> | DtcgType | string | Record<string, unknown> | undefined;
}

export type DtcgDocument = DtcgGroup;

export function isDtcgToken(entry: unknown): entry is DtcgToken<unknown> {
  return typeof entry === "object" && entry !== null && "$value" in (entry as Record<string, unknown>);
}

export function isDtcgGroup(entry: unknown): entry is DtcgGroup {
  return (
    typeof entry === "object" &&
    entry !== null &&
    !Array.isArray(entry) &&
    !("$value" in (entry as Record<string, unknown>))
  );
}

const ALIAS_RE = /^\{[^{}]+\}$/;

export function isDtcgAlias(value: unknown): value is DtcgAlias {
  return typeof value === "string" && ALIAS_RE.test(value.trim());
}

export function parseAliasPath(alias: DtcgAlias): string[] {
  const inner = alias.trim().slice(1, -1);
  return inner.split(".").map((s) => s.trim()).filter((s) => s.length > 0);
}
