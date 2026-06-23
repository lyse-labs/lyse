export interface ComputedTokenReading {
  token: string;        // custom property name incl. leading --
  mode: string;         // "root" or a mode selector like ".dark"
  computed: string;     // raw computed value from getComputedStyle
}

export interface RenderMeta {
  chromiumVersion: string;
  skippedNonCanonicalizable: number;
  error?: string;
}

/** Thrown when Playwright/Chromium is not installed; caller skips render cleanly. */
export class RenderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderUnavailableError";
  }
}
