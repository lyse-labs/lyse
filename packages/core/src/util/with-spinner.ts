import { createSpinner, type Spinner } from "./spinner.js";

export interface WithSpinnerOptions<T> {
  enabled?: boolean;
  isTTY?: boolean;
  quiet?: boolean;
  machineFormat?: boolean;
  startLabel: string;
  successLabel: (result: T) => string;
  failLabel?: (errMsg: string) => string;
}

export async function withSpinner<T>(
  opts: WithSpinnerOptions<T>,
  fn: (spinner: Spinner) => Promise<T>,
): Promise<T> {
  const isTTY = opts.isTTY ?? (process.stderr.isTTY ?? false);
  const isQuiet = opts.quiet === true || process.env["LYSE_QUIET"] === "1";
  const enabled = opts.enabled ?? (isTTY && !isQuiet && !opts.machineFormat);
  const spinner = createSpinner({ isTTY, enabled });

  spinner.start(opts.startLabel);
  try {
    const result = await fn(spinner);
    spinner.succeed(opts.successLabel(result));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? (err.message.split("\n")[0] ?? err.message) : String(err);
    spinner.fail((opts.failLabel ?? ((m) => `Failed: ${m}`))(msg));
    throw err;
  }
}
