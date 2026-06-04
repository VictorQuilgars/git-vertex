"use strict";
(() => {
  // src/webview/ipc.ts
  var _vscode;
  function getVSCode() {
    if (!_vscode)
      _vscode = acquireVsCodeApi();
    return _vscode;
  }
  function send(msg) {
    getVSCode().postMessage(msg);
  }
  var _handlers = [];
  function onMessage(handler) {
    _handlers.push(handler);
    return () => {
      const idx = _handlers.indexOf(handler);
      if (idx >= 0)
        _handlers.splice(idx, 1);
    };
  }
  function initMessageListener() {
    window.addEventListener("message", (event) => {
      const msg = event.data;
      for (const h of _handlers) {
        try {
          h(msg);
        } catch (e) {
          console.error("Handler error:", e);
        }
      }
    });
  }

  // src/webview/graph.ts
  var LANE_WIDTH = 18;
  var ROW_HEIGHT = 28;
  var SVG_PAD_L = 10;
  var SVG_PAD_R = 6;
  var NODE_RADIUS = 5;
  var _commits = [];
  var _selectedHash = null;
  var _onSelectCommit;
  var _tableScrollEl;
  function initGraph(container, onSelect) {
    _tableScrollEl = container;
    _onSelectCommit = onSelect;
    onMessage((msg) => {
      if (msg.type === "log") {
        _commits = msg.commits;
        renderTable();
      }
    });
  }
  function filterCommits(query) {
    if (!query.trim()) {
      send({ type: "getLog" });
      return;
    }
    send({ type: "search", query });
  }
  function selectCommit(hash) {
    _selectedHash = hash;
    if (_tableScrollEl) {
      _tableScrollEl.querySelectorAll(".gv-commit-row").forEach((el) => {
        const h = el.dataset.hash;
        if (h === hash)
          el.classList.add("gv-commit-row--selected");
        else
          el.classList.remove("gv-commit-row--selected");
      });
    }
  }
  function svgWidth(commits) {
    const maxLane = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0);
    return Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 40);
  }
  function rowSvg(commit, svgW, rowIndex) {
    const lane = commit.lane ?? 0;
    const cx = SVG_PAD_L + lane * LANE_WIDTH;
    const cy = ROW_HEIGHT / 2;
    const color = commit.color ?? "#4d9de0";
    const isSelected = commit.hash === _selectedHash;
    let paths = "";
    for (const edge of commit.edges ?? []) {
      const fCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH;
      const fCy = cy;
      const tCx = SVG_PAD_L + edge.toLane * LANE_WIDTH;
      const relRows = edge.toRow - rowIndex;
      const tCy = relRows * ROW_HEIGHT + ROW_HEIGHT / 2;
      const ec = edge.color;
      let d;
      if (edge.type === "straight") {
        d = `M${fCx},${fCy} L${tCx},${tCy}`;
      } else if (edge.type === "fork-left" || edge.type === "fork-right") {
        const midY = fCy + ROW_HEIGHT * 0.6;
        d = `M${fCx},${fCy} L${fCx},${midY} Q${fCx},${tCy} ${tCx},${tCy}`;
      } else {
        const midY = fCy + ROW_HEIGHT * 0.4;
        d = `M${tCx},${tCy} L${tCx},${midY} Q${tCx},${fCy} ${fCx},${fCy}`;
      }
      paths += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ""}/>`;
    }
    const nodeStroke = isSelected ? "#ffffff" : color;
    const nodeStrokeW = isSelected ? 2.5 : 1.5;
    const circle = `<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${nodeStroke}" stroke-width="${nodeStrokeW}"/>`;
    return `<svg width="${svgW}" height="${ROW_HEIGHT}" style="flex-shrink:0;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">${paths}${circle}</svg>`;
  }
  function refChips(refs) {
    return refs.map((r) => {
      const isHead = r.startsWith("HEAD");
      const isTag = r.startsWith("tag:");
      const isRemote = r.includes("origin/") || r.startsWith("remotes/");
      let cls = "gv-ref";
      if (isHead)
        cls += " gv-ref--head";
      else if (isTag)
        cls += " gv-ref--tag";
      else if (isRemote)
        cls += " gv-ref--remote";
      else
        cls += " gv-ref--local";
      const label = r.replace(/^HEAD -> /, "").replace(/^tag: /, "");
      return `<span class="${cls}">${esc(label)}</span>`;
    }).join("");
  }
  function avatarHtml(author) {
    const parts = author.trim().split(/\s+/);
    const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : author.substring(0, 2).toUpperCase();
    let h = 0;
    for (let i = 0; i < author.length; i++)
      h = h * 31 + author.charCodeAt(i) & 65535;
    const colors = ["#2dd4bf", "#4d9de0", "#9b59b6", "#22d3ee", "#3fb950", "#f472b6", "#e879f9", "#34d399"];
    const bg = colors[h % colors.length];
    return `<span class="gv-avatar" style="background:${bg};color:#fff">${esc(initials)}</span>`;
  }
  function relativeDate(dateStr) {
    if (!dateStr)
      return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
      return dateStr;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1)
      return "maintenant";
    if (mins < 60)
      return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
      return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30)
      return `${days}j`;
    const months = Math.floor(days / 30);
    if (months < 12)
      return `${months}mo`;
    return `${Math.floor(months / 12)}a`;
  }
  function renderTable() {
    if (!_tableScrollEl)
      return;
    const commits = _commits;
    if (!commits.length) {
      _tableScrollEl.innerHTML = '<div class="gv-placeholder"><span class="gv-placeholder-icon">\u2394</span><span>Aucun commit \xE0 afficher</span></div>';
      return;
    }
    const sw = svgWidth(commits);
    const thGraph = document.getElementById("gv-th-graph");
    if (thGraph)
      thGraph.style.width = `${sw}px`;
    const rows = commits.map((c, i) => {
      const isSelected = c.hash === _selectedHash;
      const svg = rowSvg(c, sw, i);
      const chips = refChips(c.refs ?? []);
      const avatar = avatarHtml(c.author);
      const date = relativeDate(c.date);
      const sha = esc(c.shortHash);
      const bg = isSelected ? "background:#1c2128" : "";
      return `<div class="gv-commit-row${isSelected ? " gv-commit-row--selected" : ""}" data-hash="${esc(c.hash)}" style="${bg}">
  <div class="gv-td gv-td--graph">${svg}</div>
  <div class="gv-td gv-td--message">
    <span class="gv-msg-text" title="${esc(c.message)}">${esc(c.message)}</span>
    ${chips}
  </div>
  <div class="gv-td gv-td--author">${avatar}<span style="overflow:hidden;text-overflow:ellipsis">${esc(c.author)}</span></div>
  <div class="gv-td gv-td--date">${date}</div>
  <div class="gv-td gv-td--sha">${sha}</div>
  <div class="gv-td gv-td--bar"></div>
</div>`;
    }).join("");
    _tableScrollEl.innerHTML = rows;
    _tableScrollEl.querySelectorAll(".gv-commit-row").forEach((el) => {
      el.addEventListener("click", () => {
        const hash = el.dataset.hash;
        if (!hash)
          return;
        _selectedHash = hash;
        const commit = _commits.find((c) => c.hash === hash);
        if (commit && _onSelectCommit)
          _onSelectCommit(commit);
        _tableScrollEl.querySelectorAll(".gv-commit-row").forEach((r) => {
          r.classList.toggle("gv-commit-row--selected", r.dataset.hash === hash);
          r.style.background = r.dataset.hash === hash ? "#1c2128" : "";
        });
      });
    });
  }
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/webview/rightPanel.ts
  var _detailContainer;
  var _currentHash = null;
  var _currentDiff = "";
  var _files = [];
  var PANEL_STYLES = `
<style>
/* \u2500\u2500 Right panel shared \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.rp-tabs { display:flex; border-bottom:1px solid #21262d; background:#161b22; flex-shrink:0; }
.rp-tab {
  padding: 6px 14px; font-size: 12px; color: #8b949e; cursor: pointer;
  border-bottom: 2px solid transparent; transition: color 0.1s;
  user-select: none;
}
.rp-tab:hover { color: #e6edf3; }
.rp-tab--active { color: #58a6ff; border-bottom-color: #58a6ff; }

/* \u2500\u2500 Commit detail \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.cd-outer { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.cd-header { padding: 10px 12px; border-bottom: 1px solid #21262d; flex-shrink:0; }
.cd-hash { font-family: monospace; font-size: 11px; color: #8b949e; margin-bottom: 3px; }
.cd-message { font-size: 13px; font-weight: 600; color: #e6edf3; margin-bottom: 5px; word-break:break-word; }
.cd-meta { font-size: 11px; color: #8b949e; display:flex; gap:10px; flex-wrap:wrap; }
.cd-refs { display:flex; gap:4px; flex-wrap:wrap; margin-top:5px; }
.cd-ref { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.cd-ref--local { background:#1b3a2d; color:#3fb950; border:1px solid #2ea043; }
.cd-ref--remote { background:#1c2a3a; color:#58a6ff; border:1px solid #388bfd; }
.cd-ref--head { background:#2d1f6e; color:#d2a8ff; border:1px solid #8957e5; }
.cd-ref--tag { background:#3d2b00; color:#e3b341; border:1px solid #9e6a03; }
.cd-actions { display:flex; gap:6px; padding: 6px 12px; border-bottom:1px solid #21262d; flex-shrink:0; }
.cd-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 11px; padding: 3px 9px; border-radius: 4px; cursor: pointer;
}
.cd-btn:hover { background: #30363d; }
.cd-body { flex:1; display:flex; min-height:0; overflow:hidden; }
.cd-files { width: 200px; flex-shrink:0; border-right:1px solid #21262d; overflow-y:auto; }
.cd-file {
  display:flex; align-items:center; gap:5px; padding: 4px 8px; cursor:pointer;
  font-size: 12px; color:#e6edf3; border-bottom:1px solid #161b22;
}
.cd-file:hover { background:#161b22; }
.cd-file--active { background:#1c2128 !important; }
.cd-file-status { font-size:11px; font-weight:700; width:13px; flex-shrink:0; }
.cd-file-status--A { color:#3fb950; }
.cd-file-status--M { color:#58a6ff; }
.cd-file-status--D { color:#f85149; }
.cd-file-status--R { color:#e3b341; }
.cd-file-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cd-diff { flex:1; overflow-y:auto; font-family:monospace; font-size:12px; line-height:1.5; }
.cd-diff-empty { padding:12px; color:#8b949e; }
.cd-files-loading { padding:10px; color:#8b949e; font-size:12px; }

/* \u2500\u2500 Staging \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.st-outer { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.st-section-hdr {
  display:flex; align-items:center; justify-content:space-between;
  padding: 5px 10px; background:#161b22; border-bottom:1px solid #21262d;
  font-size:11px; font-weight:600; color:#8b949e; text-transform:uppercase; letter-spacing:0.4px;
  flex-shrink:0;
}
.st-count { font-size:10px; background:#21262d; border-radius:8px; padding:1px 5px; color:#8b949e; }
.st-file-list { overflow-y:auto; flex-shrink:0; max-height: 130px; }
.st-file {
  display:flex; align-items:center; gap:5px; padding: 3px 10px; cursor:pointer;
  font-size:12px; border-bottom:1px solid #161b22;
}
.st-file:hover { background:#1c2128; }
.st-file-status { font-size:10px; font-weight:700; width:12px; flex-shrink:0; }
.st-file-status--A { color:#3fb950; }
.st-file-status--M { color:#58a6ff; }
.st-file-status--D { color:#f85149; }
.st-file-status--U { color:#f0883e; }
.st-file-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e6edf3; }
.st-file-actions { display:flex; gap:3px; opacity:0; transition:opacity 0.1s; }
.st-file:hover .st-file-actions { opacity:1; }
.st-btn {
  background:#21262d; border:1px solid #30363d; color:#e6edf3;
  font-size:11px; padding:2px 6px; border-radius:4px; cursor:pointer;
}
.st-btn:hover { background:#30363d; }
.st-btn--green { background:#1b3a2d; border-color:#2ea043; color:#3fb950; }
.st-btn--green:hover { background:#2ea043; color:#fff; }
.st-btn--red { background:#2a0d0d; border-color:#f85149; color:#f85149; }
.st-btn--red:hover { background:#f85149; color:#fff; }
.st-empty { padding:5px 10px; font-size:11px; color:#8b949e; font-style:italic; }
.st-commit-area { flex-shrink:0; padding: 8px 10px; border-top:1px solid #21262d; }
.st-commit-input {
  width:100%; background:#0d1117; border:1px solid #30363d; color:#e6edf3;
  padding: 5px 8px; border-radius:4px; font-size:12px; resize:none;
  font-family: inherit;
}
.st-commit-input:focus { outline:none; border-color:#58a6ff; }
.st-commit-row { display:flex; gap:6px; margin-top:5px; align-items:center; }
.st-commit-btn {
  background:#1b3a2d; border:1px solid #2ea043; color:#3fb950;
  font-size:12px; padding:4px 14px; border-radius:4px; cursor:pointer; font-weight:600;
}
.st-commit-btn:hover { background:#2ea043; color:#fff; }
.st-commit-btn:disabled { opacity:0.4; cursor:not-allowed; }
.st-error { color:#f85149; font-size:11px; margin-top:3px; }
.st-diff-area { flex:1; min-height:0; overflow-y:auto; border-top:1px solid #21262d; font-family:monospace; font-size:12px; line-height:1.5; }

/* \u2500\u2500 Diff rendering shared \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.diff-line { white-space:pre; padding:0 12px; display:block; min-width:max-content; }
.diff-line--add { background:#0d2a1a; color:#3fb950; }
.diff-line--del { background:#2a0d0d; color:#f85149; }
.diff-line--hunk { background:#161b22; color:#8b949e; }
.diff-line--meta { color:#8b949e; }
</style>`;
  function initRightPanel(container) {
    _detailContainer = container;
    onMessage((msg) => {
      if (msg.type === "commitFiles" && msg.hash === _currentHash) {
        _files = msg.files;
        renderFileList();
      }
      if (msg.type === "diff" && msg.hash === _currentHash) {
        _currentDiff = msg.diff;
        renderDiffInContainer(null);
      }
      if (msg.type === "workingFileDiff") {
        renderStagingDiff(msg.diff, msg.filepath, msg.staged);
      }
    });
  }
  function showCommitInPanel(container, commit) {
    _detailContainer = container;
    _currentHash = commit.hash;
    _files = [];
    _currentDiff = "";
    const refs = (commit.refs ?? []).map((r) => {
      const isTag = r.startsWith("tag:");
      const isRemote = r.includes("origin/");
      const isHead = r.startsWith("HEAD");
      const cls = isHead ? "cd-ref cd-ref--head" : isTag ? "cd-ref cd-ref--tag" : isRemote ? "cd-ref cd-ref--remote" : "cd-ref cd-ref--local";
      const label = r.replace(/^HEAD -> /, "").replace(/^tag: /, "");
      return `<span class="${cls}">${esc2(label)}</span>`;
    }).join("");
    container.innerHTML = PANEL_STYLES + `
<div class="cd-outer">
  <div class="cd-header">
    <div class="cd-hash">${esc2(commit.shortHash)}</div>
    <div class="cd-message">${esc2(commit.message)}</div>
    <div class="cd-meta">
      <span>${esc2(commit.author)}</span>
      <span>${formatDateFull(commit.date)}</span>
    </div>
    ${refs ? `<div class="cd-refs">${refs}</div>` : ""}
  </div>
  <div class="cd-actions">
    <button class="cd-btn" id="cd-checkout-btn">Checkout</button>
    <button class="cd-btn" id="cd-copy-sha-btn">Copier SHA</button>
  </div>
  <div class="cd-body">
    <div class="cd-files" id="cd-file-list"><div class="cd-files-loading">Chargement\u2026</div></div>
    <div class="cd-diff" id="cd-diff-content"><div class="cd-diff-empty">S\xE9lectionnez un fichier</div></div>
  </div>
</div>`;
    container.querySelector("#cd-checkout-btn")?.addEventListener("click", () => {
      send({ type: "checkout", ref: commit.hash });
    });
    container.querySelector("#cd-copy-sha-btn")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(commit.hash).catch(() => {
      });
    });
    send({ type: "getCommitFiles", hash: commit.hash });
    send({ type: "getDiff", hash: commit.hash });
  }
  function renderFileList() {
    const listEl = _detailContainer?.querySelector("#cd-file-list");
    if (!listEl)
      return;
    if (!_files.length) {
      listEl.innerHTML = '<div class="cd-files-loading">Aucun fichier modifi\xE9</div>';
      return;
    }
    listEl.innerHTML = _files.map((f, i) => `
<div class="cd-file" data-idx="${i}">
  <span class="cd-file-status cd-file-status--${esc2(f.status)}">${esc2(f.status)}</span>
  <span class="cd-file-name" title="${esc2(f.path)}">${esc2(basename(f.path))}</span>
</div>`).join("");
    listEl.querySelectorAll(".cd-file").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.idx ?? "0");
        const file = _files[idx];
        if (!file)
          return;
        listEl.querySelectorAll(".cd-file").forEach((e) => e.classList.remove("cd-file--active"));
        el.classList.add("cd-file--active");
        renderDiffInContainer(file);
      });
    });
  }
  function renderDiffInContainer(file) {
    const diffEl = _detailContainer?.querySelector("#cd-diff-content");
    if (!diffEl)
      return;
    const diff = file ? extractFileDiff(_currentDiff, file.path) : _currentDiff;
    if (!diff.trim()) {
      diffEl.innerHTML = '<div class="cd-diff-empty">Aucun diff disponible</div>';
      return;
    }
    diffEl.innerHTML = `<code>${renderDiffLines(diff)}</code>`;
  }
  var _stagingContainer;
  function showStagingInPanel(container, changes) {
    _stagingContainer = container;
    const { staged, unstaged, untracked } = changes;
    const totalUnstaged = unstaged.length + untracked.length;
    container.innerHTML = PANEL_STYLES + `
<div class="st-outer">
  <!-- Staged section -->
  <div class="st-section-hdr">
    <span>Staged <span class="st-count">${staged.length}</span></span>
    <div style="display:flex;gap:4px">
      ${staged.length > 0 ? '<button class="st-btn st-btn--red" id="st-unstage-all">Tout d\xE9sindexer</button>' : ""}
    </div>
  </div>
  <div class="st-file-list" id="st-staged-list">
    ${staged.length === 0 ? '<div class="st-empty">Aucun fichier index\xE9</div>' : staged.map((f) => fileRow(f, true)).join("")}
  </div>

  <!-- Unstaged section -->
  <div class="st-section-hdr">
    <span>Modifications <span class="st-count">${totalUnstaged}</span></span>
    <div style="display:flex;gap:4px">
      ${totalUnstaged > 0 ? '<button class="st-btn st-btn--green" id="st-stage-all">Tout indexer</button>' : ""}
    </div>
  </div>
  <div class="st-file-list" id="st-unstaged-list">
    ${totalUnstaged === 0 ? '<div class="st-empty">Aucune modification</div>' : [
      ...unstaged.map((f) => fileRow(f, false)),
      ...untracked.map((p) => fileRow({ path: p, status: "U" }, false, true))
    ].join("")}
  </div>

  <!-- Commit area -->
  <div class="st-commit-area">
    <textarea class="st-commit-input" id="st-commit-msg" rows="3" placeholder="Message de commit\u2026"></textarea>
    <div class="st-commit-row">
      <button class="st-commit-btn" id="st-commit-btn" ${staged.length === 0 ? "disabled" : ""}>Committer</button>
    </div>
    <div class="st-error" id="st-commit-error"></div>
  </div>

  <!-- Diff area -->
  <div class="st-diff-area" id="st-diff-area"></div>
</div>`;
    container.querySelector("#st-stage-all")?.addEventListener("click", () => {
      send({ type: "stageAll" });
    });
    container.querySelector("#st-unstage-all")?.addEventListener("click", () => {
      send({ type: "unstage", files: staged.map((f) => f.path) });
    });
    container.querySelector("#st-commit-btn")?.addEventListener("click", () => {
      const msg = container.querySelector("#st-commit-msg")?.value?.trim();
      const errEl = container.querySelector("#st-commit-error");
      if (!msg) {
        if (errEl)
          errEl.textContent = "Message requis";
        return;
      }
      if (errEl)
        errEl.textContent = "";
      send({ type: "commit", message: msg });
    });
    container.querySelectorAll(".st-file[data-path]").forEach((el) => {
      const path = el.dataset.path;
      const isStaged = el.dataset.staged === "true";
      const isUntracked = el.dataset.untracked === "true";
      el.addEventListener("click", (e) => {
        const target = e.target;
        if (target.closest(".st-file-actions"))
          return;
        send({ type: "getWorkingFileDiff", filepath: path, staged: isStaged });
      });
      el.querySelector(".st-action-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isStaged)
          send({ type: "unstage", files: [path] });
        else
          send({ type: "stage", files: [path] });
      });
      el.querySelector(".st-discard-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        send({ type: "discardFile", file: path });
      });
    });
  }
  function renderStagingDiff(diff, filepath, staged) {
    const area = _stagingContainer?.querySelector("#st-diff-area");
    if (!area)
      return;
    if (!diff.trim()) {
      area.innerHTML = `<div style="padding:8px 12px;color:#8b949e;font-size:12px">Aucun diff pour ${esc2(filepath)}</div>`;
      return;
    }
    area.innerHTML = `
<div style="font-size:11px;color:#8b949e;padding:5px 12px;border-bottom:1px solid #21262d">${esc2(filepath)}${staged ? " (index\xE9)" : ""}</div>
<code>${renderDiffLines(diff)}</code>`;
  }
  function fileRow(f, isStaged, isUntracked = false) {
    const status = isUntracked ? "U" : f.status;
    const statusCls = `st-file-status--${status === "D" ? "D" : status === "A" ? "A" : status === "U" ? "U" : "M"}`;
    const actionIcon = isStaged ? "\u2212" : "+";
    const actions = `<div class="st-file-actions">
  <button class="st-btn st-action-btn" title="${isStaged ? "D\xE9sindexer" : "Indexer"}">${actionIcon}</button>
  ${!isStaged && !isUntracked ? '<button class="st-btn st-btn--red st-discard-btn" title="Annuler">\u21A9</button>' : ""}
</div>`;
    return `<div class="st-file" data-path="${esc2(f.path)}" data-staged="${isStaged}" data-untracked="${isUntracked}">
  <span class="st-file-status ${statusCls}">${esc2(status)}</span>
  <span class="st-file-name" title="${esc2(f.path)}">${esc2(basename(f.path))}</span>
  ${actions}
</div>`;
  }
  function renderDiffLines(diff) {
    return diff.split("\n").map((line) => {
      let cls = "diff-line";
      if (line.startsWith("+") && !line.startsWith("+++"))
        cls += " diff-line--add";
      else if (line.startsWith("-") && !line.startsWith("---"))
        cls += " diff-line--del";
      else if (line.startsWith("@@"))
        cls += " diff-line--hunk";
      else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++"))
        cls += " diff-line--meta";
      return `<span class="${cls}">${esc2(line)}</span>`;
    }).join("\n");
  }
  function extractFileDiff(diff, filePath) {
    const sections = [];
    const lines = diff.split("\n");
    let current = [];
    for (const line of lines) {
      if (line.startsWith("diff --git") && current.length) {
        sections.push(current.join("\n"));
        current = [];
      }
      current.push(line);
    }
    if (current.length)
      sections.push(current.join("\n"));
    return sections.find((s) => s.includes(filePath)) ?? diff;
  }
  function formatDateFull(dateStr) {
    if (!dateStr)
      return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
      return dateStr;
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  function basename(p) {
    return p.split(/[/\\]/).pop() ?? p;
  }
  function esc2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/webview/main.ts
  var STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
body {
  background: var(--vscode-editor-background, #0d1117);
  color: var(--vscode-editor-foreground, #e6edf3);
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
}

/* \u2500\u2500 Toolbar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-toolbar {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: var(--vscode-sideBar-background, #161b22);
  border-bottom: 1px solid var(--vscode-panel-border, #21262d);
  flex-shrink: 0;
  overflow: hidden;
}
.tb-repo {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-editor-foreground, #e6edf3);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.tb-branch-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #1c2a3a;
  border: 1px solid #388bfd;
  color: #58a6ff;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 10px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.tb-branch-icon { font-style: normal; flex-shrink: 0; }
.tb-spacer { flex: 1; }
#gv-search {
  width: 160px;
  flex-shrink: 1;
  min-width: 80px;
  background: var(--vscode-input-background, #0d1117);
  border: 1px solid var(--vscode-input-border, #30363d);
  color: var(--vscode-input-foreground, #e6edf3);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}
#gv-search:focus { border-color: #58a6ff; }
.tb-sep { width: 1px; height: 18px; background: #30363d; flex-shrink: 0; margin: 0 2px; }
.tb-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--vscode-editor-foreground, #e6edf3);
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.tb-btn:hover { background: #21262d; border-color: #30363d; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-btn--changes {
  position: relative;
  color: #e6edf3;
}
.tb-btn--changes .tb-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  background: #f85149;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 8px;
  min-width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  line-height: 1;
}
.tb-icon { font-style: normal; font-size: 14px; line-height: 1; }

/* \u2500\u2500 Main area \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
#gv-app { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }

/* \u2500\u2500 Commit table \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-table-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table header */
#gv-table-header {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0;
  background: var(--vscode-sideBar-background, #161b22);
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
  font-size: 11px;
  color: #8b949e;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  user-select: none;
}
.gv-th { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
.gv-th--graph { flex-shrink: 0; } /* width set by JS */
.gv-th--message { flex: 1; min-width: 0; }
.gv-th--author { width: 120px; }
.gv-th--date { width: 90px; }
.gv-th--sha { width: 72px; }
.gv-th--bar { width: 80px; }

/* Table scroll */
#gv-table-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }

/* Table rows */
.gv-commit-row {
  display: flex;
  align-items: center;
  height: 28px;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
  transition: background 0.05s;
}
.gv-commit-row:hover { background: #161b22 !important; }
.gv-commit-row--selected { background: #1c2128 !important; }

.gv-td { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; flex-shrink: 0; }
.gv-td--graph { padding: 0; flex-shrink: 0; }
.gv-td--message { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.gv-td--author { width: 120px; color: #8b949e; font-size: 11px; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.gv-td--date { width: 90px; color: #8b949e; font-size: 11px; }
.gv-td--sha { width: 72px; color: #6e7681; font-family: monospace; font-size: 11px; }
.gv-td--bar { width: 80px; }

.gv-msg-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-editor-foreground, #e6edf3); }
.gv-ref { font-size: 10px; padding: 1px 4px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; font-weight: 500; }
.gv-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.gv-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.gv-ref--head { background: #2d1f6e; color: #d2a8ff; border: 1px solid #8957e5; }
.gv-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }

.gv-avatar {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #21262d;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: #8b949e;
  overflow: hidden;
}

/* Change bar */
.gv-bar { display: flex; align-items: center; gap: 3px; }
.gv-bar-add { height: 8px; background: #3fb950; border-radius: 2px; }
.gv-bar-del { height: 8px; background: #f85149; border-radius: 2px; }
.gv-bar-label { font-size: 10px; color: #8b949e; white-space: nowrap; }

/* \u2500\u2500 Resizable divider \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-divider {
  width: 4px;
  flex-shrink: 0;
  background: #21262d;
  cursor: col-resize;
  transition: background 0.1s;
  position: relative;
  z-index: 10;
}
#gv-divider:hover, #gv-divider.dragging { background: #388bfd; }

/* \u2500\u2500 Right panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-right-pane {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #21262d;
}

/* \u2500\u2500 Toast \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#gv-toast-layer {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.gv-toast {
  background: #21262d;
  border: 1px solid #30363d;
  color: #e6edf3;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  pointer-events: auto;
  animation: gv-toast-in 0.2s ease;
}
.gv-toast--error { background: #2a0d0d; border-color: #f85149; color: #f85149; }
@keyframes gv-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* \u2500\u2500 Placeholder \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.gv-placeholder {
  display: flex; align-items: center; justify-content: center; height: 100%;
  color: #8b949e; font-size: 12px; flex-direction: column; gap: 8px;
}
.gv-placeholder-icon { font-size: 28px; opacity: 0.25; }

/* \u2500\u2500 Scrollbars \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #484f58; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #6e7681; }
`;
  var _currentBranch = "";
  var _repoName = "";
  var _workingChanges = { staged: [], unstaged: [], untracked: [] };
  var _panelMode = "staging";
  function buildLayout() {
    const app = document.getElementById("app");
    app.innerHTML = `
<style>${STYLES}</style>

<div id="gv-app">
  <!-- Toolbar -->
  <div id="gv-toolbar">
    <span class="tb-repo" id="tb-repo-name">\u2014</span>
    <span class="tb-branch-chip" id="tb-branch-chip">
      <i class="tb-icon">\u2387</i>
      <span id="tb-branch-name">\u2026</span>
    </span>
    <span class="tb-spacer"></span>
    <input id="gv-search" type="search" placeholder="Rechercher\u2026" aria-label="Search commits" />
    <button class="tb-btn" id="tb-fetch-btn" title="Fetch"><i class="tb-icon">\u2193</i> Fetch</button>
    <button class="tb-btn" id="tb-pull-btn" title="Pull"><i class="tb-icon">\u21E9</i> Pull</button>
    <button class="tb-btn" id="tb-push-btn" title="Push"><i class="tb-icon">\u21E7</i> Push</button>
    <span class="tb-sep"></span>
    <button class="tb-btn tb-btn--changes" id="tb-changes-btn" title="Working changes">
      <i class="tb-icon">\u25C8</i> Changes
      <span class="tb-badge" id="tb-changes-badge" style="display:none">0</span>
    </button>
  </div>

  <!-- Main: table + divider + right panel -->
  <div id="gv-main">
    <!-- Commit table -->
    <div id="gv-table-pane">
      <div id="gv-table-header">
        <span class="gv-th gv-th--graph" id="gv-th-graph"></span>
        <span class="gv-th gv-th--message">Message</span>
        <span class="gv-th gv-th--author">Auteur</span>
        <span class="gv-th gv-th--date">Date</span>
        <span class="gv-th gv-th--sha">SHA</span>
        <span class="gv-th gv-th--bar">\xB1</span>
      </div>
      <div id="gv-table-scroll">
        <div class="gv-placeholder">
          <span class="gv-placeholder-icon">\u2394</span>
          <span>Chargement\u2026</span>
        </div>
      </div>
    </div>

    <!-- Resizable divider -->
    <div id="gv-divider"></div>

    <!-- Right panel -->
    <div id="gv-right-pane">
      <div class="gv-placeholder" style="height:100%">
        <span class="gv-placeholder-icon">\u25CE</span>
        <span>S\xE9lectionnez un commit</span>
      </div>
    </div>
  </div>
</div>

<!-- Toast layer -->
<div id="gv-toast-layer"></div>`;
  }
  function showToast(msg, isError = false, durationMs = 3e3) {
    const layer = document.getElementById("gv-toast-layer");
    if (!layer)
      return;
    const el = document.createElement("div");
    el.className = "gv-toast" + (isError ? " gv-toast--error" : "");
    el.textContent = msg;
    layer.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }
  function setRepoName(name) {
    const el = document.getElementById("tb-repo-name");
    if (el)
      el.textContent = name;
    _repoName = name;
  }
  function setBranch(branch) {
    const el = document.getElementById("tb-branch-name");
    if (el)
      el.textContent = branch;
    _currentBranch = branch;
  }
  function updateChangesBadge() {
    const total = _workingChanges.staged.length + _workingChanges.unstaged.length + _workingChanges.untracked.length;
    const badge = document.getElementById("tb-changes-badge");
    if (!badge)
      return;
    if (total > 0) {
      badge.style.display = "flex";
      badge.textContent = String(total);
    } else {
      badge.style.display = "none";
    }
  }
  function setButtonLoading(id, loading, label) {
    const btn = document.getElementById(id);
    if (!btn)
      return;
    btn.disabled = loading;
    btn.querySelector("span.tb-lbl");
    btn.textContent = loading ? `${label}\u2026` : label;
    if (!loading) {
      const icons = {
        "tb-fetch-btn": "\u2193",
        "tb-pull-btn": "\u21E9",
        "tb-push-btn": "\u21E7"
      };
      const ic = icons[id];
      if (ic)
        btn.innerHTML = `<i class="tb-icon">${ic}</i> ${label}`;
    }
  }
  function initResizer() {
    const divider = document.getElementById("gv-divider");
    const rightPane = document.getElementById("gv-right-pane");
    let dragging = false;
    let startX = 0;
    let startW = 0;
    divider.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = rightPane.offsetWidth;
      divider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging)
        return;
      const delta = startX - e.clientX;
      const newW = Math.min(600, Math.max(240, startW + delta));
      rightPane.style.width = `${newW}px`;
    });
    document.addEventListener("mouseup", () => {
      if (!dragging)
        return;
      dragging = false;
      divider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    initMessageListener();
    buildLayout();
    const tableScrollEl = document.getElementById("gv-table-scroll");
    const rightPaneEl = document.getElementById("gv-right-pane");
    initGraph(tableScrollEl, (commit) => {
      _panelMode = "commit";
      showCommitInPanel(rightPaneEl, commit);
      selectCommit(commit.hash);
    });
    initRightPanel(rightPaneEl);
    initResizer();
    onMessage((msg) => {
      switch (msg.type) {
        case "log":
          setRepoName(msg.repoName);
          break;
        case "branches": {
          const current = msg.branches.find((b) => b.current);
          if (current)
            setBranch(current.label || current.name);
          break;
        }
        case "workingChanges":
          _workingChanges = msg.changes;
          updateChangesBadge();
          if (_panelMode === "staging") {
            showStagingInPanel(rightPaneEl, msg.changes);
          }
          break;
        case "error":
          showToast(msg.message, true);
          break;
        case "opResult":
          if (msg.op === "fetch" || msg.op === "pull" || msg.op === "push") {
            const labels = { fetch: "Fetch", pull: "Pull", push: "Push" };
            setButtonLoading(`tb-${msg.op}-btn`, false, labels[msg.op]);
            if (!msg.success)
              showToast(`${msg.op} failed: ${msg.error ?? "erreur inconnue"}`, true);
            else
              showToast(`${labels[msg.op]} r\xE9ussi`);
          }
          if (msg.op === "commit" && msg.success) {
            _panelMode = "staging";
            showStagingInPanel(rightPaneEl, _workingChanges);
          }
          break;
        case "repoChanged":
          rightPaneEl.innerHTML = `<div class="gv-placeholder" style="height:100%">
          <span class="gv-placeholder-icon">\u2394</span>
          <span>D\xE9p\xF4t chang\xE9</span>
        </div>`;
          break;
      }
    });
    document.getElementById("tb-fetch-btn")?.addEventListener("click", () => {
      setButtonLoading("tb-fetch-btn", true, "Fetch");
      send({ type: "fetch" });
    });
    document.getElementById("tb-pull-btn")?.addEventListener("click", () => {
      setButtonLoading("tb-pull-btn", true, "Pull");
      send({ type: "pull" });
    });
    document.getElementById("tb-push-btn")?.addEventListener("click", () => {
      setButtonLoading("tb-push-btn", true, "Push");
      send({ type: "push" });
    });
    document.getElementById("tb-changes-btn")?.addEventListener("click", () => {
      _panelMode = "staging";
      showStagingInPanel(rightPaneEl, _workingChanges);
    });
    const searchEl = document.getElementById("gv-search");
    let searchTimer;
    searchEl?.addEventListener("input", () => {
      if (searchTimer)
        clearTimeout(searchTimer);
      searchTimer = setTimeout(() => filterCommits(searchEl.value), 300);
    });
    send({ type: "ready" });
  });
})();
//# sourceMappingURL=main.js.map
