import { describe, it, expect } from "vitest";
import {
  arrowImplicitReturnsJsx,
  bodyCallsHook,
  bodyReturnsJsx,
  extractFunctionBody,
  fileIsInHooksDir,
  filenameMatchesFunction,
} from "../../src/rules/_function-body-analysis.js";

describe("bodyCallsHook", () => {
  it("detects a top-level useState call", () => {
    expect(bodyCallsHook("{ const [s, setS] = useState(null); return s; }")).toBe(true);
  });

  it("detects a custom hook call", () => {
    expect(bodyCallsHook("{ const d = useUserData(id); return d; }")).toBe(true);
  });

  it("returns false when no hook call is present", () => {
    expect(bodyCallsHook("{ return tree.flat(); }")).toBe(false);
  });

  it("returns false for `use` followed by lowercase (non-hook)", () => {
    expect(bodyCallsHook("{ const x = used(1); usefulFn(); return 1; }")).toBe(false);
  });

  it("rejects member-access calls (obj.useThing)", () => {
    // Not a top-level hook call — this is a method on an object.
    expect(bodyCallsHook("{ return ctx.useStore(s => s.x); }")).toBe(false);
  });

  it("rejects hook calls nested inside an arrow function body", () => {
    const body = "{ const cb = () => { useState(0); }; return cb; }";
    expect(bodyCallsHook(body)).toBe(false);
  });

  it("rejects hook calls nested inside a nested function declaration", () => {
    const body = "{ function inner() { useEffect(() => {}, []); } return inner; }";
    expect(bodyCallsHook(body)).toBe(false);
  });

  it("finds a hook call past the legacy 2000-char cutoff", () => {
    const filler = "  const x = 1;\n".repeat(200); // ~3200 chars
    const body = `{\n${filler}\n  const v = useUserData(id);\n  return v;\n}`;
    expect(body.length).toBeGreaterThan(2000);
    expect(bodyCallsHook(body)).toBe(true);
  });
});

