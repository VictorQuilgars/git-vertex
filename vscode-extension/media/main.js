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
  var ROW_HEIGHT = 34;
  var SVG_PAD_L = 10;
  var SVG_PAD_R = 6;
  var NODE_RADIUS = 5;
  var _commits = [];
  var _selectedHash = null;
  var _onSelectCommit;
  var _graphEl;
  function initGraph(container, onSelect) {
    _graphEl = container;
    _onSelectCommit = onSelect;
    onMessage((msg) => {
      if (msg.type === "log") {
        _commits = msg.commits;
        renderGraph();
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
    renderGraph();
  }
  function renderGraph() {
    if (!_graphEl)
      return;
    const commits = _commits;
    if (!commits.length) {
      _graphEl.innerHTML = '<div style="padding:16px;color:#8b949e">No commits to display.</div>';
      return;
    }
    const maxLane = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0);
    const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 62);
    const svgH = commits.length * ROW_HEIGHT;
    let edgePaths = "";
    let nodes = "";
    for (const commit of commits) {
      const lane = commit.lane ?? 0;
      const row = commit.row ?? 0;
      const cx = SVG_PAD_L + lane * LANE_WIDTH;
      const cy = row * ROW_HEIGHT + ROW_HEIGHT / 2;
      const color = commit.color ?? "#4d9de0";
      for (const edge of commit.edges ?? []) {
        const fromCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH;
        const fromCy = cy;
        const toRow = edge.toRow;
        const toCx = SVG_PAD_L + edge.toLane * LANE_WIDTH;
        const toCy = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const ec = edge.color;
        let d;
        if (edge.type === "straight") {
          d = `M${fromCx},${fromCy} L${toCx},${toCy}`;
        } else if (edge.type === "fork-left" || edge.type === "fork-right") {
          const midY = fromCy + ROW_HEIGHT * 0.6;
          d = `M${fromCx},${fromCy} L${fromCx},${midY} Q${fromCx},${toCy} ${toCx},${toCy}`;
        } else {
          const midY = fromCy + ROW_HEIGHT * 0.4;
          d = `M${toCx},${toCy} L${toCx},${midY} Q${toCx},${fromCy} ${fromCx},${fromCy}`;
        }
        edgePaths += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ""}/>`;
      }
      const isSelected = commit.hash === _selectedHash;
      nodes += `<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${isSelected ? "#ffffff" : color}" stroke-width="${isSelected ? 2.5 : 1.5}" data-hash="${commit.hash}" style="cursor:pointer"/>`;
    }
    const svgMarkup = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">${edgePaths}${nodes}</svg>`;
    let rowsHtml = "";
    for (const commit of commits) {
      const isSelected = commit.hash === _selectedHash;
      const refs = (commit.refs ?? []).map((r) => {
        const isHead = r.startsWith("HEAD");
        const isRemote = r.includes("origin/") || r.startsWith("remotes/");
        const isTag = r.startsWith("tag:");
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
        return `<span class="${cls}">${escHtml(label)}</span>`;
      }).join("");
      const date = formatDate(commit.date);
      const bg = isSelected ? "#1c2128" : "transparent";
      rowsHtml += `<div class="gv-row${isSelected ? " gv-row--selected" : ""}" data-hash="${commit.hash}" style="background:${bg}">
  <div class="gv-row-graph" style="width:${svgW}px"></div>
  <div class="gv-row-info">
    <span class="gv-message">${escHtml(commit.message)}</span>
    ${refs}
    <span class="gv-meta">${escHtml(commit.author)} \xB7 ${date}</span>
  </div>
</div>`;
    }
    _graphEl.innerHTML = `
<style>
.gv-graph-wrap { display: flex; flex-direction: column; width: 100%; }
.gv-graph-svg-col { position: relative; flex-shrink: 0; }
.gv-graph-svg-col svg { position: sticky; left: 0; display: block; }
.gv-rows { flex: 1; min-width: 0; }
.gv-row {
  display: flex; align-items: center; height: ${ROW_HEIGHT}px;
  padding: 0 8px 0 0; cursor: pointer; border-bottom: 1px solid #21262d;
  gap: 0;
}
.gv-row:hover { background: #161b22 !important; }
.gv-row--selected { background: #1c2128 !important; }
.gv-row-graph { flex-shrink: 0; height: ${ROW_HEIGHT}px; }
.gv-row-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; padding-left: 6px; }
.gv-message { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e6edf3; }
.gv-meta { font-size: 11px; color: #8b949e; white-space: nowrap; flex-shrink: 0; }
.gv-ref { font-size: 11px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; font-weight: 500; }
.gv-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.gv-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.gv-ref--head { background: #2d1f6e; color: #d2a8ff; border: 1px solid #8957e5; }
.gv-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }
</style>
<div class="gv-graph-wrap" style="position:relative">
  <div style="display:flex;flex-direction:column">
    ${commits.map((c, i) => {
      const isSelected = c.hash === _selectedHash;
      const refs = (c.refs ?? []).map((r) => {
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
        return `<span class="${cls}">${escHtml(label)}</span>`;
      }).join("");
      const date = formatDate(c.date);
      const lane = c.lane ?? 0;
      const cy = ROW_HEIGHT / 2;
      const cx = SVG_PAD_L + lane * LANE_WIDTH;
      const color = c.color ?? "#4d9de0";
      let rowEdges = "";
      for (const edge of c.edges ?? []) {
        const fCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH;
        const fCy = cy;
        const toRow = edge.toRow;
        const tCx = SVG_PAD_L + edge.toLane * LANE_WIDTH;
        const tCy = (toRow - i) * ROW_HEIGHT + ROW_HEIGHT / 2;
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
        rowEdges += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ""}/>`;
      }
      return `<div class="gv-row${isSelected ? " gv-row--selected" : ""}" data-hash="${c.hash}" style="background:${isSelected ? "#1c2128" : "transparent"}">
  <svg width="${svgW}" height="${ROW_HEIGHT}" style="flex-shrink:0;display:block" xmlns="http://www.w3.org/2000/svg" overflow="visible">
    ${rowEdges}
    <circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${isSelected ? "#ffffff" : color}" stroke-width="${isSelected ? 2.5 : 1.5}"/>
  </svg>
  <div class="gv-row-info">
    <span class="gv-message">${escHtml(c.message)}</span>
    ${refs}
    <span class="gv-meta">${escHtml(c.author)} \xB7 ${date}</span>
  </div>
</div>`;
    }).join("")}
  </div>
