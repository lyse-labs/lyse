import type { TokenAxis } from "../types.js";

export type ResolveClass = "exact" | "near" | "novel" | "unresolved";

export interface Resolution {
  class: ResolveClass;
  tokenIds: string[];
  distance?: number;
}

export interface ResolverConfig {
  colorNearThreshold: number;
  dimensionNearSteps: number;
}

export interface Resolver {
  resolve(axis: TokenAxis, rawValue: string): Resolution;
  abstentions(): number;
}
