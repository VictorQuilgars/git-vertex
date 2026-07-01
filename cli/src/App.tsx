import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { GitService } from './core/gitService.js'
import type { BranchInfo, WorkingChanges } from './core/types.js'
import { computeGraphLayout, type LayoutCommit } from './core/graphLayout.js'
import { buildGraphRows } from './graph/asciiGraph.js'
import { useDimensions } from './hooks/useDimensions.js'
import Panel, { THEME } from './ui/Panel.js'

type Focus = 'sidebar' | 'graph' | 'staging'
type Mode = 'normal' | 'commit' | 'help' | 'confirm' | 'newbranch'
type CenterMode = 'graph' | 'diff'
interface FileItem { path: string; kind: 'unstaged' | 'untracked' | 'staged'; status: string }
interface SideItem { type: 'header' | 'branch' | 'remote' | 'tag' | 'stash'; label: string; branch?: BranchInfo; stashIndex?: number }

const clamp = (i: number, len: number) => (len === 0 ? 0 : Math.max(0, Math.min(i, len - 1)))
function windowStart(sel: number, len: number, visible: number): number {
  if (len <= visible) return 0
  return Math.max(0, Math.min(sel - Math.floor(visible / 2), len - visible))
}
function fit(s: string, w: number): string {
  if (w <= 0) return ''
  if (s.length === w) return s
  if (s.length > w) return w <= 1 ? s.slice(0, w) : s.slice(0, w - 1) + '…'
  return s + ' '.repeat(w - s.length)
}
function statusColor(s: string): string {
  if (s === 'A' || s === '?') return '#3fb950'
  if (s === 'D') return '#f85149'
  if (s === 'M') return '#d29922'
  if (s === 'R') return '#d2a8ff'
  return '#8b949e'
}
// Branch/tag/HEAD chips (desktop-like)
function refSegs(refs: string[]): { text: string; color: string; bold?: boolean }[] {
  const out: { text: string; color: string; bold?: boolean }[] = []
  for (const r of refs) {
    if (r.startsWith('tag: ')) out.push({ text: '⌂' + r.slice(5), color: '#d2a8ff' })
    else if (r.startsWith('HEAD -> ')) out.push({ text: '⎇' + r.slice(8), color: '#3fb950', bold: true })
    else if (r === 'HEAD') out.push({ text: 'HEAD', color: '#f0e68c', bold: true })
    else if (r.includes('/')) out.push({ text: r, color: '#6e7681' })
    else out.push({ text: '⎇' + r, color: '#58a6ff' })
  }
  return out
}
const refsLen = (segs: { text: string }[]) => segs.reduce((n, s) => n + s.text.length + 1, 0)