describe("bodyReturnsJsx", () => {
  it("detects `return <div>`", () => {
    expect(bodyReturnsJsx("{ return <div>hi</div>; }")).toBe(true);
  });

  it("detects `return <Suspense/>`", () => {
    expect(bodyReturnsJsx("{ return <Suspense fallback={null} />; }")).toBe(true);
  });

  it("detects fragment `return <>`", () => {
    expect(bodyReturnsJsx("{ return <>{children}</>; }")).toBe(true);
  });

  it("detects parenthesized `return ( <Foo /> )`", () => {
    expect(bodyReturnsJsx("{ return (\n  <Foo />\n); }")).toBe(true);
  });

  it("does NOT match `useMemo<Foo>(...)` at return", () => {
    expect(bodyReturnsJsx("{ return useMemo<Foo>(() => 1, []); }")).toBe(false);
  });

  it("does NOT match `Array<X>(10)` anywhere in body", () => {
    expect(bodyReturnsJsx("{ const a = Array<X>(10); return a.length; }")).toBe(false);
  });

  it("does NOT match `dynamic<T>(loader, opts)` at return", () => {
    expect(
      bodyReturnsJsx("{ return dynamic<Props>(() => import('./X'), { ssr: false }); }"),
    ).toBe(false);
  });

  it("does NOT flag pure utility `return tree.flat()`", () => {
    expect(bodyReturnsJsx("{ return tree.flat(); }")).toBe(false);
  });

  it("does NOT match `useMemoize<T>(callback)`", () => {
    expect(bodyReturnsJsx("{ return useMemoize<T>(cb); }")).toBe(false);
  });

  it("handles unknown lowercase tag as non-JSX (custom element heuristic)", () => {
    // `<my-element>` is technically valid custom-element HTML. We do not
    // claim it as JSX — too risky for FP.
    expect(bodyReturnsJsx("{ return <my-thing>x</my-thing>; }")).toBe(false);
  });

  it("does NOT match bare generic arrow `<T>(x: T) => x`", () => {
    expect(bodyReturnsJsx("{ return <T>(x: T) => x; }")).toBe(false);
  });

  it("does NOT match multi-param generic arrow `<T,U>(x, y) => ...`", () => {
    expect(bodyReturnsJsx("{ return <T,U>(x: T, y: U) => [x, y]; }")).toBe(false);
  });

  it("detects `return <Foo>{children}</Foo>`", () => {
    expect(bodyReturnsJsx("{ return <Foo>{children}</Foo>; }")).toBe(true);
  });

  it("detects self-closing `return <Foo />`", () => {
    expect(bodyReturnsJsx("{ return <Foo />; }")).toBe(true);
  });

  it("detects `return <Foo>text</Foo>`", () => {
    expect(bodyReturnsJsx("{ return <Foo>text</Foo>; }")).toBe(true);
  });

  it("rejects JSX return inside a nested function body", () => {
    const body = "{ const inner = () => { return <Foo/>; }; return null; }";
    expect(bodyReturnsJsx(body)).toBe(false);
  });

  it("accepts JSX return inside a braced control-flow block", () => {
    const body = "{ if (loading) { return <Spinner/>; } return null; }";
    expect(bodyReturnsJsx(body)).toBe(true);
  });

  it("accepts JSX return inside a for-loop block", () => {
    const body = "{ for (const x of xs) { return <X/>; } return null; }";
    expect(bodyReturnsJsx(body)).toBe(true);
  });

  it("accepts JSX return inside a try-block", () => {
    const body = "{ try { return <Y/>; } catch (e) {} return null; }";
    expect(bodyReturnsJsx(body)).toBe(true);
  });

  it("does NOT match `.map(x => <Z/>)` (no return keyword before `<`)", () => {
    const body = "{ return foo.map(x => <Z key={x}/>); }";
    expect(bodyReturnsJsx(body)).toBe(false);
  });

  it("does NOT detect indirect JSX via wrapper call (v0.1 limitation, avoids React Email / SSR FPs)", () => {
    expect(bodyReturnsJsx("{ return render(<Foo/>); }")).toBe(false);
  });

  it("does NOT match wrapper call whose first arg is not JSX", () => {
    expect(bodyReturnsJsx("{ return cache(() => fetchDeps()); }")).toBe(false);
  });

  it("does NOT match object-of-JSX factory `return { h1: () => <h1/> }`", () => {
    const body = "{ return { h1: ({children}) => <h1>{children}</h1> }; }";
    expect(bodyReturnsJsx(body)).toBe(false);
  });

  it("still detects real JSX return after an object-literal early return", () => {
    const body = "{ if (x) { return { foo: 1 }; } return <div/>; }";
    expect(bodyReturnsJsx(body)).toBe(true);
  });
});

describe("arrowImplicitReturnsJsx", () => {
  it("detects implicit-return arrow with JSX body", () => {
    expect(arrowImplicitReturnsJsx("export const X = (props) => <button/>", 0)).toBe(true);
  });

  it("does NOT match implicit-return arrow whose body is not JSX", () => {
    expect(arrowImplicitReturnsJsx("export const X = (s) => s.toUpperCase()", 0)).toBe(false);
  });

  it("does NOT match nested JSX inside a non-JSX implicit-return arrow", () => {
    expect(arrowImplicitReturnsJsx("export const X = (xs) => xs.map(x => <li/>)", 0)).toBe(false);
  });

  it("does NOT match a block-body arrow `=> { ... }`", () => {
    expect(arrowImplicitReturnsJsx("export const X = () => { return <div/>; }", 0)).toBe(false);
  });

  it("handles a typed return annotation before `=>`", () => {
    expect(arrowImplicitReturnsJsx("export const X = (p: P): JSX.Element => <Foo/>", 0)).toBe(true);
  });

  it("handles async arrow", () => {
    expect(arrowImplicitReturnsJsx("export const X = async (p) => <Foo/>", 0)).toBe(true);
  });
});

