// Splash window markup. Loaded into a frameless, transparent BrowserWindow via
// a data: URL so it needs no separate build entry or packaged asset — the whole
// thing is self-contained (inline SVG + CSS).
//
// ── Why the palette is written out here ─────────────────────────────────────
//
// This runs in the MAIN process, before any renderer exists, so it cannot read
// tokens.css. The values below are a SNAPSHOT of the seeds, and
// __tests__/splash-palette.test.ts fails if they drift from the real ones.
// That guard exists because this file missed the aqua/iris migration entirely
// and went on showing the old GitHub palette at every launch.
//
// The mark is the app's, geometry identical to resources/icon.svg: two branches
// converging on a vertex, the iris commits DOTTED because they are what the
// model proposed and you have not applied. It draws itself once, then the vertex
// breathes while the main window finishes loading.
//
// ── Why the timings are up here ─────────────────────────────────────────────
//
// The splash is sandboxed with no preload, so it cannot tell the main process
// that it has finished playing. The main process has to know the duration —
// and a duration copied into a second file is a duration that drifts. So the
// numbers live here once, the CSS below interpolates them, and index.ts holds
// the window open for SPLASH_ANIMATION_MS.
const T = {
  armDraw: 1150,
  irisDelay: 120,
  nodePop: 500,
  nodeDelays: [180, 460, 740],
  vertexIn: 500,
  vertexDelay: 1020,
  breatheDelay: 1600,
  breathe: 2400,
  wordFade: 600,
  wordDelay: 1200,
  sweep: 1500,
} as const

/**
 * How long the window is held back: the moment the MARK is complete — both arms
 * drawn, the six commits popped, the vertex landed. The vertex is the decision
 * the whole drawing converges on, so once it is there the drawing has said what
 * it had to say.
 *
 * The wordmark is deliberately NOT waited for. Its fade ends 280ms later and it
 * is around half way up at the handover — it is a label coming in over a mark
 * that has already resolved, and holding a launch for it buys nothing.
 *
 * `breathe` and `sweep` are not waited for either, and cannot be: they loop
 * forever on purpose, being what says "still working". Waiting on those would
 * hang the launch outright.
 */
export const SPLASH_ANIMATION_MS = Math.max(
  T.irisDelay + T.armDraw,
  Math.max(...T.nodeDelays) + T.nodePop,
  T.vertexDelay + T.vertexIn,
)

/**
 * What to hold instead when the system asks for reduced motion. The stylesheet
 * below then puts every element straight at its final state, so there is no
 * story left to wait for — but a splash that appears and vanishes in one frame
 * still reads as a glitch, so it keeps a floor.
 */
export const SPLASH_STILL_MS = 800

