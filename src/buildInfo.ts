/**
 * The build's own identity, in the form the colophon shows it.
 *
 * Lives at the `src/` root rather than in `model/` on purpose: `model/` is the document model
 * (`document`, `presets`, `settings`, `reflowPastedText`), and this is neither a document nor a
 * setting — it is a fact about the bundle. Kept in one module so nothing else has to know that the
 * values are compile-time globals (see `globals.d.ts` and `vite.config.ts`).
 *
 * The version and the commit answer different questions, which is why both are here: the version
 * says WHICH FEATURE (bumped by hand, one per PR), the commit says WHICH BUILD — and between
 * feature bumps the commit is the only one of the two that moves.
 */
export const APP_VERSION = __APP_VERSION__
export const APP_COMMIT = __APP_COMMIT__

/** e.g. "16 Sep 2026". Day-first because the app's presenter-facing language is European. */
export const BUILD_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date(__APP_BUILT_AT__))
