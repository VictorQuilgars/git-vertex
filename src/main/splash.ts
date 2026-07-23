// Splash window markup. Loaded into a frameless, transparent BrowserWindow via
// a data: URL so it needs no separate build entry or packaged asset — the whole
// thing is self-contained (inline SVG + CSS). The V-shaped git graph draws
// itself once, then the merge node breathes and a green→blue bar sweeps while
// the main window finishes loading. Matches the app's dark palette exactly.
export function splashHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<style>
  :root {
    --ground: #0d1117;
    --glow:   #1c2128;
    --green:  #3fb950;
    --green-tip: #5eff8a;
    --blue:   #58a6ff;
    --text:   #e6edf3;
    --muted:  #6e7681;
    --hair:   rgba(240,246,252,0.07);
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
    background: radial-gradient(70% 60% at 50% 40%, var(--glow) 0%, var(--ground) 72%);
    box-shadow:
      0 1px 0 rgba(255,255,255,0.04) inset,
      0 26px 60px -18px rgba(0,0,0,0.85),
      0 6px 20px -10px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 26px; overflow: hidden;
    -webkit-app-region: drag;
  }
  .splash::before {
    content: ""; position: absolute; inset: 0 0 auto 0; height: 42%;
    background: linear-gradient(180deg, rgba(88,166,255,0.06), transparent);
    pointer-events: none;
  }

  .mark { width: 146px; height: 146px; display: block; }

  .arm {
    fill: none; stroke-width: 22; stroke-linecap: round;
    stroke-dasharray: 372; stroke-dashoffset: 372;
    animation: draw 1.15s cubic-bezier(.55,.15,.25,1) forwards;
  }
  .arm.green { stroke: var(--green); }
  .arm.blue  { stroke: var(--blue); animation-delay: .12s; }

  .node {
    fill: var(--ground); stroke-width: 12; opacity: 0; transform: scale(.3);
    transform-box: fill-box; transform-origin: center;
    animation: pop .5s cubic-bezier(.34,1.56,.64,1) forwards;
  }
  .node.green { stroke: var(--green); }
  .node.blue  { stroke: var(--blue); }
  .n-top { animation-delay: .18s; }
  .n-mid { animation-delay: .46s; }
  .n-low { animation-delay: .74s; }

  .merge-halo {
    fill: var(--green-tip); opacity: 0;
    transform-box: fill-box; transform-origin: center;
    animation: merge-in .5s cubic-bezier(.34,1.56,.64,1) 1.02s forwards,
               breathe 2.4s ease-in-out 1.6s infinite;
  }
  .merge-core { fill: var(--ground); opacity: 0; animation: fade-in .4s ease 1.12s forwards; }

  @keyframes draw    { to { stroke-dashoffset: 0; } }
  @keyframes pop     { to { opacity: 1; transform: scale(1); } }
  @keyframes fade-in { to { opacity: 1; } }
  @keyframes merge-in { 0% { opacity: 0; transform: scale(.2); } 100% { opacity: .55; transform: scale(1); } }
  @keyframes breathe  { 0%,100% { opacity: .40; transform: scale(1); } 50% { opacity: .85; transform: scale(1.14); } }

  .wordmark { display: flex; flex-direction: column; align-items: center; gap: 12px;
    opacity: 0; animation: fade-in .6s ease 1.2s forwards; }
  .name { font-size: 21px; font-weight: 600; letter-spacing: .05em; color: var(--text); }
  .name b { color: #fff; font-weight: 650; }

  .track { position: relative; width: 128px; height: 3px; border-radius: 3px;
    background: rgba(240,246,252,0.06); overflow: hidden; }
  .track::after {
    content: ""; position: absolute; top: 0; left: 0; height: 100%; width: 42%; border-radius: 3px;
    background: linear-gradient(90deg, transparent, var(--green), var(--blue), transparent);
    animation: sweep 1.5s cubic-bezier(.5,.05,.5,.95) infinite;
  }
  @keyframes sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }

  .ver { font-size: 11px; letter-spacing: .08em; color: var(--muted); font-variant-numeric: tabular-nums; }

  @media (prefers-reduced-motion: reduce) {
    .arm { stroke-dashoffset: 0; animation: none; }
    .node { opacity: 1; transform: none; animation: none; }
    .merge-halo { opacity: .55; animation: none; }
    .merge-core { opacity: 1; animation: none; }
    .wordmark { opacity: 1; animation: none; }
    .track::after { animation: none; transform: translateX(90%); }
  }
</style>
</head>
<body>
  <div class="splash">
    <svg class="mark" viewBox="0 0 512 512" role="img" aria-label="Git Vertex">
      <path class="arm green" d="M148 82 L256 422" />
      <path class="arm blue"  d="M364 82 L256 422" />
      <circle class="node green n-top" cx="148" cy="82"  r="24" stroke-width="13" />
      <circle class="node green n-mid" cx="184" cy="192" r="18" />
      <circle class="node green n-low" cx="220" cy="302" r="18" />
      <circle class="node blue n-top" cx="364" cy="82"  r="24" stroke-width="13" />
      <circle class="node blue n-mid" cx="328" cy="192" r="18" />
      <circle class="node blue n-low" cx="292" cy="302" r="18" />
      <circle class="merge-halo" cx="256" cy="422" r="30" />
      <circle class="merge-core" cx="256" cy="422" r="13" />
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
