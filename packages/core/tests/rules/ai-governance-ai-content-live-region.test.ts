import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  _internal,
} from "../../src/rules/ai-governance-ai-content-live-region.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const { detectAiOutputSurface, detectLiveRegion } = _internal;

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-live-region-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// Unit: detectAiOutputSurface
// ---------------------------------------------------------------------------
describe("detectAiOutputSurface", () => {
  it("detects an AILabel component as an AI output surface (JSX)", () => {
    expect(detectAiOutputSurface(`<AILabel>Answer</AILabel>`)).toBe(true);
  });

  it("detects *AIResponse* component name as AI output surface", () => {
    expect(detectAiOutputSurface(`<ChatAIResponse content={msg}/>`)).toBe(true);
  });

  it("detects *ChatMessage* component as AI output surface", () => {
    expect(detectAiOutputSurface(`<ChatMessage role="assistant" />`)).toBe(true);
  });

  it("does NOT flag SystemChatMessageDisplay (substring but not segment match)", () => {
    expect(detectAiOutputSurface(`<SystemChatMessageDisplay msg={m} />`)).toBe(false);
  });

  it("detects isStreaming prop as streaming indicator (JSX prop on component)", () => {
    expect(detectAiOutputSurface(`<MessageBubble isStreaming={streaming} />`)).toBe(true);
  });

  it("does NOT detect isStreaming in a TypeScript interface as streaming indicator", () => {
    expect(detectAiOutputSurface(`interface Props { isStreaming: boolean; isGenerating: boolean; }`)).toBe(false);
  });

  it("does NOT detect isStreaming in a destructuring as streaming indicator", () => {
    expect(detectAiOutputSurface(`const { isStreaming } = props;`)).toBe(false);
  });

  it("detects isGenerating prop as streaming indicator", () => {
    expect(detectAiOutputSurface(`<OutputBlock isGenerating />`)).toBe(true);
  });

  it("returns false when no AI output surface is present", () => {
    expect(detectAiOutputSurface(`<button>Submit</button>`)).toBe(false);
  });

  it("does NOT flag a component whose name merely contains a common word (Button)", () => {
    expect(detectAiOutputSurface(`<Button isLoading />`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: detectLiveRegion
// ---------------------------------------------------------------------------
describe("detectLiveRegion", () => {
  it("detects aria-live=polite as a live region", () => {
    expect(detectLiveRegion(`<div aria-live="polite">{response}</div>`)).toBe(true);
  });

  it("detects aria-live=assertive as a live region", () => {
    expect(detectLiveRegion(`<section aria-live="assertive" />`)).toBe(true);
  });

  it("detects role=status as a live region", () => {
    expect(detectLiveRegion(`<div role="status">{output}</div>`)).toBe(true);
  });

  it("detects role=alert as a live region", () => {
    expect(detectLiveRegion(`<span role="alert">Error</span>`)).toBe(true);
  });

  it("detects PatternFly isLiveRegion prop as a live region", () => {
    expect(detectLiveRegion(`<TextContent isLiveRegion>{content}</TextContent>`)).toBe(true);
  });

  it("detects isLiveRegion={true} variant", () => {
    expect(detectLiveRegion(`<Panel isLiveRegion={true} />`)).toBe(true);
  });

  it("returns false when no live region attribute is present", () => {
    expect(detectLiveRegion(`<div className="response">{msg}</div>`)).toBe(false);
  });

  it("does NOT flag aria-live=off", () => {
    expect(detectLiveRegion(`<div aria-live="off">{msg}</div>`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: rule.evaluate
// ---------------------------------------------------------------------------
describe("rule.evaluate — integration", () => {
  it("emits info when aria-live=polite wraps an AI output component (React)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AiAnswer.tsx"), `
export function AiAnswer({ content }: { content: string }) {
  return (
    <div aria-live="polite">
      <AILabel>AI</AILabel>
      <p>{content}</p>
    </div>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toMatch(/aria-live/);
  });

  it("emits info when role=status wraps a ChatMessage component", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "ChatOutput.tsx"), `
export function ChatOutput({ msg }: { msg: string }) {
  return (
    <div role="status">
      <ChatMessage role="assistant">{msg}</ChatMessage>
    </div>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toMatch(/role="status"|role=.status/);
  });

  it("emits info when isLiveRegion wraps a streaming AI component", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "StreamingPanel.tsx"), `
export function StreamingPanel() {
  return (
    <TextContent isLiveRegion>
      <AIResponseBlock isStreaming={streaming} />
    </TextContent>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toMatch(/isLiveRegion/);
  });

  it("emits exactly 1 aggregate warning (not per-file) when AIResponse component has no live region", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "Response.tsx"), `
export function Response({ text }: { text: string }) {
  return (
    <div className="response">
      <ChatAIResponse content={text} />
    </div>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toMatch(/no live region/i);
    expect(warnings[0]!.message).toMatch(/Response\.tsx/);
  });

  it("emits 1 aggregate warning listing all N files when N AI-surface files have no live region (not N warnings)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AIComp1.tsx"), `export function C1() { return <div><ChatAIResponse content="x" /></div>; }`);
    writeFileSync(join(tmp, "src", "AIComp2.tsx"), `export function C2() { return <div><AILabel>AI</AILabel></div>; }`);
    writeFileSync(join(tmp, "src", "AIComp3.tsx"), `export function C3() { return <div><OutputBlock isGenerating /></div>; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toMatch(/3 files/);
    expect(warnings[0]!.message).toMatch(/AIComp1\.tsx/);
    expect(warnings[0]!.message).toMatch(/AIComp2\.tsx/);
    expect(warnings[0]!.message).toMatch(/AIComp3\.tsx/);
  });

  it("emits warning on Vue SFC with isGenerating prop and no live region", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AiStream.vue"), `
<template>
  <div class="stream">
    <AIResponseBlock :isGenerating="generating" />
  </div>
</template>
<script setup lang="ts">
const generating = ref(false);
</script>
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits warning when toast with role=status is in same file as AI output but does NOT wrap it (Fix 1: no false credit)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "ChatPage.tsx"), `
function Toast() {
  return <div role="status">Saved!</div>;
}

export function ChatPage() {
  return (
    <div>
      <Toast />
      <ChatAIResponse content={content} />
    </div>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits info when AI output is wrapped in aria-live div (Fix 1: proximity confirmed)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "ChatWrapped.tsx"), `
export function ChatWrapped() {
  return (
    <div aria-live="polite">
      <ChatAIResponse content={content} />
    </div>
  );
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("info");
  });

  it("emits info on Vue SFC with aria-live and AI marker", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AiOutput.vue"), `
<template>
  <section aria-live="polite">
    <AILabel>AI</AILabel>
    <p>{{ response }}</p>
  </section>
</template>
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings[0]!.severity).toBe("info");
  });

  it("emits no finding when no AI output or streaming component is present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "Button.tsx"), `
export function Button({ children }: { children: React.ReactNode }) {
  return <button type="button">{children}</button>;
}
`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("emits no finding when allowlisted via README.md", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AiAnswer.tsx"), `
export function AiAnswer() {
  return <div><ChatAIResponse content="x" /></div>;
}
`);
    writeFileSync(
      join(tmp, "README.md"),
      "# My DS\n\n<!-- lyse-disable ai-governance/ai-content-live-region -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("emits no finding and opportunities=0 on an empty repo", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});
