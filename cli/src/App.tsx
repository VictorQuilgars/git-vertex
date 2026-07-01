import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { GitService } from './core/gitService.js'
import type { BranchInfo, WorkingChanges } from './core/types.js'
import { computeGraphLayout, type LayoutCommit } from './core/graphLayout.js'
import { buildGraphRows } from './graph/asciiGraph.js'
import { useDimensions } from './hooks/useDimensions.js'
import Panel, { THEME } from './ui/Panel.js'

type Tab = 'files' | 'branches' | 'commits'
type Mode = 'normal' | 'commit' | 'help' | 'confirm' | 'newbranch'
interface FileItem { path: string; kind: 'unstaged' | 'untracked' | 'staged'; status: string }

const TABS: Tab[] = ['files', 'branches', 'commits']

// Keep a selection index inside [0, len)
const clamp = (i: number, len: number) => (len === 0 ? 0 : Math.max(0, Math.min(i, len - 1)))
// Window a list so the selected row stays visible.
function windowStart(sel: number, len: number, visible: number): number {
  if (len <= visible) return 0
  let start = sel - Math.floor(visible / 2)
  start = Math.max(0, Math.min(start, len - visible))
  return start
}

function statusColor(s: string): string {
  if (s === 'A' || s === '?') return '#3fb950'
  if (s === 'D') return '#f85149'
  if (s === 'M') return '#d29922'
  if (s === 'R') return '#d2a8ff'
  return '#8b949e'
}

