import type { OracleAdapter } from "../types.js";
import { colorAdapter } from "./tokens-no-hardcoded-color.js";
import { llmsTxtAdapter } from "./ai-surface-llms-txt-structure.js";
import { presenceAdapters } from "../generic-presence-adapters.js";
import { hardcodedValueAdapters } from "../hardcoded-value-adapters.js";
import { vocabularyAdapters } from "../vocabulary-adapters.js";

export const adapters: OracleAdapter[] = [colorAdapter, llmsTxtAdapter, ...presenceAdapters, ...hardcodedValueAdapters, ...vocabularyAdapters];