describe("extractFunctionBody", () => {
  it("extracts a simple body", () => {
    expect(extractFunctionBody("function f() { return 1; }", 0)).toBe(" return 1; ");
  });

  it("extracts a body with a nested block", () => {
    const src = "function f() { if (x) { return 1; } return 2; }";
    expect(extractFunctionBody(src, 0)).toBe(" if (x) { return 1; } return 2; ");
  });

  it("extracts a body containing an object literal", () => {
    const src = "function f() { return { a: 1, b: 2 }; }";
    expect(extractFunctionBody(src, 0)).toBe(" return { a: 1, b: 2 }; ");
  });

  it("does not include a sibling function's body", () => {
    const src = "function f() { return 1; } function g() { return 2; }";
    expect(extractFunctionBody(src, 0)).toBe(" return 1; ");
  });

  it("returns source.slice(declStart) when there is no opening brace", () => {
    const src = "function f(): void;";
    expect(extractFunctionBody(src, 0)).toBe("function f(): void;");
  });

  it("returns everything after `{` when no matching close before EOF", () => {
    const src = "function f() { return 1;";
    expect(extractFunctionBody(src, 0)).toBe(" return 1;");
  });
});

describe("fileIsInHooksDir", () => {
  it("matches a hooks directory", () => {
    expect(fileIsInHooksDir("apps/foo/src/hooks/use-toggle.ts")).toBe(true);
  });

  it("matches a nested hooks directory", () => {
    expect(fileIsInHooksDir("packages/x/hooks/index.ts")).toBe(true);
  });

  it("matches a use-*.ts filename outside hooks/", () => {
    expect(fileIsInHooksDir("src/utils/use-toggle.ts")).toBe(true);
  });

  it("matches use-*.tsx filename", () => {
    expect(fileIsInHooksDir("src/use-modal.tsx")).toBe(true);
  });

  it("does NOT match unrelated filename", () => {
    expect(fileIsInHooksDir("src/utils/format.ts")).toBe(false);
  });

  it("does NOT match a file whose path contains 'hooks' as a substring of a longer word", () => {
    expect(fileIsInHooksDir("src/myhooksrouter/index.ts")).toBe(false);
  });

  it("handles Windows-style separators", () => {
    expect(fileIsInHooksDir("apps\\foo\\src\\hooks\\use-x.ts")).toBe(true);
  });
});

describe("filenameMatchesFunction (issue #166)", () => {
  it("matches `toggle` in use-toggle.ts", () => {
    expect(filenameMatchesFunction("/x/hooks/use-toggle.ts", "toggle")).toBe(true);
  });

  it("matches `combineRef` in use-combine-ref.ts (kebab → camel)", () => {
    expect(
      filenameMatchesFunction("/x/hooks/use-combine-ref.ts", "combineRef"),
    ).toBe(true);
  });

  it("does NOT match an unrelated co-located helper", () => {
    expect(
      filenameMatchesFunction("/x/hooks/use-combine-ref.ts", "composeRefs"),
    ).toBe(false);
  });

  it("does NOT match a function whose name is already use-prefixed", () => {
    expect(filenameMatchesFunction("/x/hooks/use-toggle.ts", "useToggle")).toBe(
      false,
    );
  });

  it("does NOT match in a non `use-*` file inside hooks/", () => {
    expect(filenameMatchesFunction("/x/hooks/index.ts", "anything")).toBe(false);
  });

  it("does NOT match in a file outside hooks/ and without `use-` prefix", () => {
    expect(filenameMatchesFunction("/x/lib/helpers.ts", "anything")).toBe(false);
  });

  it("matches use-*.tsx filename", () => {
    expect(filenameMatchesFunction("/x/use-modal.tsx", "modal")).toBe(true);
  });

  it("handles Windows-style separators", () => {
    expect(
      filenameMatchesFunction("apps\\foo\\src\\hooks\\use-toggle.ts", "toggle"),
    ).toBe(true);
  });
});
