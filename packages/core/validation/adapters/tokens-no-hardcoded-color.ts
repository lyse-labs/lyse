import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-color", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Box.css": ".box { color: var(--color-fg); background: var(--color-bg); }",
    "src/Btn.tsx": 'export const Btn = () => <button className="text-fg" />;',
  };
}

export const colorAdapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-color",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    { name: "css-hex", apply: (f) => ({ ...f, "src/Box.css": ".box { color: #2563eb; }" }) },
    { name: "css-rgb", apply: (f) => ({ ...f, "src/Box.css": ".box { color: rgb(37, 99, 235); }" }) },
    { name: "css-hsl", apply: (f) => ({ ...f, "src/Box.css": ".box { color: hsl(217, 83%, 53%); }" }) },
    { name: "tailwind-arbitrary", apply: (f) => ({ ...f, "src/Btn.tsx": 'export const Btn = () => <button className="bg-[#ffffff]" />;' }) },
  ],
  metamorphic: [
    {
      name: "hex-eq-rgb",
      a: { "package.json": PKG, "src/m.css": ".a { color: #ffffff; }" },
      b: { "package.json": PKG, "src/m.css": ".a { color: rgb(255, 255, 255); }" },
      expectViolation: true,
    },
    {
      name: "shorthand-eq-longhand-hex",
      a: { "package.json": PKG, "src/m.css": ".a { color: #fff; }" },
      b: { "package.json": PKG, "src/m.css": ".a { color: #ffffff; }" },
      expectViolation: true,
    },
  ],
};