</div>`;
    _graphEl.querySelectorAll(".gv-row").forEach((el) => {
      el.addEventListener("click", () => {
        const hash = el.getAttribute("data-hash");
        if (!hash)
          return;
        _selectedHash = hash;
        const commit = _commits.find((c) => c.hash === hash);
        if (commit && _onSelectCommit)
          _onSelectCommit(commit);
        renderGraph();
      });
    });
  }
  function formatDate(dateStr) {
    if (!dateStr)
      return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
      return dateStr;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1)
      return "just now";
    if (mins < 60)
      return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
      return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30)
      return `${days}d ago`;
    return d.toLocaleDateString();
  }
  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/webview/commitDetail.ts
  var _container;
  var _currentHash = null;
  var _files = [];
  var _currentDiff = "";
  function initCommitDetail(container) {
    _container = container;
    onMessage((msg) => {
      if (msg.type === "commitFiles" && msg.hash === _currentHash) {
        _files = msg.files;
        renderFiles();
      }
      if (msg.type === "diff" && msg.hash === _currentHash) {
        _currentDiff = msg.diff;
        renderDiff();
      }
    });
  }
  function showCommit(commit) {
    _currentHash = commit.hash;
    _files = [];
    _currentDiff = "";
    renderHeader(commit);
    send({ type: "getCommitFiles", hash: commit.hash });
    send({ type: "getDiff", hash: commit.hash });
  }
  function clearDetail() {
    _currentHash = null;
    if (_container)
      _container.innerHTML = "";
  }
  function renderHeader(commit) {
    if (!_container)
      return;
    const refs = (commit.refs ?? []).map((r) => {
      const isTag = r.startsWith("tag:");
      const isRemote = r.includes("origin/");
      const cls = isTag ? "cd-ref cd-ref--tag" : isRemote ? "cd-ref cd-ref--remote" : "cd-ref cd-ref--local";
      const label = r.replace(/^HEAD -> /, "").replace(/^tag: /, "");
      return `<span class="${cls}">${esc(label)}</span>`;
    }).join("");
    _container.innerHTML = `
