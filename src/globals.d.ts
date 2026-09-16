/**
 * Build identity, substituted at compile time by the `define` block in `vite.config.ts`.
 *
 * These are literals inlined by the bundler, not runtime lookups — there is no object to read them
 * from and nothing to guard against at runtime. `src/buildInfo.ts` is the only place that touches
 * them; everything else imports from there.
 */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILT_AT__: string
