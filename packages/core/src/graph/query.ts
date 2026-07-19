import type { DesignSystemGraph, TokenAxis, ZoneKind } from "./types.js";

export function zoneOf(graph: DesignSystemGraph, relPath: string): ZoneKind {
  return graph.zones.byFile[relPath] ?? "app";
}

export function isScoredZone(zone: ZoneKind): boolean {
  return zone === "app";
}

export function isScored(graph: DesignSystemGraph, relPath: string): boolean {
  return isScoredZone(zoneOf(graph, relPath));
}

export function onScale(graph: DesignSystemGraph, axis: TokenAxis, value: string): boolean {
  return graph.tokens.some((t) => t.axis === axis && t.rawValue === value);
}

export function reverseLookup(graph: DesignSystemGraph, axis: TokenAxis, value: string): string[] {
  return graph.tokens
    .filter((t) => t.axis === axis && t.rawValue === value)
    .map((t) => t.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