<style>
.cd-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cd-header { padding: 12px 16px; border-bottom: 1px solid #21262d; flex-shrink: 0; }
.cd-hash { font-family: monospace; font-size: 12px; color: #8b949e; margin-bottom: 4px; }
.cd-message { font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 6px; word-break: break-word; }
.cd-meta { font-size: 12px; color: #8b949e; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.cd-refs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.cd-ref { font-size: 11px; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.cd-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.cd-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.cd-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }
.cd-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.cd-files { width: 220px; flex-shrink: 0; border-right: 1px solid #21262d; overflow-y: auto; }
.cd-file { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; color: #e6edf3; border-bottom: 1px solid #161b22; }
.cd-file:hover { background: #161b22; }
.cd-file-status { font-size: 11px; font-weight: 700; width: 14px; flex-shrink: 0; }
.cd-file-status--A { color: #3fb950; }
.cd-file-status--M { color: #58a6ff; }
.cd-file-status--D { color: #f85149; }
.cd-file-status--R { color: #e3b341; }
.cd-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-diff { flex: 1; overflow-y: auto; padding: 0; font-family: monospace; font-size: 12px; line-height: 1.5; }
.cd-diff-empty { padding: 16px; color: #8b949e; }
.diff-line { white-space: pre; padding: 0 12px; display: block; min-width: max-content; }
.diff-line--add { background: #0d2a1a; color: #3fb950; }
.diff-line--del { background: #2a0d0d; color: #f85149; }
.diff-line--hunk { background: #161b22; color: #8b949e; }
.diff-line--meta { color: #8b949e; }
.cd-files-loading { padding: 12px; color: #8b949e; font-size: 12px; }
</style>
<div class="cd-wrap">
  <div class="cd-header">
    <div class="cd-hash">${esc(commit.shortHash)}</div>
    <div class="cd-message">${esc(commit.message)}</div>
    <div class="cd-meta">
      <span>${esc(commit.author)}</span>
      <span>${formatDate2(commit.date)}</span>
    </div>
    <div class="cd-refs">${refs}</div>
  </div>
  <div class="cd-body">
    <div class="cd-files" id="cd-files-list"><div class="cd-files-loading">Loading...</div></div>
    <div class="cd-diff" id="cd-diff-content"><div class="cd-diff-empty">Select a file to view diff</div></div>
  </div>
</div>`;
  }
  function renderFiles() {
    const listEl = _container?.querySelector("#cd-files-list");
    if (!listEl)
      return;
    if (!_files.length) {
      listEl.innerHTML = '<div class="cd-files-loading">No files changed</div>';
      return;
    }
    listEl.innerHTML = _files.map((f, i) => `
<div class="cd-file" data-idx="${i}">
  <span class="cd-file-status cd-file-status--${f.status}">${esc(f.status)}</span>
  <span class="cd-file-name" title="${esc(f.path)}">${esc(f.path)}</span>
</div>`).join("");
    listEl.querySelectorAll(".cd-file").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.getAttribute("data-idx") ?? "0");
        showFileDiffInView(_files[idx]);
      });
    });
  }
  function showFileDiffInView(file) {
    if (!_currentDiff) {
      renderDiff();
      return;
    }
    const sections = splitDiffByFile(_currentDiff);
    const section = sections.find((s) => s.includes(file.path)) ?? "";
    renderDiffContent(section);
  }
  function renderDiff() {
    renderDiffContent(_currentDiff);
  }
  function renderDiffContent(diff) {
    const el = _container?.querySelector("#cd-diff-content");
    if (!el)
      return;
    if (!diff.trim()) {
      el.innerHTML = '<div class="cd-diff-empty">No diff available</div>';
      return;
    }
    const lines = diff.split("\n").map((line) => {
      let cls = "diff-line";
      if (line.startsWith("+") && !line.startsWith("+++"))
        cls += " diff-line--add";
      else if (line.startsWith("-") && !line.startsWith("---"))
        cls += " diff-line--del";
      else if (line.startsWith("@@"))
        cls += " diff-line--hunk";
      else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++"))
        cls += " diff-line--meta";
      return `<span class="${cls}">${esc(line)}</span>`;
    }).join("\n");
    el.innerHTML = `<code>${lines}</code>`;
  }
  function splitDiffByFile(diff) {
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
    return sections;
  }
  function formatDate2(dateStr) {
    if (!dateStr)
      return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
      return dateStr;
    return d.toLocaleString();
  }
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/webview/staging.ts
  var _container2;
  var _changes = { staged: [], unstaged: [], untracked: [] };
  var _onOpResult;
  var _diffContainer;
  function initStaging(container, diffContainer, onOpResult) {
    _container2 = container;
    _diffContainer = diffContainer;
    _onOpResult = onOpResult;
    onMessage((msg) => {
      if (msg.type === "workingChanges") {
        _changes = msg.changes;
        renderStaging();
      }
      if (msg.type === "workingFileDiff") {
        renderFileDiff(msg.diff, msg.filepath, msg.staged);
      }
      if (msg.type === "opResult") {
        if (_onOpResult)
          _onOpResult(msg.op, msg.success, msg.error);
      }
    });
  }
  function renderStaging() {
    if (!_container2)
      return;
    const { staged, unstaged, untracked } = _changes;
    const totalUnstaged = unstaged.length + untracked.length;
    _container2.innerHTML = `
<style>
.st-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.st-section { flex-shrink: 0; }
.st-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; background: #161b22; border-bottom: 1px solid #21262d;
  font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;
}
.st-section-actions { display: flex; gap: 4px; }
.st-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
}
.st-btn:hover { background: #30363d; }
.st-btn--green { background: #1b3a2d; border-color: #2ea043; color: #3fb950; }
.st-btn--green:hover { background: #2ea043; color: #fff; }
.st-btn--red { background: #2a0d0d; border-color: #f85149; color: #f85149; }
.st-btn--red:hover { background: #f85149; color: #fff; }
.st-file-list { max-height: 120px; overflow-y: auto; }
.st-file { display: flex; align-items: center; gap: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #161b22; }
.st-file:hover { background: #1c2128; }
.st-file-status { font-size: 10px; font-weight: 700; width: 12px; flex-shrink: 0; }
.st-file-status--A { color: #3fb950; }
.st-file-status--M { color: #58a6ff; }
.st-file-status--D { color: #f85149; }
.st-file-status--U { color: #f0883e; }
.st-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e6edf3; }
.st-file-actions { display: flex; gap: 3px; opacity: 0; transition: opacity 0.1s; }
.st-file:hover .st-file-actions { opacity: 1; }
.st-commit-area { flex-shrink: 0; padding: 8px 10px; border-top: 1px solid #21262d; }
.st-commit-input {
  width: 100%; background: #0d1117; border: 1px solid #30363d; color: #e6edf3;
  padding: 6px 8px; border-radius: 4px; font-size: 12px; resize: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.st-commit-input:focus { outline: none; border-color: #58a6ff; }
.st-commit-row { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
.st-commit-btn {
  background: #1b3a2d; border: 1px solid #2ea043; color: #3fb950;
  font-size: 12px; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;
}
.st-commit-btn:hover { background: #2ea043; color: #fff; }
.st-commit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.st-error { color: #f85149; font-size: 11px; margin-top: 4px; }
.st-count { font-size: 10px; background: #21262d; border-radius: 10px; padding: 1px 5px; color: #8b949e; }
.st-empty { padding: 6px 10px; font-size: 11px; color: #8b949e; font-style: italic; }
</style>
<div class="st-wrap">
  <div class="st-section">
    <div class="st-section-header">
      <span>Staged <span class="st-count">${staged.length}</span></span>
      <div class="st-section-actions">
        ${staged.length > 0 ? '<button class="st-btn st-btn--red" id="unstage-all-btn">Unstage All</button>' : ""}
      </div>
    </div>
    <div class="st-file-list" id="staged-list">
      ${staged.length === 0 ? '<div class="st-empty">No staged files</div>' : staged.map((f) => renderFileRow(f, true)).join("")}
    </div>
  </div>

  <div class="st-section">
    <div class="st-section-header">
      <span>Unstaged <span class="st-count">${totalUnstaged}</span></span>
      <div class="st-section-actions">
        ${totalUnstaged > 0 ? '<button class="st-btn st-btn--green" id="stage-all-btn">Stage All</button>' : ""}
      </div>
    </div>
    <div class="st-file-list" id="unstaged-list">
      ${totalUnstaged === 0 ? '<div class="st-empty">No changed files</div>' : [
      ...unstaged.map((f) => renderFileRow(f, false)),
      ...untracked.map((p) => renderFileRow({ path: p, status: "U" }, false, true))
    ].join("")}
    </div>
  </div>

  <div class="st-commit-area">
    <textarea class="st-commit-input" id="commit-msg" rows="3" placeholder="Commit message\u2026"></textarea>
    <div class="st-commit-row">
      <button class="st-commit-btn" id="commit-btn" ${staged.length === 0 ? "disabled" : ""}>Commit</button>
      <div class="st-error" id="commit-error"></div>
    </div>
  </div>
</div>`;
    const stageAllBtn = _container2.querySelector("#stage-all-btn");
    stageAllBtn?.addEventListener("click", () => send({ type: "stageAll" }));
    const unstageAllBtn = _container2.querySelector("#unstage-all-btn");
    unstageAllBtn?.addEventListener("click", () => {
      const paths = staged.map((f) => f.path);
      send({ type: "unstage", files: paths });
    });
    const commitBtn = _container2.querySelector("#commit-btn");
    commitBtn?.addEventListener("click", () => {
      const msg = _container2?.querySelector("#commit-msg")?.value?.trim();
      if (!msg) {
        const err2 = _container2?.querySelector("#commit-error");
        if (err2)
          err2.textContent = "Commit message required";
        return;
      }
      send({ type: "commit", message: msg });
      const err = _container2?.querySelector("#commit-error");
      if (err)
        err.textContent = "";
    });
    _container2.querySelectorAll(".st-file[data-path]").forEach((el) => {
      const path = el.getAttribute("data-path");
      const isStagedFile = el.getAttribute("data-staged") === "true";
      el.addEventListener("click", (e) => {
        const target = e.target;
        if (target.closest(".st-file-actions"))
          return;
        send({ type: "getWorkingFileDiff", filepath: path, staged: isStagedFile });
      });
      const actionBtn = el.querySelector(".st-file-action-btn");
      actionBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isStagedFile) {
          send({ type: "unstage", files: [path] });
        } else {
          send({ type: "stage", files: [path] });
        }
      });
      const discardBtn = el.querySelector(".st-file-discard-btn");
      discardBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        send({ type: "discardFile", file: path });
      });
    });
  }
  function renderFileRow(f, isStaged, isUntracked = false) {
    const statusCls = `st-file-status--${isUntracked ? "U" : f.status === "D" ? "D" : f.status === "A" ? "A" : "M"}`;
    const statusLabel = isUntracked ? "?" : f.status;
    const actionLabel = isStaged ? "\u2212" : "+";
    const actions = `
<div class="st-file-actions">
  <button class="st-btn st-file-action-btn" title="${isStaged ? "Unstage" : "Stage"}">${actionLabel}</button>
  ${!isStaged && !isUntracked ? '<button class="st-btn st-btn--red st-file-discard-btn" title="Discard">\u21A9</button>' : ""}
</div>`;
    return `<div class="st-file" data-path="${esc2(f.path)}" data-staged="${isStaged}">
  <span class="st-file-status ${statusCls}">${esc2(statusLabel)}</span>
  <span class="st-file-name" title="${esc2(f.path)}">${esc2(f.path)}</span>
  ${actions}
</div>`;
  }
  function renderFileDiff(diff, filepath, staged) {
    if (!_diffContainer)
      return;
    if (!diff.trim()) {
      _diffContainer.innerHTML = `<div style="padding:12px;color:#8b949e;font-size:12px">No diff for ${esc2(filepath)}</div>`;
      return;
    }
    const lines = diff.split("\n").map((line) => {
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
    _diffContainer.innerHTML = `
<style>
.diff-line { white-space: pre; padding: 0 12px; display: block; min-width: max-content; font-family: monospace; font-size: 12px; line-height: 1.5; }
.diff-line--add { background: #0d2a1a; color: #3fb950; }
.diff-line--del { background: #2a0d0d; color: #f85149; }
.diff-line--hunk { background: #161b22; color: #8b949e; }
.diff-line--meta { color: #8b949e; }
</style>
<div style="font-size:11px;color:#8b949e;padding:6px 12px;border-bottom:1px solid #21262d">${esc2(filepath)}${staged ? " (staged)" : ""}</div>
<code style="display:block;overflow-x:auto">${lines}</code>`;
  }
  function esc2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/webview/main.ts
  function buildLayout() {
    const app = document.getElementById("app");
    app.innerHTML = `
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; margin: 0; }
body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }

#gv-toolbar {
  height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 12px;
  background: #161b22; border-bottom: 1px solid #21262d; flex-shrink: 0;
}
#gv-toolbar .tb-title { font-weight: 600; color: #e6edf3; font-size: 13px; flex-shrink: 0; }
#gv-toolbar .tb-repo { font-size: 12px; color: #8b949e; }
#gv-search {
  flex: 1; max-width: 280px; background: #0d1117; border: 1px solid #30363d;
  color: #e6edf3; padding: 3px 8px; border-radius: 4px; font-size: 12px;
}
#gv-search:focus { outline: none; border-color: #58a6ff; }
.tb-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 12px; padding: 3px 10px; border-radius: 4px; cursor: pointer;
}
.tb-btn:hover { background: #30363d; }
.tb-btn--primary { background: #1b3a2d; border-color: #2ea043; color: #3fb950; }
.tb-btn--primary:hover { background: #2ea043; color: #fff; }

#gv-main { display: flex; flex: 1; min-height: 0; overflow: hidden; }
#gv-app { display: flex; flex-direction: column; width: 100%; height: 100%; }

/* Graph pane */
#gv-graph-pane {
  width: 380px; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid #21262d; overflow: hidden;
}
#gv-graph-header {
  padding: 5px 10px; font-size: 11px; color: #8b949e; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #21262d;
  background: #161b22; flex-shrink: 0;
}
#gv-graph-scroll { flex: 1; overflow-y: auto; overflow-x: auto; }

/* Center pane (commit detail) */
#gv-center-pane {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid #21262d; overflow: hidden;
}
#gv-detail-container { flex: 1; overflow-y: auto; }

/* Right pane (staging) */
#gv-right-pane {
  width: 320px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden;
}
#gv-staging-container { flex: 1; overflow-y: auto; min-height: 0; border-bottom: 1px solid #21262d; }
#gv-staging-diff { flex: 1; overflow-y: auto; min-height: 0; min-height: 80px; max-height: 220px; }

.gv-placeholder {
  display: flex; align-items: center; justify-content: center; height: 100%;
  color: #8b949e; font-size: 13px; flex-direction: column; gap: 8px;
}
.gv-placeholder-icon { font-size: 32px; opacity: 0.3; }

.gv-status-bar {
  height: 24px; display: flex; align-items: center; padding: 0 12px; gap: 12px;
  background: #161b22; border-top: 1px solid #21262d; flex-shrink: 0;
  font-size: 11px; color: #8b949e;
}
#gv-status-msg { flex: 1; }
</style>

<div id="gv-app">
  <div id="gv-toolbar">
    <span class="tb-title">Git Vertex</span>
    <span class="tb-repo" id="tb-repo-name"></span>
    <input id="gv-search" type="search" placeholder="Search commits\u2026" />
    <button class="tb-btn" id="tb-fetch-btn">Fetch</button>
    <button class="tb-btn" id="tb-pull-btn">Pull</button>
    <button class="tb-btn tb-btn--primary" id="tb-push-btn">Push</button>
  </div>

  <div id="gv-main">
    <div id="gv-graph-pane">
      <div id="gv-graph-header">Commits</div>
      <div id="gv-graph-scroll"></div>
    </div>

    <div id="gv-center-pane">
      <div id="gv-detail-container">
        <div class="gv-placeholder">
          <span class="gv-placeholder-icon">\u25CE</span>
          <span>Select a commit to view details</span>
        </div>
      </div>
    </div>

    <div id="gv-right-pane">
      <div id="gv-staging-container"></div>
      <div id="gv-staging-diff"></div>
    </div>
  </div>

  <div class="gv-status-bar">
    <span id="gv-status-msg">Ready</span>
  </div>
</div>`;
  }
  function setStatus(msg, isError = false) {
    const el = document.getElementById("gv-status-msg");
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#f85149" : "#8b949e";
    }
  }
  function setRepoName(name) {
    const el = document.getElementById("tb-repo-name");
    if (el)
      el.textContent = name;
  }
  document.addEventListener("DOMContentLoaded", () => {
    initMessageListener();
    buildLayout();
    const graphEl = document.getElementById("gv-graph-scroll");
    const detailEl = document.getElementById("gv-detail-container");
    const stagingEl = document.getElementById("gv-staging-container");
    const stagingDiffEl = document.getElementById("gv-staging-diff");
    initGraph(graphEl, (commit) => {
      showCommit(commit);
      clearStagingDiff();
      selectCommit(commit.hash);
    });
    initCommitDetail(detailEl);
    initStaging(stagingEl, stagingDiffEl, (op, success, error) => {
      if (success) {
        setStatus(`${op} successful`);
        if (op === "commit") {
          const msgEl = stagingEl.querySelector("#commit-msg");
          if (msgEl)
            msgEl.value = "";
        }
      } else {
        setStatus(`${op} failed: ${error ?? "unknown error"}`, true);
      }
    });
    onMessage((msg) => {
      if (msg.type === "log") {
        setRepoName(msg.repoName);
        const count = msg.commits.length;
        setStatus(`${count} commit${count !== 1 ? "s" : ""} loaded`);
      }
      if (msg.type === "error") {
        setStatus(msg.message, true);
      }
      if (msg.type === "opResult") {
        if (msg.op === "fetch" || msg.op === "pull" || msg.op === "push") {
          const btn = document.getElementById(`tb-${msg.op}-btn`);
          if (btn) {
            btn.disabled = false;
            btn.textContent = capitalize(msg.op);
          }
          if (!msg.success) {
            setStatus(`${msg.op} failed: ${msg.error ?? "unknown error"}`, true);
          }
        }
      }
      if (msg.type === "repoChanged") {
        clearDetail();
        clearStagingDiff();
        setStatus("Repository changed");
      }
    });
    document.getElementById("tb-fetch-btn")?.addEventListener("click", () => {
      setStatus("Fetching\u2026");
      const btn = document.getElementById("tb-fetch-btn");
      btn.disabled = true;
      btn.textContent = "Fetching\u2026";
      send({ type: "fetch" });
    });
    document.getElementById("tb-pull-btn")?.addEventListener("click", () => {
      setStatus("Pulling\u2026");
      const btn = document.getElementById("tb-pull-btn");
      btn.disabled = true;
      btn.textContent = "Pulling\u2026";
      send({ type: "pull" });
    });
    document.getElementById("tb-push-btn")?.addEventListener("click", () => {
      setStatus("Pushing\u2026");
      const btn = document.getElementById("tb-push-btn");
      btn.disabled = true;
      btn.textContent = "Pushing\u2026";
      send({ type: "push" });
    });
    const searchEl = document.getElementById("gv-search");
    let searchTimer;
    searchEl?.addEventListener("input", () => {
      if (searchTimer)
        clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        filterCommits(searchEl.value);
      }, 300);
    });
    send({ type: "ready" });
  });
  function clearStagingDiff() {
    const el = document.getElementById("gv-staging-diff");
    if (el)
      el.innerHTML = "";
  }
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
})();
//# sourceMappingURL=main.js.map
