/**
 * Backwards-compatible re-export shim.
 *
 * The canonical module now lives in the Node-only `@diggy/service-auth`
 * package (shared by `@diggy/crawler` and `@diggy/api`). This file stays so
 * existing deep imports keep working; new code should import from
 * `@diggy/service-auth`.
 */
export * from "@diggy/service-auth";