export function splashHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  :root {
    /* Snapshot of tokens.css seeds — see the note above. */
    --canvas:  #0E1116;
    --surface: #151A21;
    --aqua:    #3FD8C2;
    --iris:    #9B8FF5;
    --text:    #E8ECF1;
    --muted:   #808B9B;
    --hair:    rgba(232,236,241,0.07);
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; width: 100%; height: 100%;
    background: transparent; overflow: hidden;
    -webkit-user-select: none; user-select: none;
    cursor: default;
    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
  }
  body { display: flex; align-items: center; justify-content: center; padding: 22px; }

  .splash {
    position: relative;
    width: 316px; height: 376px;
    border-radius: 16px;
    border: 1px solid var(--hair);
    background: radial-gradient(70% 60% at 50% 40%, var(--surface) 0%, var(--canvas) 72%);
    box-shadow:
      0 1px 0 rgba(255,255,255,0.04) inset,
      0 26px 60px -18px rgba(0,0,0,0.85),
      0 6px 20px -10px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 26px; overflow: hidden;
    -webkit-app-region: drag;
  }

  .mark { width: 132px; height: 132px; overflow: visible; }

  /* The bars are three segments per branch, so the dash pattern runs across all
     three: one dasharray of the branch's total length draws the whole arm. */
  .arm {
    fill: none; stroke-width: 16; stroke-linecap: round;
    animation: draw ${T.armDraw}ms cubic-bezier(.55,.15,.25,1) forwards;
  }
  .arm.aqua { stroke: var(--aqua); stroke-dasharray: 165; stroke-dashoffset: 165; }
  .arm.iris { stroke: var(--iris); stroke-dasharray: 179; stroke-dashoffset: 179;
              animation-delay: ${T.irisDelay}ms; }

  .node {
    fill: none; opacity: 0; transform: scale(.3);
    transform-box: fill-box; transform-origin: center;
    animation: pop ${T.nodePop}ms cubic-bezier(.34,1.56,.64,1) forwards;
  }
  .node.aqua { stroke: var(--aqua); }
  .node.iris { stroke: var(--iris); }
  .n-top { animation-delay: ${T.nodeDelays[0]}ms; }
  .n-mid { animation-delay: ${T.nodeDelays[1]}ms; }
  .n-low { animation-delay: ${T.nodeDelays[2]}ms; }

  /* The vertex: a real annulus, the one neutral element. It is the decision, so
     it arrives last and is the only thing that keeps moving. */
  .vertex {
    fill: var(--text); opacity: 0;
    transform-box: fill-box; transform-origin: center;
    animation: vertex-in ${T.vertexIn}ms cubic-bezier(.34,1.56,.64,1) ${T.vertexDelay}ms forwards,
               breathe ${T.breathe}ms ease-in-out ${T.breatheDelay}ms infinite;
  }

  @keyframes draw      { to { stroke-dashoffset: 0; } }
  @keyframes pop       { to { opacity: 1; transform: scale(1); } }
  @keyframes fade-in   { to { opacity: 1; } }
  @keyframes vertex-in { 0% { opacity: 0; transform: scale(.2); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes breathe   { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }

  .wordmark { display: flex; flex-direction: column; align-items: center; gap: 12px;
    opacity: 0; animation: fade-in ${T.wordFade}ms ease ${T.wordDelay}ms forwards; }
  .name { font-size: 21px; font-weight: 600; letter-spacing: .05em; color: var(--text); }
  .name b { color: #fff; font-weight: 650; }

  .track { position: relative; width: 128px; height: 3px; border-radius: 3px;
    background: rgba(232,236,241,0.06); overflow: hidden; }
  .track::after {
    content: ""; position: absolute; top: 0; left: 0; height: 100%; width: 42%; border-radius: 3px;
    background: linear-gradient(90deg, transparent, var(--aqua), var(--iris), transparent);
    animation: sweep ${T.sweep}ms cubic-bezier(.5,.05,.5,.95) infinite;
  }
  @keyframes sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }

  .ver { font-size: 11px; letter-spacing: .08em; color: var(--muted); font-variant-numeric: tabular-nums; }

  @media (prefers-reduced-motion: reduce) {
    .arm { stroke-dashoffset: 0; animation: none; }
    .node { opacity: 1; transform: none; animation: none; }
    .vertex { opacity: 1; transform: none; animation: none; }
    .wordmark { opacity: 1; animation: none; }
    .track::after { animation: none; transform: translateX(90%); }
  }
</style>
</head>
<body>
  <div class="splash">
    <svg class="mark" viewBox="0 0 512 512" fill="none" role="img" aria-label="Git Vertex">
      <path class="arm aqua" d="M142.5 119.2L160.2 166.6 M183.8 229.4L202.2 278.6 M225.8 341.4L247.2 398.6" />
      <path class="arm iris" d="M369.5 119.2L350.5 169.9 M329.5 226.1L308.5 281.9 M287.5 338.1L264.8 398.6" />
      <circle class="node aqua n-top" cx="130" cy="86"  r="33" stroke-width="11" />
      <circle class="node aqua n-mid" cx="172" cy="198" r="30" stroke-width="9" />
      <circle class="node aqua n-low" cx="214" cy="310" r="30" stroke-width="9" />
      <circle class="node iris n-top" cx="382" cy="86"  r="33" stroke-width="11" />
      <circle class="node iris n-mid" cx="340" cy="198" r="30" stroke-width="12"
              stroke-linecap="round" stroke-dasharray="0 18.85" transform="rotate(110.6 340 198)" />
      <circle class="node iris n-low" cx="298" cy="310" r="30" stroke-width="12"
              stroke-linecap="round" stroke-dasharray="0 18.85" transform="rotate(110.6 298 310)" />
      <path class="vertex" fill-rule="evenodd"
            d="M214 422a42 42 0 1 0 84 0a42 42 0 1 0 -84 0ZM239 422a17 17 0 1 0 34 0a17 17 0 1 0 -34 0Z" />
    </svg>
    <div class="wordmark">
      <div class="name">Git&nbsp;<b>Vertex</b></div>
      <div class="track"></div>
      <div class="ver">v${version}</div>
    </div>
  </div>
</body>
</html>`
}