export default function App({ git, repo, branch: initialBranch }: { git: GitService; repo: string; branch: string }) {
  const { exit } = useApp()
  const { cols, rows } = useDimensions()

  const [commits, setCommits] = useState<LayoutCommit[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [status, setStatus] = useState<string>('')
  const [tab, setTab] = useState<Tab>('files')
  const [idx, setIdx] = useState<{ files: number; branches: number; commits: number }>({ files: 0, branches: 0, commits: 0 })
  const [mode, setMode] = useState<Mode>('normal')
  const [commitMsg, setCommitMsg] = useState('')
  const [branchName, setBranchName] = useState('')
  const [confirm, setConfirm] = useState<{ text: string; action: () => void } | null>(null)
  const [rightText, setRightText] = useState<string>('')
  const [rightScroll, setRightScroll] = useState(0)

  const files: FileItem[] = useMemo(() => {
    const out: FileItem[] = []
    for (const f of changes.unstaged) out.push({ path: f.path, kind: 'unstaged', status: f.status })
    for (const p of changes.untracked) out.push({ path: p, kind: 'untracked', status: '?' })
    for (const f of changes.staged) out.push({ path: f.path, kind: 'staged', status: f.status })
    return out
  }, [changes])

  const currentBranch = branches.find(b => b.current)?.name ?? initialBranch
  const ahead = branches.find(b => b.current)?.ahead ?? 0
  const behind = branches.find(b => b.current)?.behind ?? 0

  const reload = useCallback(async () => {
    try {
      const [log, br, ch] = await Promise.all([
        git.getLog({ maxCount: 300, all: true }),
        git.getBranches(),
        git.getWorkingChanges(),
      ])
      setCommits(computeGraphLayout(log.commits))
      setBranches(br.branches)
      setChanges(ch)
    } catch (e: any) {
      setStatus(`✗ ${e?.message ?? e}`)
    }
  }, [git])

  useEffect(() => { reload() }, [reload])

  // Clamp selection when lists shrink.
  useEffect(() => {
    setIdx(p => ({
      files: clamp(p.files, files.length),
      branches: clamp(p.branches, branches.length),
      commits: clamp(p.commits, commits.length),
    }))
  }, [files.length, branches.length, commits.length])

  // Load the right pane content for the current selection.
  useEffect(() => {
    let cancelled = false
    setRightScroll(0)
    async function load() {
      if (tab === 'files') {
        const f = files[idx.files]
        if (!f) { setRightText(''); return }
        if (f.kind === 'untracked') { setRightText('(nouveau fichier — non suivi)\n\n' + f.path); return }
        const r = await git.getWorkingFileDiff(f.path, f.kind === 'staged')
        if (!cancelled) setRightText(r.diff || '(aucune différence)')
      } else if (tab === 'commits') {
        const c = commits[idx.commits]
        if (!c) { setRightText(''); return }
        const r = await git.getDiff(c.hash)
        const head = `${c.shortHash}  ${c.message}\n${c.author} · ${c.date}\n${'─'.repeat(40)}\n`
        if (!cancelled) setRightText(head + (r.diff || '(aucune différence)'))
      } else {
        const b = branches[idx.branches]
        if (!b) { setRightText(''); return }
        const lines = [
          `Branche : ${b.name}${b.current ? '  (courante)' : ''}`,
          b.remote ? 'Type : distante' : 'Type : locale',
          b.ahead != null || b.behind != null ? `↑${b.ahead ?? 0}  ↓${b.behind ?? 0}` : '',
          b.gone ? 'Upstream supprimé sur le remote' : '',
          '',
          'Entrée : checkout · n : nouvelle branche · D : supprimer',
        ].filter(Boolean)
        setRightText(lines.join('\n'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [tab, idx, files, commits, branches, git])

  const flash = (m: string) => setStatus(m)
  const run = useCallback(async (label: string, fn: () => Promise<any>) => {
    setStatus(`${label}…`)
    try {
      const r = await fn()
      if (r && r.success === false) setStatus(`✗ ${label} : ${r.error ?? ''}`)
      else setStatus(`✓ ${label}`)
    } catch (e: any) {
      setStatus(`✗ ${label} : ${e?.message ?? e}`)
    }
    await reload()
  }, [reload])

  const askConfirm = (text: string, action: () => void) => { setConfirm({ text, action }); setMode('confirm') }

  const listLen = tab === 'files' ? files.length : tab === 'branches' ? branches.length : commits.length
  const move = (delta: number) => setIdx(p => ({ ...p, [tab]: clamp(p[tab] + delta, listLen) }))

  const panelH = Math.max(5, rows - 2)         // minus header + footer lines
  const innerH = Math.max(1, panelH - 2)       // minus Panel top/bottom border
  const listVisible = innerH
  const rightVisible = innerH
  const leftW = Math.min(48, Math.max(30, Math.floor(cols * 0.42)))
  const rightW = Math.max(24, cols - leftW)
  const leftContentW = leftW - 4
  const rightContentW = rightW - 4

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
        run('Commit', () => git.commit(msg)).then(() => { setCommitMsg('') })
        setMode('normal')
        return
      }
      if (key.backspace || key.delete) { setCommitMsg(m => m.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setCommitMsg(m => m + input)
      return
    }
    if (mode === 'newbranch') {
      if (key.escape) { setMode('normal'); setBranchName(''); return }
      if (key.return) {
        const name = branchName.trim()
        if (name) run('Nouvelle branche', () => git.createBranch(name))
        setBranchName(''); setMode('normal')
        return
      }
      if (key.backspace || key.delete) { setBranchName(s => s.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setBranchName(s => s + input)
      return
    }

    // ── NORMAL ──
    if (input === 'q') { exit(); return }
    if (input === '?') { setMode('help'); return }
    if (input === '1') { setTab('files'); return }
    if (input === '2') { setTab('branches'); return }
    if (input === '3') { setTab('commits'); return }
    if (key.tab) { const dir = key.shift ? -1 : 1; setTab(TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length]); return }
    if (input === 'r') { reload(); flash('Rechargé'); return }
    if (input === 'f') { run('Fetch', () => git.fetch()); return }
    if (input === 'p') { run('Pull', () => git.pull()); return }
    if (input === 'P') { run('Push', () => git.push()); return }
    if (key.ctrl && input === 'd') { setRightScroll(s => s + Math.floor(rightVisible / 2)); return }
    if (key.ctrl && input === 'u') { setRightScroll(s => Math.max(0, s - Math.floor(rightVisible / 2))); return }
    if (key.upArrow || input === 'k') { move(-1); return }
    if (key.downArrow || input === 'j') { move(1); return }

    if (tab === 'files') {
      const cur = files[idx.files]
      if (input === ' ' && cur) {
        if (cur.kind === 'staged') run('Désindexer', () => git.unstage([cur.path]))
        else run('Indexer', () => git.stage([cur.path]))
        return
      }
      if (input === 'a') { run('Tout indexer', () => git.stageAll()); return }
      if (input === 'A') { run('Tout désindexer', () => git.unstage(changes.staged.map(f => f.path))); return }
      if (input === 'c') { if (changes.staged.length === 0) flash('Rien d’indexé à committer'); else setMode('commit'); return }
      if (input === 'd' && cur) { askConfirm(`Annuler les modifs de ${cur.path} ?`, () => run('Annuler modifs', () => git.discardFile(cur.path))); return }
    }
    if (tab === 'branches') {
      const cur = branches[idx.branches]
      if (key.return && cur) { run(`Checkout ${cur.name}`, () => git.checkout(cur.name)); return }
      if (input === 'n') { setMode('newbranch'); return }
      if (input === 'D' && cur && !cur.current) { askConfirm(`Supprimer la branche ${cur.name} ?`, () => run('Supprimer branche', () => git.deleteBranch(cur.name))); return }
    }
  })

  // ── Rendering ──
  const graphRows = useMemo(() => buildGraphRows(commits), [commits])
  const rightTitle =
    tab === 'files' ? (files[idx.files]?.path.split('/').pop() ?? 'Diff')
      : tab === 'commits' ? (commits[idx.commits]?.shortHash ?? 'Commit')
        : (branches[idx.branches]?.name ?? 'Branche')

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Header */}
      <Box>
        <Text color={THEME.menuOn} bold>❯ Git Vertex </Text>
        <Text color={THEME.dim}>· {repo} · </Text>
        <Text color={THEME.title}>⎇ {currentBranch}</Text>
        {(ahead > 0 || behind > 0) && <Text color={THEME.dim}> ↑{ahead} ↓{behind}</Text>}
        <Text> </Text>
        {status && <Text color={status.startsWith('✗') ? '#f85149' : THEME.dim}>{status}</Text>}
      </Box>

      {/* Body */}
      {mode === 'help' ? (
        <Panel width={cols} height={panelH} num="?" title="Aide" accent={THEME.title}>
          <Text color={THEME.title} bold>Git Vertex — TUI</Text>
          <Text> </Text>
          <Text><Text color={THEME.title}>Global  </Text>Tab/⇧Tab changer de panneau · ↑↓ ou j/k naviguer · r recharger · q quitter</Text>
          <Text><Text color={THEME.title}>Remote  </Text>f fetch · p pull · P push</Text>
          <Text><Text color={THEME.title}>Fichiers</Text> Espace (dé)indexer · a tout indexer · A tout désindexer · c commit · d annuler</Text>
          <Text><Text color={THEME.title}>Branches</Text> Entrée checkout · n nouvelle branche · D supprimer</Text>
          <Text><Text color={THEME.title}>Diff    </Text>Ctrl+D / Ctrl+U défiler</Text>
          <Text> </Text>
          <Text dimColor>Une touche pour fermer.</Text>
        </Panel>
      ) : (
      <Box flexDirection="row" height={panelH}>
        {/* Left — Files / Branches / Commits */}
        <Panel
          width={leftW}
          height={panelH}
          num={String(TABS.indexOf(tab) + 1)}
          title={labelOf(tab, files.length, branches.length, commits.length)}
          menu={TABS.filter(t => t !== tab).map(t => ({ label: labelOf(t, files.length, branches.length, commits.length).split(' ')[0] }))}
        >
          {tab === 'files' && <FileList files={files} sel={idx.files} visible={listVisible} width={leftContentW} />}
          {tab === 'branches' && <BranchList branches={branches} sel={idx.branches} visible={listVisible} width={leftContentW} />}
          {tab === 'commits' && <CommitList commits={commits} graphRows={graphRows} sel={idx.commits} visible={listVisible} width={leftContentW} />}
        </Panel>

        {/* Right — Diff / details */}
        <Panel width={rightW} height={panelH} num="4" title={rightTitle} accent={THEME.menuOn}>
          <DiffPane text={rightText} scroll={rightScroll} visible={rightVisible} width={rightContentW} />
        </Panel>
      </Box>
      )}

      {/* Footer / modal line */}
      <Footer mode={mode} tab={tab} commitMsg={commitMsg} branchName={branchName} confirm={confirm} />
    </Box>
  )
}

function labelOf(t: Tab, nf: number, nb: number, nc: number): string {
  if (t === 'files') return `Fichiers ${nf}`
  if (t === 'branches') return `Branches ${nb}`
  return `Commits ${nc}`
}

function FileList({ files, sel, visible, width }: { files: FileItem[]; sel: number; visible: number; width: number }) {
  if (files.length === 0) return <Text dimColor>  Aucun changement</Text>
  const start = windowStart(sel, files.length, visible)
  const view = files.slice(start, start + visible)
  return (
    <Box flexDirection="column">
      {view.map((f, i) => {
        const gi = start + i
        const active = gi === sel
        const kindMark = f.kind === 'staged' ? '●' : f.kind === 'untracked' ? '+' : '○'
        const kindColor = f.kind === 'staged' ? '#3fb950' : f.kind === 'untracked' ? '#3fb950' : '#d29922'
        const name = truncate(f.path, width - 5)
        return (
          <Box key={f.kind + f.path} width={width}>
            <Text wrap="truncate-end" backgroundColor={active ? '#1f3a5f' : undefined}>
              <Text color={kindColor}>{kindMark} </Text>
              <Text color={statusColor(f.status)}>{f.status} </Text>
              <Text color={active ? '#ffffff' : '#c9d1d9'}>{name}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function BranchList({ branches, sel, visible, width }: { branches: BranchInfo[]; sel: number; visible: number; width: number }) {
  if (branches.length === 0) return <Text dimColor>  Aucune branche</Text>
  const start = windowStart(sel, branches.length, visible)
  const view = branches.slice(start, start + visible)
  return (
    <Box flexDirection="column">
      {view.map((b, i) => {
        const gi = start + i
        const active = gi === sel
        return (
          <Box key={b.name} width={width}>
            <Text wrap="truncate-end" backgroundColor={active ? '#1f3a5f' : undefined}>
              <Text color={b.current ? '#3fb950' : b.remote ? '#8b949e' : '#58a6ff'}>{b.current ? '* ' : '  '}</Text>
              <Text color={active ? '#ffffff' : b.remote ? '#8b949e' : '#c9d1d9'}>{truncate(b.name, width - 3)}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function CommitList({ commits, graphRows, sel, visible, width }: { commits: LayoutCommit[]; graphRows: { char: string; color: string }[][]; sel: number; visible: number; width: number }) {
  if (commits.length === 0) return <Text dimColor>  Aucun commit</Text>
  const start = windowStart(sel, commits.length, visible)
  const view = commits.slice(start, start + visible)
  // Pad the graph column to a fixed width so hashes/messages align.
  const gcol = Math.min(8, Math.max(1, ...view.map((_, i) => (graphRows[start + i]?.length ?? 1))))
  return (
    <Box flexDirection="column">
      {view.map((c, i) => {
        const gi = start + i
        const active = gi === sel
        const g = (graphRows[gi] ?? []).slice(0, gcol)
        const pad = Math.max(0, gcol - g.length)
        return (
          <Box key={c.hash} width={width}>
            <Text wrap="truncate-end">
              {g.map((cell, k) => (
                <Text key={k} color={cell.color || undefined}>{cell.char}</Text>
              ))}
              <Text>{' '.repeat(pad)} </Text>
              <Text color={THEME.dim}>{c.shortHash} </Text>
              <Text backgroundColor={active ? THEME.selBg : undefined} color={active ? '#ffffff' : THEME.text}>{c.message}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function DiffPane({ text, scroll, visible, width }: { text: string; scroll: number; visible: number; width: number }) {
  const lines = text ? text.split('\n') : ['']
  const hasFooter = lines.length > visible
  const room = hasFooter ? visible - 1 : visible
  const maxScroll = Math.max(0, lines.length - room)
  const start = Math.min(scroll, maxScroll)
  const view = lines.slice(start, start + room)
  return (
    <Box flexDirection="column">
      {view.map((l, i) => {
        let color: string | undefined
        let dim = false
        if (l.startsWith('@@')) color = '#58a6ff'
        else if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) dim = true
        else if (l.startsWith('+')) color = '#3fb950'
        else if (l.startsWith('-')) color = '#f85149'
        else color = '#8b949e'
        const s = truncate(l, width)
        return <Text key={i} color={color} dimColor={dim} wrap="truncate-end">{s.length ? s : ' '}</Text>
      })}
      {hasFooter && <Text color={THEME.dim}>… {start + view.length}/{lines.length} lignes · Ctrl+D/U défiler</Text>}
    </Box>
  )
}

function Footer({ mode, tab, commitMsg, branchName, confirm }: { mode: Mode; tab: Tab; commitMsg: string; branchName: string; confirm: { text: string } | null }) {
  if (mode === 'commit') return <Text><Text color="#3fb950">Message : </Text><Text>{commitMsg}</Text><Text color="#58a6ff">▏</Text><Text dimColor>  (Entrée valider · Échap annuler)</Text></Text>
  if (mode === 'newbranch') return <Text><Text color="#58a6ff">Nouvelle branche : </Text><Text>{branchName}</Text><Text color="#58a6ff">▏</Text><Text dimColor>  (Entrée créer · Échap annuler)</Text></Text>
  if (mode === 'confirm') return <Text><Text color="#d29922">{confirm?.text} </Text><Text dimColor>(y / n)</Text></Text>
  if (mode === 'help') return <Text dimColor>Aide affichée — une touche pour fermer</Text>
  const common = '1/2/3 ou Tab · ↑↓/jk · f/p/P fetch/pull/push · r · ? aide · q'
  const perTab =
    tab === 'files' ? 'Espace (dé)indexer · a tout · c commit · d annuler'
      : tab === 'branches' ? 'Entrée checkout · n nouvelle · D supprimer'
        : 'Ctrl+D/U défiler le diff'
  return <Text wrap="truncate-end"><Text color="#7ee787">{perTab}</Text><Text dimColor>  │  {common}</Text></Text>
}

function truncate(s: string, w: number): string {
  if (w <= 1) return ''
  if (s.length <= w) return s
  return s.slice(0, Math.max(1, w - 1)) + '…'
}
