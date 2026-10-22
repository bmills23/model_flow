import pkg from '../package.json';

/** Injected by the vite `define` in vite.config.ts; absent under the test runner. */
declare const __BUILD_COMMIT__: string | undefined;

/** The app version (apps/web/package.json). Pre-1.0 while the evidence gap against published tables is open. */
export const APP_VERSION: string = pkg.version;

/** The short commit the build was made from; "unknown" when git was unavailable at build time. */
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === 'string' && __BUILD_COMMIT__ !== '' ? __BUILD_COMMIT__ : 'unknown';
