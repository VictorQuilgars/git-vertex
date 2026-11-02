// Every request the main process sends to GitHub — and the sign-in proxy —
// goes through this, not Node's global fetch.
//
// Node's fetch has its own network stack: it ignores the system proxy (PAC,
// WPAD, the one a company pushes by policy) and trusts only the CA list Node
// was built with. On a work machine whose proxy inspects HTTPS with the
// company's own root, that is every request failing while the browser, on the
// same machine, works — which is how the desktop sign-in died on a Windows
// laptop: GitHub said "signed in", the code-for-token exchange never got out.
//
// Electron's net.fetch is Chromium's stack, the browser's: system proxy and the
// OS certificate store. `no-store` because Node's fetch had no cache and the
// callers expect none — a PR list must not come back 60 seconds stale from
// Chromium's HTTP cache after the user just opened one; conditional requests
// (conditionalGet's If-None-Match) still get their 304.
import { net } from 'electron'

export const netFetch: typeof fetch = (input, init) =>
  net.fetch(input instanceof URL ? input.toString() : (input as string | Request), {
    cache: 'no-store',
    ...init,
  }) as unknown as Promise<Response>
