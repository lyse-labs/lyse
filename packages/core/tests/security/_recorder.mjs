/**
 * Node --import hook that wraps fetch / http / https to log any outbound
 * request to stderr with a __OUTBOUND__: prefix. Used by no-leak.test.ts to
 * assert the CLI never connects to public hosts.
 */
import http from "node:http";
import https from "node:https";

function tag(target, fnName) {
  const orig = target[fnName].bind(target);
  target[fnName] = function (options, ...rest) {
    const url =
      typeof options === "string"
        ? options
        : options?.href ??
          `${options?.protocol ?? ""}//${options?.host ?? options?.hostname ?? ""}${options?.path ?? ""}`;
    process.stderr.write(`__OUTBOUND__: ${url}\n`);
    return orig(options, ...rest);
  };
}

tag(http, "request");
tag(http, "get");
tag(https, "request");
tag(https, "get");

const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = function (input, init) {
    const url =
      typeof input === "string" ? input : input?.url ?? String(input);
    process.stderr.write(`__OUTBOUND__: ${url}\n`);
    return originalFetch.call(this, input, init);
  };
}
