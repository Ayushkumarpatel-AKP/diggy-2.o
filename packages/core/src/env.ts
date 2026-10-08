/**
 * Server-side environment access without depending on Node's type definitions.
 *
 * The DOM lib has no `process`, and the extension bundle must not carry keys —
 * so this reads from `globalThis.process` when present and returns `undefined`
 * everywhere else (i.e. in the browser). Provider keys therefore only ever
 * resolve on the server side.
 */
export function readEnv(name: string): string | undefined {
  const holder = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const value = holder.process?.env?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
