import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-irn", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Button.tsx": [
      "export const SaveButton = () => <button>Save</button>;",
      'export const CloseButton = () => <button aria-label="Close dialog"><svg aria-hidden="true" /></button>;',
    ].join("\n"),
  };
}

export const interactiveRoleNameAdapter: OracleAdapter = {
  ruleId: "a11y/interactive-role-name",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    // --- icon-only <button> variants ---
    {
      name: "icon-only-button-svg",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": "export const IconBtn = () => <button><svg /></button>;",
      }),
    },
    {
      name: "icon-only-button-svg-aria-hidden",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const CloseBtn = () => <button><svg aria-hidden="true" /></button>;',
      }),
    },
    {
      name: "icon-only-button-with-classname",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const MenuBtn = () => <button className="icon-btn"><svg /></button>;',
      }),
    },
    {
      name: "icon-only-button-with-onclick",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": "export const ActionBtn = () => <button onClick={() => {}}><svg /></button>;",
      }),
    },
    {
      name: "icon-only-button-disabled",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": "export const DisabledBtn = () => <button disabled><svg /></button>;",
      }),
    },
    {
      name: "icon-only-button-title-attr",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const TitleBtn = () => <button title="Close"><svg /></button>;',
      }),
    },
    {
      name: "icon-only-button-icon-class-element",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const IcoBtn = () => <button><i className="icon-close" /></button>;',
      }),
    },
    {
      name: "icon-only-button-type-submit",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const SubmitBtn = () => <button type="submit"></button>;',
      }),
    },
    {
      name: "icon-only-button-type-reset",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const ResetBtn = () => <button type="reset"></button>;',
      }),
    },
    {
      name: "empty-button",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": "export const EmptyBtn = () => <button></button>;",
      }),
    },
    {
      name: "button-img-no-alt",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const ImgBtn = () => <button><img src="icon.png" /></button>;',
      }),
    },
    {
      name: "empty-aria-label-button",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const EmptyLabelBtn = () => <button aria-label=""><svg /></button>;',
      }),
    },
    // --- <input> variants (unlabeled) ---
    {
      name: "bare-text-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const TextInput = () => <input type="text" />;',
      }),
    },
    {
      name: "bare-checkbox-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const Checkbox = () => <input type="checkbox" />;',
      }),
    },
    {
      name: "bare-radio-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const Radio = () => <input type="radio" />;',
      }),
    },
    {
      name: "bare-email-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const EmailInput = () => <input type="email" />;',
      }),
    },
    {
      name: "bare-password-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const PassInput = () => <input type="password" />;',
      }),
    },
    {
      name: "bare-search-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const SearchInput = () => <input type="search" />;',
      }),
    },
    {
      name: "bare-number-input",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const NumberInput = () => <input type="number" />;',
      }),
    },
    // --- <select> variants ---
    {
      name: "empty-select",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Select.tsx": "export const Sel = () => <select></select>;",
      }),
    },
    {
      name: "named-select-no-label",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Select.tsx": 'export const Sel = () => <select name="country" />;',
      }),
    },
    // --- <textarea> variants ---
    {
      name: "empty-textarea",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Textarea.tsx": "export const TA = () => <textarea></textarea>;",
      }),
    },
    {
      name: "textarea-with-attrs",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Textarea.tsx": 'export const TA = () => <textarea rows={3} cols={40}></textarea>;',
      }),
    },
    // --- <a> (anchor) variants ---
    {
      name: "anchor-no-text-svg",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Link.tsx": 'export const HomeLink = () => <a href="/"><svg /></a>;',
      }),
    },
    {
      name: "anchor-mailto-icon",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Link.tsx": 'export const EmailLink = () => <a href="mailto:x@x.com"><svg /></a>;',
      }),
    },
    {
      name: "anchor-tel-img-no-alt",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Link.tsx": 'export const PhoneLink = () => <a href="tel:+1234"><img src="phone.png" /></a>;',
      }),
    },
    {
      name: "anchor-svg-aria-hidden-no-text",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Link.tsx": 'export const NavLink = () => <a href="/home"><svg aria-hidden="true" /></a>;',
      }),
    },
    // --- div/span with interactive role ---
    {
      name: "div-role-button-no-label",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Widget.tsx": 'export const Btn = () => <div role="button"><svg /></div>;',
      }),
    },
    {
      name: "span-role-button-no-label",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Widget.tsx": 'export const Btn = () => <span role="button"><svg /></span>;',
      }),
    },
    {
      name: "div-role-button-empty",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Widget.tsx": 'export const Btn = () => <div role="button"></div>;',
      }),
    },
    // --- styled / composed variants ---
    {
      name: "styled-icon-button",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const B = () => <button style={{ padding: 0 }}><svg /></button>;',
      }),
    },
    {
      name: "icon-button-data-testid",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const B = () => <button data-testid="close-btn"><svg /></button>;',
      }),
    },
    {
      name: "multi-button-one-bad",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Toolbar.tsx": [
          'export const Toolbar = () => (',
          '  <>',
          '    <button aria-label="Bold"><svg /></button>',
          '    <button><svg /></button>',
          '  </>',
          ');',
        ].join("\n"),
      }),
    },
    {
      name: "input-type-text-placeholder-only",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Input.tsx": 'export const SearchBar = () => <input type="text" placeholder="Search..." />;',
      }),
    },
    {
      name: "select-self-closing-no-label",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Form.tsx": "export const Form = () => <select />;",
      }),
    },
    {
      name: "button-with-multiple-svg-no-text",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": 'export const B = () => <button><svg /><svg /></button>;',
      }),
    },
  ],

  metamorphic: [
    {
      name: "icon-only-button-svg-vs-icon-element",
      a: {
        "package.json": PKG,
        "src/m.tsx": 'export const B = () => <button><svg /></button>;',
      },
      b: {
        "package.json": PKG,
        "src/m.tsx": 'export const B = () => <button><i className="icon" /></button>;',
      },
      expectViolation: true,
    },
    {
      name: "aria-label-string-vs-dynamic-label",
      a: {
        "package.json": PKG,
        "src/m.tsx": 'export const B = () => <button aria-label="Close"><svg /></button>;',
      },
      b: {
        "package.json": PKG,
        "src/m.tsx": 'export const B = ({ l }: { l: string }) => <button aria-label={l}><svg /></button>;',
      },
      expectViolation: false,
    },
  ],

  falseFriends: [
    // FP class 1: aria-label on control
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <button aria-label="Close dialog"><svg /></button>;',
    },
    // FP class 2: visible text content
    {
      "package.json": PKG,
      "src/FF.tsx": "export const B = () => <button>Save</button>;",
    },
    // FP class 3: aria-labelledby
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <button aria-labelledby="lbl-id"><svg /></button>;',
    },
    // FP class 4: img with alt text inside
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <button><img alt="close" src="x.png" /></button>;',
    },
    // FP class 5: sr-only text span (nested text content)
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <button><svg aria-hidden="true" /><span className="sr-only">Close</span></button>;',
    },
    // FP class 6: aria-hidden on the control itself (hidden from AT)
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <button aria-hidden="true"><svg /></button>;',
    },
    // FP class 7: non-interactive element (div, span without role)
    {
      "package.json": PKG,
      "src/FF.tsx": "export const B = () => <div><svg /></div>;",
    },
    // FP class 8: custom (PascalCase) components — not checked by the rule
    {
      "package.json": PKG,
      "src/FF.tsx": "export const B = () => <MyButton><svg /></MyButton>;",
    },
    // FP class 9: input type="hidden" — not interactive
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const F = () => <input type="hidden" name="csrf" value="tok" />;',
    },
    // FP class 10: children prop (dynamic — static analyzer can't infer content)
    {
      "package.json": PKG,
      "src/FF.tsx": "export const B = ({ children }: { children: React.ReactNode }) => <button>{children}</button>;",
    },
    // FP class 11: labeled role=button
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = () => <span role="button" aria-label="open menu"><svg /></span>;',
    },
    // FP class 12: dynamic aria-label via prop
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const B = ({ label }: { label: string }) => <button aria-label={label}><svg /></button>;',
    },
    // FP class 13: standalone <label> element (not an interactive control)
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const F = () => <label htmlFor="email">Email</label>;',
    },
    // FP class 14: select with option text content — rule treats option children as accessible label
    {
      "package.json": PKG,
      "src/FF.tsx": 'export const F = () => <select><option value="a">Option A</option></select>;',
    },
  ],
};
