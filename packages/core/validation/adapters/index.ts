import type { OracleAdapter } from "../types.js";
import { colorAdapter } from "./tokens-no-hardcoded-color.js";
import { llmsTxtAdapter } from "./ai-surface-llms-txt-structure.js";
import { mediaQueryAdapter } from "./tokens-no-hardcoded-media-query.js";
import { presenceAdapters } from "../generic-presence-adapters.js";
import { hardcodedValueAdapters } from "../hardcoded-value-adapters.js";
import { vocabularyAdapters } from "../vocabulary-adapters.js";
import { tokensStructuralAdapters } from "../tokens-structural-adapters.js";
import { aiSurfaceVersioningAdapters } from "../ai-surface-versioning-adapters.js";
import { componentAdapters } from "./component-adapters.js";
import { renderAdapters } from "../render-adapters.js";

export const adapters: OracleAdapter[] = [
  colorAdapter,
  llmsTxtAdapter,
  mediaQueryAdapter,
  ...presenceAdapters,
  ...hardcodedValueAdapters,
  ...tokensStructuralAdapters,
  ...vocabularyAdapters,
  ...aiSurfaceVersioningAdapters,
  ...componentAdapters,
  ...renderAdapters,
];
