import type { OracleAdapter } from "../types.js";
import { colorAdapter } from "./tokens-no-hardcoded-color.js";
import { llmsTxtAdapter } from "./ai-surface-llms-txt-structure.js";

export const adapters: OracleAdapter[] = [colorAdapter, llmsTxtAdapter];