export default function App({ git, repo, branch: initialBranch }: { git: GitService; repo: string; branch: string }) {
  const { exit } = useApp()
  const { cols, rows } = useDimensions()

  const [commits, setCommits] = useState<LayoutCommit[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [tags, setTags] = useState<{ name: string; hash: string }[]>([])
  const [stashes, setStashes] = useState<{ index: number; message: string }[]>([])
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [status, setStatus] = useState('')
  const [focus, setFocus] = useState<Focus>('graph')
  const [sSide, setSSide] = useState(0)
  const [sGraph, setSGraph] = useState(0)
  const [sStage, setSStage] = useState(0)
  const [mode, setMode] = useState<Mode>('normal')
  const [commitMsg, setCommitMsg] = useState('')
  const [branchName, setBranchName] = useState('')
  const [confirm, setConfirm] = useState<{ text: string; action: () => void } | null>(null)
  const [center, setCenter] = useState<CenterMode>('graph')
  const [diffText, setDiffText] = useState('')
  const [diffTitle, setDiffTitle] = useState('')
  const [diffScroll, setDiffScroll] = useState(0)

  const files: FileItem[] = useMemo(() => {
    const out: FileItem[] = []
    for (const f of changes.unstaged) out.push({ path: f.path, kind: 'unstaged', status: f.status })
    for (const p of changes.untracked) out.push({ path: p, kind: 'untracked', status: '?' })
    for (const f of changes.staged) out.push({ path: f.path, kind: 'staged', status: f.status })
    return out
  }, [changes])

  const side: SideItem[] = useMemo(() => {
    const items: SideItem[] = []
    const locals = branches.filter(b => !b.remote)
    const remotes = branches.filter(b => b.remote)
    items.push({ type: 'header', label: 'LOCALES' })
    locals.forEach(b => items.push({ type: 'branch', label: b.name, branch: b }))
    if (remotes.length) { items.push({ type: 'header', label: 'DISTANTES' }); remotes.forEach(b => items.push({ type: 'remote', label: b.name, branch: b })) }
    if (tags.length) { items.push({ type: 'header', label: 'TAGS' }); tags.forEach(t => items.push({ type: 'tag', label: t.name })) }
    if (stashes.length) { items.push({ type: 'header', label: 'STASH' }); stashes.forEach(s => items.push({ type: 'stash', label: s.message, stashIndex: s.index })) }
    return items
  }, [branches, tags, stashes])
  const sideSel = useMemo(() => side.map((it, i) => (it.type === 'header' ? -1 : i)).filter(i => i >= 0), [side])

  const currentBranch = branches.find(b => b.current)?.name ?? initialBranch
  const ahead = branches.find(b => b.current)?.ahead ?? 0
  const behind = branches.find(b => b.current)?.behind ?? 0
  const totalChanged = changes.staged.length + changes.unstaged.length + changes.untracked.length

  const reload = useCallback(async () => {
    try {
      const [log, br, ch, tg, st] = await Promise.all([
        git.getLog({ maxCount: 300, all: true }),
        git.getBranches(),
        git.getWorkingChanges(),
        git.getTags(),
        git.getStashes(),
      ])
      setCommits(computeGraphLayout(log.commits))
      setBranches(br.branches)
      setChanges(ch as WorkingChanges)
      setTags(tg.tags ?? [])
      setStashes(st.stashes ?? [])
    } catch (e: any) { setStatus(`✗ ${e?.message ?? e}`) }
  }, [git])
  useEffect(() => { reload() }, [reload])

  const flash = (m: string) => setStatus(m)
  const run = useCallback(async (label: string, fn: () => Promise<any>) => {
    setStatus(`${label}…`)
    try {
      const r = await fn()
      if (r && r.success === false) setStatus(`✗ ${label} : ${r.error ?? ''}`)
      else setStatus(`✓ ${label}`)
    } catch (e: any) { setStatus(`✗ ${label} : ${e?.message ?? e}`) }
    await reload()
  }, [reload])
  const askConfirm = (text: string, action: () => void) => { setConfirm({ text, action }); setMode('confirm') }

  // Layout
  const panelH = Math.max(6, rows - 2)
  const innerH = Math.max(1, panelH - 2)
  const sideW = Math.min(30, Math.max(20, Math.floor(cols * 0.2)))
  const stageW = Math.min(46, Math.max(30, Math.floor(cols * 0.3)))
  const centerW = Math.max(24, cols - sideW - stageW)
  const centerContentW = centerW - 4

  // Load a commit's diff into the center diff view
  const openCommitDiff = useCallback(async (c: LayoutCommit) => {
    setStatus(`Diff ${c.shortHash}…`)
    const r = await git.getDiff(c.hash)
    setDiffTitle(c.shortHash)
    setDiffText(`${c.shortHash}  ${c.message}\n${c.author} · ${c.date}\n${'─'.repeat(40)}\n` + (r.diff || '(aucune différence)'))
    setDiffScroll(0); setCenter('diff'); setStatus('')
  }, [git])
  const openFileDiff = useCallback(async (f: FileItem) => {
    if (f.kind === 'untracked') { setDiffTitle(f.path); setDiffText('(nouveau fichier — non suivi)\n\n' + f.path); setDiffScroll(0); setCenter('diff'); return }
    const r = await git.getWorkingFileDiff(f.path, f.kind === 'staged')
    setDiffTitle(f.path.split('/').pop() ?? f.path)
    setDiffText(r.diff || '(aucune différence)'); setDiffScroll(0); setCenter('diff')
  }, [git])

  useInput((input, key) => {
    if (mode === 'help') { if (key.escape || input === '?' || input === 'q') setMode('normal'); return }
    if (mode === 'confirm') {
      if (input === 'y' || input === 'Y') { confirm?.action(); setConfirm(null); setMode('normal') }
      else if (key.escape || input === 'n' || input === 'N') { setConfirm(null); setMode('normal') }
      return
    }
    if (mode === 'commit') {
      if (key.escape) { setMode('normal'); return }
      if (key.return) {
        const msg = commitMsg.trim()
        if (!msg) { setStatus('Message vide'); return }
        run('Commit', () => git.commit(msg)).then(() => setCommitMsg(''))
        setMode('normal'); return
      }
      if (key.backspace || key.delete) { setCommitMsg(m => m.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setCommitMsg(m => m + input)
      return
    }
    if (mode === 'newbranch') {
      if (key.escape) { setMode('normal'); setBranchName(''); return }
      if (key.return) { const n = branchName.trim(); if (n) run('Nouvelle branche', () => git.createBranch(n)); setBranchName(''); setMode('normal'); return }
      if (key.backspace || key.delete) { setBranchName(s => s.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setBranchName(s => s + input)
      return
    }

    // NORMAL
    if (input === 'q') { exit(); return }
    if (input === '?') { setMode('help'); return }
    if (center === 'diff' && key.escape) { setCenter('graph'); return }
    if (input === '1') { setFocus('sidebar'); return }
    if (input === '2') { setFocus('graph'); return }
    if (input === '3') { setFocus('staging'); return }
    if (key.tab) { const order: Focus[] = ['sidebar', 'graph', 'staging']; const d = key.shift ? -1 : 1; setFocus(order[(order.indexOf(focus) + d + 3) % 3]); return }
    if (input === 'r') { reload(); flash('Rechargé'); return }
    if (input === 'f') { run('Fetch', () => git.fetch()); return }
    if (input === 'p') { run('Pull', () => git.pull()); return }
    if (input === 'P') { run('Push', () => git.push()); return }
    if (key.ctrl && input === 'd') { setDiffScroll(s => s + Math.floor(innerH / 2)); return }
    if (key.ctrl && input === 'u') { setDiffScroll(s => Math.max(0, s - Math.floor(innerH / 2))); return }

    const up = key.upArrow || input === 'k'
    const down = key.downArrow || input === 'j'

    if (focus === 'sidebar') {
      if (up || down) {
        const pos = sideSel.indexOf(sSide)
        const ni = clamp(pos + (down ? 1 : -1), sideSel.length)
        setSSide(sideSel[ni] ?? sSide); return
      }
      const it = side[sSide]
      if (key.return && it) {
        if (it.type === 'branch') run(`Checkout ${it.label}`, () => git.checkout(it.label))
        else if (it.type === 'remote') run(`Checkout ${it.label}`, () => git.checkout(it.label.replace(/^[^/]+\//, '')))
        else if (it.type === 'stash' && it.stashIndex != null) run('Pop stash', () => git.popStash(it.stashIndex!))
        else if (it.type === 'tag') run(`Checkout ${it.label}`, () => git.checkout(it.label))
        return
      }
      if (input === 'n') { setMode('newbranch'); return }
      if (input === 'D' && it?.type === 'branch' && !it.branch?.current) { askConfirm(`Supprimer ${it.label} ?`, () => run('Supprimer branche', () => git.deleteBranch(it.label))); return }
      return
    }

    if (focus === 'graph') {
      if (up) { setSGraph(s => clamp(s - 1, commits.length + 1)); return }
      if (down) { setSGraph(s => clamp(s + 1, commits.length + 1)); return }
      if (key.return) {
        if (sGraph === 0) { setFocus('staging'); setCenter('graph') } // WIP row → staging
        else { const c = commits[sGraph - 1]; if (c) openCommitDiff(c) }
        return
      }
      return
    }

    if (focus === 'staging') {
      if (up) { setSStage(s => clamp(s - 1, files.length)); return }
      if (down) { setSStage(s => clamp(s + 1, files.length)); return }
      const cur = files[sStage]
      if (key.return && cur) { openFileDiff(cur); return }
      if (input === ' ' && cur) {
        if (cur.kind === 'staged') run('Désindexer', () => git.unstage([cur.path]))
        else run('Indexer', () => git.stage([cur.path]))
        return
      }
      if (input === 'a') { run('Tout indexer', () => git.stageAll()); return }
      if (input === 'A') { run('Tout désindexer', () => git.unstage(changes.staged.map(f => f.path))); return }
      if (input === 'c') { if (changes.staged.length === 0) flash('Rien d’indexé'); else setMode('commit'); return }
      if (input === 'd' && cur) { askConfirm(`Annuler les modifs de ${cur.path} ?`, () => run('Annuler', () => git.discardFile(cur.path))); return }
      return
    }
  })

  // clamp selections
  useEffect(() => { setSStage(s => clamp(s, files.length)); setSGraph(s => clamp(s, commits.length + 1)) }, [files.length, commits.length])

  const graphRows = useMemo(() => buildGraphRows(commits), [commits])

  if (mode === 'help') {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <Header repo={repo} branch={currentBranch} ahead={ahead} behind={behind} status={status} />
        <Panel width={cols} height={panelH} num="?" title="Aide">
          <Text color={THEME.title} bold>Git Vertex — TUI (façon desktop)</Text>
          <Text> </Text>
          <Text><Text color={THEME.title}>Panneaux </Text>1 Sidebar · 2 Graphe · 3 Modifications · Tab pour cycler</Text>
          <Text><Text color={THEME.title}>Global   </Text>↑↓/jk naviguer · r recharger · f/p/P fetch/pull/push · q quitter</Text>
          <Text><Text color={THEME.title}>Sidebar  </Text>Entrée checkout / pop stash · n nouvelle branche · D supprimer</Text>
          <Text><Text color={THEME.title}>Graphe   </Text>Entrée voir le diff du commit (Échap pour revenir)</Text>
          <Text><Text color={THEME.title}>Modifs   </Text>Espace (dé)indexer · a/A tout · Entrée diff · c commit · d annuler</Text>
          <Text><Text color={THEME.title}>Diff     </Text>Ctrl+D / Ctrl+U défiler</Text>
          <Text> </Text><Text dimColor>Une touche pour fermer.</Text>
        </Panel>
        <Footer mode={mode} focus={focus} center={center} commitMsg={commitMsg} branchName={branchName} confirm={confirm} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header repo={repo} branch={currentBranch} ahead={ahead} behind={behind} status={status} />
      <Box flexDirection="row" height={panelH}>
        {/* Sidebar */}
        <Panel width={sideW} height={panelH} num="1" title="Branches" accent={focus === 'sidebar' ? THEME.menuOn : THEME.title}>
          <Sidebar items={side} sel={sSide} visible={innerH} width={sideW - 4} focused={focus === 'sidebar'} />
        </Panel>
        {/* Center: graph or diff */}
        {center === 'diff' ? (
          <Panel width={centerW} height={panelH} num="2" title={diffTitle || 'Diff'} accent={THEME.menuOn}>
            <DiffPane text={diffText} scroll={diffScroll} visible={innerH} width={centerContentW} />
          </Panel>
        ) : (
          <Panel width={centerW} height={panelH} num="2" title={`Commits ${commits.length}`} accent={focus === 'graph' ? THEME.menuOn : THEME.title}>
            <GraphView commits={commits} graphRows={graphRows} sel={sGraph} visible={innerH} width={centerContentW}
              focused={focus === 'graph'} wipCount={totalChanged} branch={currentBranch} />
          </Panel>
        )}
        {/* Staging + commit */}
        <Panel width={stageW} height={panelH} num="3" title={`${totalChanged} modif${totalChanged !== 1 ? 's' : ''}`} accent={focus === 'staging' ? THEME.menuOn : THEME.title}>
          <StagingView files={files} changes={changes} sel={sStage} visible={innerH} width={stageW - 4}
            focused={focus === 'staging'} commitMode={mode === 'commit'} commitMsg={commitMsg} branch={currentBranch} />
        </Panel>
      </Box>
      <Footer mode={mode} focus={focus} center={center} commitMsg={commitMsg} branchName={branchName} confirm={confirm} />
    </Box>
  )
}

function Header({ repo, branch, ahead, behind, status }: { repo: string; branch: string; ahead: number; behind: number; status: string }) {
  return (
    <Box>
      <Text color={THEME.menuOn} bold>❯ Git Vertex </Text>
      <Text color={THEME.dim}>· {repo} · </Text>
      <Text color={THEME.title}>⎇ {branch}</Text>
      {(ahead > 0 || behind > 0) && <Text color={THEME.dim}> ↑{ahead} ↓{behind}</Text>}
      <Text> </Text>
      {status ? <Text color={status.startsWith('✗') ? '#f85149' : THEME.dim}>{status}</Text> : null}
    </Box>
  )
}

function Sidebar({ items, sel, visible, width, focused }: { items: SideItem[]; sel: number; visible: number; width: number; focused: boolean }) {
  if (items.length === 0) return <Text dimColor>  Aucune branche</Text>
  const start = windowStart(sel, items.length, visible)
  const view = items.slice(start, start + visible)
  return (
    <Box flexDirection="column">
      {view.map((it, i) => {
        const gi = start + i
        if (it.type === 'header') return <Text key={gi} color={THEME.dim} bold>{it.label}</Text>
        const active = gi === sel && focused
        const color = it.type === 'remote' ? '#6e7681' : it.type === 'tag' ? '#d2a8ff' : it.type === 'stash' ? '#d29922' : (it.branch?.current ? '#3fb950' : '#58a6ff')
        const mark = it.branch?.current ? '● ' : it.type === 'tag' ? '⌂ ' : it.type === 'stash' ? '≡ ' : '⎇ '
        return (
          <Box key={gi} width={width}>
            <Text wrap="truncate-end" backgroundColor={active ? THEME.selBg : undefined}>
              <Text color={color}>{mark}</Text>
              <Text color={active ? '#ffffff' : color}>{fit(it.label, width - 2)}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function GraphView({ commits, graphRows, sel, visible, width, focused, wipCount, branch }: {
  commits: LayoutCommit[]; graphRows: { char: string; color: string }[][]; sel: number; visible: number; width: number; focused: boolean; wipCount: number; branch: string
}) {
  const showMeta = width >= 78
  const aW = showMeta ? 12 : 0
  const dW = showMeta ? 12 : 0
  const sW = 8
  // rows: index 0 = WIP, then commits
  const total = commits.length + 1
  const start = windowStart(sel, total, visible - 1) // -1 for header row
  const rowsToShow = visible - 1
  const items: (LayoutCommit | null)[] = []
  for (let i = start; i < Math.min(total, start + rowsToShow); i++) items.push(i === 0 ? null : commits[i - 1])
  const gcol = 6
  const msgW = Math.max(6, width - gcol - 1 - sW - aW - dW)

  return (
    <Box flexDirection="column">
      {/* header */}
      <Text color={THEME.dim} wrap="truncate-end">
        {fit('GRAPHE', gcol + 1)}{fit('COMMIT MESSAGE', msgW)}{showMeta ? fit('AUTEUR', aW) : ''}{showMeta ? fit('DATE', dW) : ''}{fit('SHA', sW)}
      </Text>
      {items.map((c, i) => {
        const gi = start + i
        const active = gi === sel && focused
        if (c === null) {
          return (
            <Box key="wip" width={width}>
              <Text wrap="truncate-end" backgroundColor={active ? THEME.selBg : undefined}>
                <Text color="#d29922">◌{' '.repeat(gcol - 1)} </Text>
                <Text color={active ? '#ffffff' : '#d29922'}>{fit(`WIP · ${wipCount} fichier${wipCount !== 1 ? 's' : ''} modifié${wipCount !== 1 ? 's' : ''}`, msgW + aW + dW + sW)}</Text>
              </Text>
            </Box>
          )
        }
        const g = (graphRows[gi - 1] ?? []).slice(0, gcol)
        const pad = Math.max(0, gcol - g.length)
        const refs = refSegs(c.refs)
        const rlen = refsLen(refs)
        const msgAvail = Math.max(3, msgW - rlen)
        return (
          <Box key={c.hash} width={width}>
            <Text wrap="truncate-end">
              {g.map((cell, k) => <Text key={k} color={cell.color || undefined}>{cell.char}</Text>)}
              <Text>{' '.repeat(pad)} </Text>
              {refs.map((s, k) => <Text key={k} color={s.color} bold={s.bold}>{s.text} </Text>)}
              <Text backgroundColor={active ? THEME.selBg : undefined} color={active ? '#ffffff' : THEME.text}>{fit(c.message, msgAvail)}</Text>
              {showMeta && <Text color={THEME.dim}>{fit(c.author, aW)}{fit((c.date || '').slice(0, 10), dW)}</Text>}
              <Text color="#6e7681">{fit(c.shortHash, sW)}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function StagingView({ files, changes, sel, visible, width, focused, commitMode, commitMsg, branch }: {
  files: FileItem[]; changes: WorkingChanges; sel: number; visible: number; width: number; focused: boolean; commitMode: boolean; commitMsg: string; branch: string
}) {
  // Reserve 3 rows for the commit message box at the bottom.
  const msgRows = 3
  const listVisible = Math.max(1, visible - msgRows)
  const unstaged = files.filter(f => f.kind !== 'staged')
  const staged = files.filter(f => f.kind === 'staged')

  // Build a display list with section headers (for rendering only).
  const rows: { file?: FileItem; header?: string }[] = []
  rows.push({ header: `Non indexé (${unstaged.length})` })
  unstaged.forEach(f => rows.push({ file: f }))
  rows.push({ header: `Indexé (${staged.length})` })
  staged.forEach(f => rows.push({ file: f }))
  // Map selection (index into files) to display row
  const fileRowIndex = (fi: number) => {
    const f = files[fi]
    return rows.findIndex(r => r.file === f)
  }
  const selRow = fileRowIndex(sel)
  const start = windowStart(selRow < 0 ? 0 : selRow, rows.length, listVisible)
  const view = rows.slice(start, start + listVisible)

  return (
    <Box flexDirection="column">
      {view.map((r, i) => {
        const gi = start + i
        if (r.header) return <Text key={gi} color={THEME.dim} bold>{r.header}</Text>
        const f = r.file!
        const active = focused && files[sel] === f
        const mark = f.kind === 'staged' ? '●' : f.kind === 'untracked' ? '+' : '○'
        const mc = f.kind === 'staged' ? '#3fb950' : f.kind === 'untracked' ? '#3fb950' : '#d29922'
        return (
          <Box key={gi} width={width}>
            <Text wrap="truncate-end" backgroundColor={active ? THEME.selBg : undefined}>
              <Text color={mc}>{mark} </Text>
              <Text color={statusColor(f.status)}>{f.status} </Text>
              <Text color={active ? '#ffffff' : THEME.text}>{fit(f.path, width - 5)}</Text>
            </Text>
          </Box>
        )
      })}
      {files.length === 0 && <Text dimColor>  Aucun changement</Text>}
      {/* filler */}
      {Array.from({ length: Math.max(0, listVisible - view.length - (files.length === 0 ? 1 : 0)) }).map((_, i) => <Text key={'f' + i}> </Text>)}
      {/* commit message box */}
      <Text color={THEME.border}>{'─'.repeat(Math.max(0, width))}</Text>
      <Text wrap="truncate-end">
        <Text color={commitMode ? THEME.menuOn : THEME.dim}>✎ </Text>
        {commitMsg
          ? <Text color={THEME.text}>{fit(commitMsg, width - 3)}</Text>
          : <Text color={THEME.dim}>{commitMode ? 'Message du commit…' : 'c : écrire un commit'}</Text>}
        {commitMode && <Text color={THEME.menuOn}>▏</Text>}
      </Text>
    </Box>
  )
}

function DiffPane({ text, scroll, visible, width }: { text: string; scroll: number; visible: number; width: number }) {
  const lines = text ? text.split('\n') : ['']
  const hasFooter = lines.length > visible
  const room = hasFooter ? visible - 1 : visible
  const start = Math.min(scroll, Math.max(0, lines.length - room))
  const view = lines.slice(start, start + room)
  return (
    <Box flexDirection="column">
      {view.map((l, i) => {
        let color: string | undefined; let dim = false
        if (l.startsWith('@@')) color = '#58a6ff'
        else if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) dim = true
        else if (l.startsWith('+')) color = '#3fb950'
        else if (l.startsWith('-')) color = '#f85149'
        else color = '#8b949e'
        const s = fit(l, width)
        return <Text key={i} color={color} dimColor={dim} wrap="truncate-end">{s}</Text>
      })}
      {hasFooter && <Text color={THEME.dim}>… {start + view.length}/{lines.length} · Ctrl+D/U · Échap</Text>}
    </Box>
  )
}

function Footer({ mode, focus, center, commitMsg, branchName, confirm }: { mode: Mode; focus: Focus; center: CenterMode; commitMsg: string; branchName: string; confirm: { text: string } | null }) {
  if (mode === 'commit') return <Text><Text color={THEME.title}>Commit : </Text><Text>{commitMsg}</Text><Text color={THEME.menuOn}>▏</Text><Text dimColor>  (Entrée valider · Échap annuler)</Text></Text>
  if (mode === 'newbranch') return <Text><Text color={THEME.menuOn}>Nouvelle branche : </Text><Text>{branchName}</Text><Text color={THEME.menuOn}>▏</Text><Text dimColor>  (Entrée créer · Échap)</Text></Text>
  if (mode === 'confirm') return <Text><Text color="#d29922">{confirm?.text} </Text><Text dimColor>(y / n)</Text></Text>
  const common = '1/2/3 ou Tab · ↑↓/jk · f/p/P · r · ? aide · q'
  const per = center === 'diff' ? 'Échap revenir · Ctrl+D/U défiler'
    : focus === 'sidebar' ? 'Entrée checkout · n nouvelle · D supprimer'
      : focus === 'graph' ? 'Entrée voir le diff du commit'
        : 'Espace (dé)indexer · a tout · Entrée diff · c commit · d annuler'
  return <Text wrap="truncate-end"><Text color="#3fb950">{per}</Text><Text dimColor>  │  {common}</Text></Text>
}
