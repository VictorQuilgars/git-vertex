/// <reference types="electron-vite/node" />

/**
 * The build-time values the main process reads through `import.meta.env`.
 * electron-vite injects them, but only declares the shape it ships with — so
 * anything a VITE_ variable is read as here has to be declared here too, or
 * the main-process typecheck cannot tell a real name from a typo (#105).
 */
interface ImportMetaEnv {
  /** OAuth app the GitHub sign-in flow authenticates against. */
  readonly VITE_GITHUB_CLIENT_ID: string
  /** Where the code-for-token exchange is proxied, so no secret ships. */
  readonly VITE_GITHUB_PROXY_URL: string
}
