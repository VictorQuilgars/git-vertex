import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import { BranchInfo, StashScope } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import GithubRow from '../GitHubPanel/GithubRow'
import { loadGhFilters, saveGhFilters, validateGhQuery, composeGhQuery, ghFilterSyntax,
  GH_SEARCH_DOCS_URL, type GhSavedFilter, type GhFilterStore } from './ghFilters'
import { buildBranchMenu } from '../ContextMenu/branchMenu'
import { buildBranchTree, folderPaths, type BranchNode } from './branchTree'
import type { PRIntent } from '../ContextMenu/prIntent'
import { publishedNameFor } from '../ContextMenu/branchRefs'
import { isRefHidden, type GraphVisibility, type RefFamily } from '../../utils/graphVisibility'
import { issueRefLabel, type IssueRef as LinkedIssueRef } from '../../utils/issueRef'
import { useLang } from '../../i18n/LanguageContext'
import './Sidebar.css'
import { Brand, type BrandName } from '../BrandMark/BrandMark'
import PanelDrawer from '../PanelDrawer/PanelDrawer'

interface StashEntry { index: number; message: string }
interface TagEntry   { name: string; hash: string }

// Single-view mode (VS Code panel): the rail on the left selects which one of
// these views the resizable side-panel shows. When `view` is undefined the
// Sidebar renders its classic stacked layout (desktop app).
export type SidebarView =
  | 'overview' | 'agents' | 'worktrees' | 'branches' | 'remotes' | 'stash' | 'tags'
  | 'prs' | 'issues'

interface ReflogEntry { hash: string; ref: string; message: string; date: string }
/**
 * A row of the two GitHub sections — the fields the list endpoints already
 * return. Everything beyond the identity is optional: a host that still maps
 * the narrow shape gets the narrow row, not empty separators.
 */
export interface GithubListItem {
  number: number
  title: string
  author?: string
  draft?: boolean
  url: string
  createdAt?: string
  comments?: number
  labels?: { name: string; color: string }[]
  headRef?: string
  baseRef?: string
  body?: string
  assignees?: string[]
  /** Logins whose review is requested — what Awaiting My Review groups on. */
  reviewers?: string[]
}
interface RemoteEntry { name: string; fetchUrl: string; pushUrl: string }
interface SubmoduleEntry { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }
interface WorktreeEntry { path: string; branch: string; head: string; isMain: boolean; locked: boolean }
interface AgentEntry { pid: number; name: string; cwd: string }

interface SidebarProps {
  repoPath: string | null
  repoName: string
  currentBranch: string
  branches: BranchInfo[]
  recentRepos: string[]
  stashes: StashEntry[]
  tags: TagEntry[]
  onOpenRepo: () => void
  onClone: () => void
  onSetRepo: (path: string) => void
  onRemoveRecent: (path: string) => void
  onCheckout: (name: string) => void
  onCreateBranch: () => void
  onDeleteBranch: (name: string) => void
  onMergeBranch: (name: string) => void
  onRenameBranch: (name: string) => void
  onRebaseOnto: (name: string) => void
  onPushBranch: (name: string) => void
  onDeleteRemoteBranch: (name: string) => void
  onSetUpstream: (name: string) => void
  onCreateStash: (scope?: StashScope) => void
  onApplyStash: (index: number) => void
  onPopStash: (index: number) => void
  onDropStash: (index: number) => void
  onPreviewStash?: (index: number, message: string) => void
  onRefreshStashes: () => void
  onCreateTag: () => void
  onDeleteTag: (name: string) => void
  /** Menu entry on a tag: check out the commit it points at (detaches HEAD). */
  onCheckoutTag: (name: string) => void
  /**
   * Double-click on any row: take me to that point, landing on a local
   * branch. The host decides how (getCheckoutPlan) — switch to a branch that
   * is already there, create the one tracking a remote branch, or ask for a
   * name. Falls back to a plain checkout when a host does not provide it.
   */
  onGoTo: (ref: string) => void
  onPushTag: (name: string) => void
  onDeleteRemoteTag: (name: string) => void
  onSelectCommit: (hash: string) => void
  onCompareBranch: (branchName: string) => void
  soloBranch: string | null
  /**
   * Everything hidden from the graph — branches, tags, remotes, and the
   * families hidden wholesale. One object rather than a set per kind: the host
   * builds the log query from the same value, and two sources of truth for
   * "what is hidden" would drift the moment one of them gained an entry.
   */
  visibility: GraphVisibility
  onToggleSolo: (name: string) => void
  onToggleHide: (name: string) => void
  // Hiding beyond branches. Omitted ⇒ the matching menu rows disappear, which
  // is how a host that has not wired them avoids offering a dead action.
  onToggleHideTag?: (name: string) => void
  onToggleHideRemote?: (name: string) => void
  /**
   * "Hide all" / "Show all" for a whole family — the group action.
   *
   * Hiding sets one flag rather than marking the N rows on screen, so a branch
   * pushed after the fact is hidden too. Showing clears that flag *and* the
   * rows hidden one by one, which is what someone reaching for "Show all"
   * means and what the section's chip promises.
   */
  onSetFamilyHidden?: (family: RefFamily, hidden: boolean) => void
  // Pull for the checked-out branch. Fetch is deliberately absent: it acts on
  // the repo, not on the branch you right-clicked, and lives on the toolbar.
  onPull?: () => void
  // Branch metadata git has no concept of (v1.21.0) — supplied by
  // useBranchMeta in the host. Omitted ⇒ the matching menu rows disappear.
  isFavorite?: (name: string) => boolean
  issueFor?: (name: string) => LinkedIssueRef | null
  onToggleFavorite?: (name: string) => void
  onOpenBranchOnRemote?: (name: string) => void
  onAssociateIssue?: (name: string) => void
  // The pull request a branch row should offer, or null for none — the rules
  // live in prIntentFor, the host just supplies the answer. Omitted when the
  // repo has no GitHub remote.
  prIntentFor?: (branchRef: string) => PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  /**
   * Re-read one GitHub section. The two lists are two calls and either can be
   * the stale one, so the button says which — refreshing both because one
   * looks wrong spends two requests to answer one question.
   */
  /**
   * The graph's widest scope: every branch, or only the one you are on — the
   * `--all` of the log query. It lives here because everything else that
   * decides what the graph draws lives here: hide per ref, hide per family,
   * solo. It was the one part of that system in the toolbar (#132).
   */
  showAllBranches?: boolean
  onToggleAllBranches?: () => void
  onRefreshGithub?: (section: 'prs' | 'issues') => void
  /** The section currently in flight, so its button is out of action. */
  githubRefreshing?: 'prs' | 'issues' | null
  /** Bumped per section on a manual refresh — see GhFilterGroup. */
  githubRefreshTick?: { prs: number; issues: number }
  /** Background poll counter — see GhFilterGroup's pollTick. */
  githubPollTick?: number
  onCopyBranchLink?: (name: string) => void
  /** Deletes the local branch and its published counterpart together. */
  onDeleteBranchBoth?: (name: string, remoteName: string) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>
  showConfirm: (msg: string, danger?: boolean) => Promise<boolean>
  // Branch/commit state lives in the host, so actions that invalidate it
  // (prune) ask for a reload instead of trying to patch it locally.
  onRefresh?: () => void
  /**
   * Pull requests and issues, as sections of this panel rather than a view of
   * their own — the place they are looked at is beside the branches.
   *
   * `undefined` means "this host has no GitHub for this repository" and the
   * section does not render at all; an empty array means "asked, and there are
   * none", which is a different thing and says so.
   */
  githubPRs?: GithubListItem[]
  githubIssues?: GithubListItem[]
  /** Start work on an issue: create the branch it suggests and link the two.
      Omitted ⇒ no context menu on the issue rows. */
  onStartBranchFromIssue?: (issue: { number: number; title: string; url: string }) => void
  /** Open a row's in-app detail — §3 bis for issues, #110 §2 for pull
      requests. Omitted ⇒ clicks fall back to onOpenGithubItem, the browser. */
  onShowGithubDetail?: (item: GithubListItem, kind: 'pr' | 'issue') => void
  /** True while a detail is open in the centre: the rows stop offering their
      hover card — the peek makes no sense over the answer. */
  githubDetailOpen?: boolean
  /** The signed-in login, from githubGetUser. Without it the three account
      groups of PULL REQUESTS have nothing to say and are hidden. */
  githubLogin?: string | null
  /** The repository the sections read — what §4's saved filters query. */
  githubRepo?: { owner: string; repo: string } | null
  onOpenGithubItem?: (url: string) => void
  // Embedded host (VS Code panel): the repo is the workspace, so the
  // open/clone/recent repo picker doesn't apply and is hidden.
  embedded?: boolean
  // Single-view mode: render only the section the activity rail selected.
  // Undefined = classic stacked layout (desktop).
  view?: SidebarView
}

/** §2's lens: does a row survive the section's search box? */
function ghMatch(item: GithubListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return item.title.toLowerCase().includes(needle)
    || String(item.number).includes(needle)
    || (item.author ?? '').toLowerCase().includes(needle)
}

// ── §4: the filter editor of a section — beside the list, not over it ────
function GhFilterEditor({ kind, initial, draft, onCreate, onCancel, onDraft, t }: {
  kind: 'prs' | 'issues'
  /**
   * An existing filter being edited. This — and only this — is what makes the
   * button read Save: a restored draft is still a filter being CREATED.
   */
  initial?: GhSavedFilter
  /** Text kept from a previous open, so closing the drawer loses nothing. */
  draft?: GhSavedFilter
  onCreate: (f: GhSavedFilter) => void
  onCancel: () => void
  /** Reported as it is typed, so closing the drawer does not lose it (#145). */
  onDraft?: (f: GhSavedFilter) => void
  t: (k: any, ...a: any[]) => string
}) {
  const [name, setName] = useState(initial?.name ?? draft?.name ?? '')
  const [query, setQuery] = useState(initial?.query ?? draft?.query ?? '')
  useEffect(() => { onDraft?.({ name, query }) }, [name, query])
  const verdict = validateGhQuery(query, kind)
  const ready = name.trim() !== '' && query.trim() !== '' && verdict.ok
  return (
    <div className="sb-gh-fedit">
      {/* Labels above their fields, and a placeholder that says what to type
          rather than showing an example of the answer. */}
      <label className="sb-gh-fedit-field">
        <span className="sb-gh-fedit-label">{t('sb.gh.filter.name')}</span>
        <input className="sb-gh-fedit-name" placeholder={t('sb.gh.filter.namePlaceholder')} autoFocus
          value={name} onChange={e => setName(e.target.value)} />
      </label>

      <label className="sb-gh-fedit-field">
        <span className="sb-gh-fedit-label">
          {kind === 'prs' ? t('sb.gh.filter.queryPrs') : t('sb.gh.filter.queryIssues')}
        </span>
        <div className={`sb-gh-fedit-querybox${query.trim() && !verdict.ok ? ' sb-gh-fedit-querybox--bad' : ''}`}>
          {/* The verdict lives IN the field: it is about what is typed there. */}
          <Icon name={query.trim() && !verdict.ok ? 'conflict' : 'check'} size={13}
            className={query.trim() && !verdict.ok ? 'sb-gh-fedit-mark--bad' : 'sb-gh-fedit-mark--ok'} />
          <input className="sb-gh-fedit-query"
            placeholder={kind === 'prs' ? t('sb.gh.filter.queryPrsPlaceholder') : t('sb.gh.filter.queryIssuesPlaceholder')}
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </label>

      {/* A bad token is NAMED, not just refused. */}
      {query.trim() !== '' && !verdict.ok && (
        <div className="sb-gh-fedit-bad">{t('sb.gh.filter.badToken', (verdict as any).bad)}</div>
      )}

      <button className="sb-gh-fedit-create" disabled={!ready}
        onClick={() => onCreate({ name: name.trim(), query: query.trim() })}>
        {initial ? t('sb.gh.filter.save') : t('sb.gh.filter.create')}
      </button>

      {/* The reference, in the room the drawer bought (#145). Keys alone said a
          token exists without saying what may follow the colon — which is the
          half that makes a query writable. */}
      <div className="sb-gh-fedit-syntax">
        <div className="sb-gh-fedit-syntax-head">
          {kind === 'prs' ? t('sb.gh.filter.syntaxPrs') : t('sb.gh.filter.syntaxIssues')}
        </div>
        <p className="sb-gh-fedit-syntax-more">
          {t('sb.gh.filter.readMore')}{' '}
          <a className="sb-gh-fedit-link"
            onClick={() => (window.gitAPI as any).openExternal?.(GH_SEARCH_DOCS_URL)}>
            {t('sb.gh.filter.docs')}
          </a>
        </p>
        <div className="sb-gh-fedit-syntax-head sb-gh-fedit-syntax-by">{t('sb.gh.filter.filterBy')}</div>
        <dl className="sb-gh-fedit-keys">
          {ghFilterSyntax(kind).map(k => (
            <div key={k.key} className="sb-gh-fedit-keyrow">
              <dt>{k.label}:</dt>
              {/* Clicking it writes the qualifier into the query — the
                  reference is usable, not only readable. */}
              <dd>
                <button type="button" className="sb-gh-fedit-key"
                  title={t('sb.gh.filter.addKey', k.key)}
                  onClick={() => setQuery(q => (q.trim() ? `${q.trim()} ` : '') + `${k.key}:`)}>
                  {k.syntax}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ── §4: a saved filter is one more named group, and it RE-QUERIES ─────────
// Its life is its own: a malformed or refused query costs this group alone,
// never the section. The count is the search's total, and when GitHub sent
// fewer rows than it counted, the tail row says so instead of letting the
// group read as complete.
function GhFilterGroup({ filter, kind, repo, refreshOn, refreshTick = 0, pollTick = 0, renderItem, onOpen, onEdit, onDelete, t }: {
  filter: GhSavedFilter
  kind: 'prs' | 'issues'
  repo: { owner: string; repo: string }
  refreshOn: unknown
  /**
   * Bumped by the section's refresh button. It is not just another dependency:
   * a run it triggers passes `force` to the search, because that call is cached
   * for 20 seconds (`github:search-issues`). Without it, the one click a user
   * makes BECAUSE the list looks wrong returns the same wrong list, and the
   * button reads as broken.
   */
  refreshTick?: number
  /**
   * Bumped by the background poll (#141). Unlike `refreshTick` it does NOT
   * force: the search's own 20-second cache absorbs it, so a saved filter
   * stays current without each one costing a request every tick against an
   * API capped at thirty a minute.
   */
  pollTick?: number
  renderItem: (item: GithubListItem, kind: 'pr' | 'issue') => React.ReactNode
  onOpen?: (url: string) => void
  onEdit: () => void
  onDelete: () => void
  t: (k: any, ...a: any[]) => string
}) {
  // Closed by default, for the same reason as GhGroup above.
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<{ total: number; items: any[] } | { error: string } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const q = composeGhQuery(filter.query, kind, repo.owner, repo.repo)
  // Which run this is: the tick moving means a person asked for it.
  const seenTick = useRef(refreshTick)
  useEffect(() => {
    let alive = true
    const forced = seenTick.current !== refreshTick
    seenTick.current = refreshTick
    setState(null)
    ;(window.gitAPI as any).githubSearchIssues?.(q, forced)
      .then((r: any) => {
        if (!alive) return
        if (r?.error) setState({ error: r.error === 'rate_limited' ? t('sb.gh.filter.rateLimited', r.retryIn ?? 60) : r.error })
        else setState({ total: r?.total ?? 0, items: r?.items ?? [] })
      })
      .catch((e: any) => { if (alive) setState({ error: e.message }) })
    return () => { alive = false }
  }, [q, refreshOn, refreshTick, pollTick, t])

  const failed = state && 'error' in state
  const result = state && !('error' in state) ? state : null
  return (
    <div className="sb-gh-group">
      <div className={`sb-gh-group-head${open ? ' sb-gh-group-head--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}>
        <Icon name="play" size={8} />
        <Icon name="sliders" size={10} />
        <span className="sb-gh-group-title">{filter.name}</span>
        <span className="sb-gh-group-count">{result ? result.total : '…'}</span>
      </div>
      {failed && <div className="sb-gh-filter-error">{(state as any).error}</div>}
      {open && result && result.items.length > 0 && (
        <div className="sb-gh-group-body">
          {result.items.map((x: any) => renderItem({
            number: x.number, title: x.title, url: x.url, author: x.author,
            draft: x.draft, createdAt: x.createdAt, comments: x.comments,
            labels: x.labels, body: x.body,
          }, x.type === 'pr' ? 'pr' : 'issue'))}
          {result.total > result.items.length && (
            <button className="sb-gh-more"
              onClick={() => onOpen?.(`https://github.com/search?q=${encodeURIComponent(q)}`)}>
              {t('sb.gh.filter.more', result.total - result.items.length)}
            </button>
          )}
        </div>
      )}
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)}
          items={[
            { label: t('sb.gh.filter.edit'), action: onEdit },
            { label: t('sb.gh.filter.delete'), action: onDelete },
          ]} />
      )}
    </div>
  )
}

// ── A named group inside a GitHub section (§1 bis) ───────────────
// Collapses on its own and carries its own count. A group with nothing in
// it still shows, with its 0 — that is what says the query ran. Groups that
// cannot run (the account ones, with nobody signed in) are not rendered at
// all by the caller, which is a different statement.
function GhGroup({ title, count, children, defaultOpen = false }: {
  title: string
  count: number
  children: React.ReactNode
  /**
   * Closed by default, like the sections themselves. Four groups and every
   * saved filter opening at once buries the branches under a section that was
   * meant to be read beside them — and the count on each header already says
   * what is behind it, which is what makes a folded group informative rather
   * than hidden.
   */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sb-gh-group">
      <div className={`sb-gh-group-head${open ? ' sb-gh-group-head--open' : ''}`}
        onClick={() => setOpen(o => !o)}>
        <Icon name="play" size={8} />
        <span className="sb-gh-group-title">{title}</span>
        <span className="sb-gh-group-count">{count}</span>
      </div>
      {open && count > 0 && <div className="sb-gh-group-body">{children}</div>}
    </div>
  )
}

// ── Collapse section ─────────────────────────────────────────────
function Section({ title, icon, brand, count, children, defaultOpen = true, onAdd, addLabel, menuItems, hiddenCount, onShowAll, onRefresh, refreshing, onFold }: {
  title: string
  /**
   * What the section IS, beside what it is called. Eleven headers in a column
   * of small capitals are told apart by reading them; a mark is found without
   * reading, which is what a panel you glance at needs.
   */
  icon?: IconName
  /**
   * A THIRD PARTY's mark, for a section that is about their product rather
   * than about git. Separate from `icon` on purpose, and not merged into it:
   * components/Icon holds drawings we own and may reweight, BrandMark holds
   * marks we only display and may never redraw. One prop for both would put a
   * trademark behind a type that promises we can restyle it.
   */
  brand?: BrandName
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  /**
   * Re-read what this section lists. Omitted ⇒ no button, which is every
   * section whose contents come from the repository on disk and are already
   * reloaded by the watcher. The GitHub ones are the exception: they come from
   * a server that changes without us.
   */
  onRefresh?: () => void
  /** In flight — the button is out of action, so it cannot be hammered. */
  refreshing?: boolean
  /**
   * Folded shut. The GitHub sections use it to drop whatever was typed in
   * their search box: the box folds away with the rows, and a filter still
   * applied but no longer visible is how a section comes back looking empty
   * while its count says otherwise (#144).
   */
  onFold?: () => void
  // The event is handed over so a section can anchor a menu to the + button
  // (the stash one offers a scope) instead of acting straight away.
  onAdd?: (e: React.MouseEvent) => void
  addLabel?: string
  // Actions that act on everything the section lists — hide all, show all.
  // Right-click on the header, like every other menu here.
  menuItems?: MenuItemDef[]
  // How many of the rows are hidden from the graph. Above zero the header
  // carries a chip that says so and restores them: the group actions live in a
  // menu nobody thinks to open, and a section quietly filtering the graph with
  // nothing on screen to say so is how you end up mistrusting the graph.
  hiddenCount?: number
  onShowAll?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  return (
    <div className="sb-section">
      <div className="sb-section-header"
        onClick={() => setOpen(o => { if (o) onFold?.(); return !o })}
        onContextMenu={menuItems?.length
          ? e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }) }
          : undefined}
      >
        <Icon name="play" size={10} />
        {icon && <Icon name={icon} size={13} className="sb-section-icon" />}
        {brand && <Brand name={brand} size={13} className="sb-section-icon" />}
        <span className="sb-section-title">{title}</span>
        {count !== undefined && <span className="sb-section-count">{count}</span>}
        {!!hiddenCount && onShowAll && (
          <button className="sb-section-hidden" title={t('sb.hidden.chipTitle', hiddenCount)}
            onClick={e => { e.stopPropagation(); onShowAll() }}>
            <Icon name="eyeOff" size={11} />
            {hiddenCount}
          </button>
        )}
        {onRefresh && (
          <button className={`sb-add-btn sb-on-hover${refreshing ? ' sb-on-hover--pinned' : ''}`}
            title={t('sb.gh.refresh')} disabled={refreshing}
            onClick={e => { e.stopPropagation(); onRefresh() }}>
            <Icon name="refresh" size={12} />
          </button>
        )}
        {onAdd && (
          <button className="sb-add-btn sb-on-hover" title={addLabel ?? t('sb.add')}
            onClick={e => { e.stopPropagation(); onAdd(e) }}>
            <Icon name="plus" size={12} />
          </button>
        )}
      </div>
      {open && <div className="sb-section-body">{children}</div>}
      {ctx && !!menuItems?.length && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </div>
  )
}

// ── The branch tree ──────────────────────────────────────────────
// A branch name is a path, so the sections draw it as one (#134). Folders are
// rows of their own; every leaf is the same BranchItem the flat list used, so
// nothing a row carries — the menu, the PR chip, ahead/behind, solo, hide,
// drag-and-drop — changes with the shape it is drawn in.

/**
 * The tree's indent, built from the panel's one scale rather than a copy of
 * it: `--sb-indent`, `--sb-indent-step` and `--sb-branch-inset` are declared
 * once on `.sidebar` in Sidebar.css, and these read them.
 *
 * A number kept in both files is how the folders once landed at zero while the
 * stylesheet said 26 — and how the GitHub groups ended up on an indent scale
 * of their own (#138). There is one scale, and it is in the stylesheet.
 */
const folderIndent = (depth: number) =>
  `calc(var(--sb-indent) + ${depth} * var(--sb-indent-step))`
/** A leaf is a BranchItem, which already carries `--sb-branch-inset` itself. */
const leafIndent = (depth: number) =>
  `calc(var(--sb-indent) - var(--sb-branch-inset) + ${depth} * var(--sb-indent-step))`

function BranchTree<T>({ nodes, open, onToggle, renderLeaf, depth = 0 }: {
  nodes: BranchNode<T>[]
  open: Set<string>
  onToggle: (path: string) => void
  renderLeaf: (item: T, label: string) => React.ReactNode
  depth?: number
}) {
  const { t } = useLang()
  return (
    <>
      {nodes.map(node => node.kind === 'leaf'
        ? (
          <div key={node.path} className="sb-tree-leaf"
            style={{ paddingLeft: leafIndent(depth) }}>
            {renderLeaf(node.item, node.label)}
          </div>
        )
        : (
          <div key={node.path}>
            {/* Indented from the section title, and level with the branch
                rows beside it: a folder and a branch at the same depth are the
                same depth. The scale is the panel's, declared on `.sidebar`. */}
            <div className="sb-tree-folder"
              style={{ paddingLeft: folderIndent(depth) }}
              title={node.path}
              onClick={() => onToggle(node.path)}>
              <Icon name="folder" size={12} />
              <span className="sb-tree-folder-name">{node.label}</span>
              <span className="sb-tree-folder-count">{countLeaves([node])}</span>
            </div>
            {open.has(node.path) && (
              <BranchTree nodes={node.children} open={open} onToggle={onToggle}
                renderLeaf={renderLeaf} depth={depth + 1} />
            )}
          </div>
        ))}
      {nodes.length === 0 && <div className="sb-empty">{t('sb.noLocalBranch')}</div>}
    </>
  )
}

function countLeaves<T>(nodes: BranchNode<T>[]): number {
  return nodes.reduce((n, x) => n + (x.kind === 'leaf' ? 1 : countLeaves(x.children)), 0)
}

// ── Branch item with context menu ────────────────────────────────
interface BranchItemProps {
  name: string
  current: boolean
  remote?: boolean
  currentBranch: string
  onCheckout: () => void
  onDelete?: () => void
  onMerge?: () => void
  onRename?: () => void
  onCompare?: () => void
  onRebaseOnto?: () => void
  onPush?: () => void
  onDeleteRemote?: () => void
  onSetUpstream?: () => void
  soloed?: boolean
  hidden?: boolean
  favorite?: boolean
  issue?: LinkedIssueRef | null
  onPull?: () => void
  onToggleSolo?: () => void
  onToggleHide?: () => void
  onToggleFavorite?: () => void
  onOpenOnRemote?: () => void
  onAssociateIssue?: () => void
  /** The pull request this row offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  /** `origin/x` when the remote holds this branch — gates the remote-side rows. */
  publishedAs?: string
  onCopyLink?: () => void
  onDeleteBoth?: () => void
  ahead?: number
  behind?: number
  gone?: boolean
  // Set when another remote also has a branch with this same short name —
  // disambiguates "main" vs "main" by showing "origin/main" / "archive/main"
  // instead of collapsing both to a bare "main".
  showRemotePrefix?: boolean
  /**
   * What the row reads as. The tree passes the last path segment, because the
   * folders above it already spell the rest. Everything else — the menu, the
   * ref, copy-name — keeps using the full name (#134).
   */
  displayAs?: string
}

function BranchItem({ name, current, remote, currentBranch, onCheckout, onDelete, onMerge, onRename, onCompare, onRebaseOnto, onPush, onDeleteRemote, onSetUpstream, soloed, hidden, favorite, issue, onPull, onToggleSolo, onToggleHide, onToggleFavorite, onOpenOnRemote, onAssociateIssue, pr, onCreatePR, publishedAs, onCopyLink, onDeleteBoth, ahead = 0, behind = 0, gone = false, showRemotePrefix = false, displayAs }: BranchItemProps) {
  const [hover, setHover] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const { t } = useLang()
  const fullDisplay = remote
    ? (showRemotePrefix ? name.replace(/^remotes\//, '') : name.replace(/^remotes\/[^/]+\//, ''))
    : name
  // The menu, the ref and copy-name all keep the full name; only what the eye
  // reads is shortened by the tree.
  const display = displayAs ?? fullDisplay

  // Same builder the toolbars use — right-click here and the ⋮ button up there
  // now offer the identical menu (v1.21.0).
  const menuItems: MenuItemDef[] = buildBranchMenu(
    { name, display: fullDisplay, current, remote: !!remote, pr: pr ?? undefined, publishedAs },
    { currentBranch, soloed, hidden, favorite, issue },
    {
      onCheckout: current ? undefined : onCheckout,
      onPull,
      onPush, onSetUpstream,
      onCreatePR: pr && onCreatePR ? () => onCreatePR(pr) : undefined,
      onMerge, onRebaseOnto, onCompare,
      onOpenOnRemote, onAssociateIssue, onToggleFavorite,
      onToggleSolo, onToggleHide,
      onCopyName: () => navigator.clipboard.writeText(fullDisplay),
      onCopyLink,
      onRename, onDelete, onDeleteRemote, onDeleteBoth,
    },
    t
  )

  const handleMouseDown = (e: React.MouseEvent) => {
    if (current) return
    const now = Date.now()
    if (now - lastClickTime.current < 400) {
      // Double-click détecté : bloquer la sélection AVANT que le navigateur agisse
      e.preventDefault()
      onCheckout()
      lastClickTime.current = 0
    } else {
      lastClickTime.current = now
    }
  }

  return (
    <>
      <div
        className={`sb-branch-item ${current ? 'current' : ''} ${remote ? 'remote' : ''} ${hidden ? 'is-hidden' : ''} ${soloed ? 'soloed' : ''}`}
        onMouseDown={handleMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={current ? t('sb.branch.currentTitle', name) : t('sb.branch.hint')}
      >
        <Icon name="branch" size={11} className="branch-icon" />
        <span className="sb-branch-name">{display}</span>
        {(ahead > 0 || behind > 0) && (
          <span className="sb-track" title={t('sb.branch.trackTitle', ahead, behind)}>
            {ahead > 0 && <span className="sb-track-ahead">↑{ahead}</span>}
            {behind > 0 && <span className="sb-track-behind">↓{behind}</span>}
          </span>
        )}
        {gone && <span className="sb-track sb-track-gone" title={t('sb.branch.goneTitle')}>✂</span>}
        {favorite && <span className="sb-branch-flag sb-branch-star" title={t('sb.branch.favoriteFlag')}>★</span>}
        {issue && (
          <span className="sb-branch-flag" title={issue.title || issueRefLabel(issue)}>{issueRefLabel(issue)}</span>
        )}
        {soloed && <Icon name="eye" size={12} className="sb-branch-flag" title={t('sb.branch.soloFlag')} />}
        {hidden && <span className="sb-branch-flag" title={t('sb.branch.hiddenFlag')}>⊘</span>}
        {current && (
          <Icon name="check" size={11} className="current-check" />
        )}
        {/* Hover affordance for the whole menu rather than the lone delete
            cross it replaces — right-click was the only way in before, which
            is what made every other branch action invisible (v1.21.0). */}
        {hover && menuItems.length > 0 && (
          <button className="sb-branch-menu-btn" title={t('sb.branch.menu')}
            onClick={e => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setCtx({ x: r.right, y: r.bottom + 2 })
            }}>
            <Icon name="kebab" size={12} />
          </button>
        )}
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Stash item ────────────────────────────────────────────────────
function StashItem({ stash, onApply, onPop, onDrop, onPreview, onRename, hidden }: {
  stash: StashEntry
  onApply: () => void
  onPop: () => void
  onDrop: () => void
  onPreview?: () => void
  onRename?: () => void
  /**
   * Dimmed, but with no row action to undo it: the entries of `git stash list`
   * are the reflog of a single ref, `refs/stash`, so git can take all of them
   * out of the graph or none. Hiding lives on the section, and offering it per
   * row would promise something git cannot do.
   */
  hidden?: boolean
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const label = stash.message.replace(/^stash@\{\d+\}: /, '')

  const menuItems: MenuItemDef[] = [
    ...(onPreview ? [{ label: t('sb.stash.preview'), action: onPreview }] : []),
    { label: t('sb.stash.applyKeep'), action: onApply },
    { label: t('sb.stash.applyPop'), action: onPop },
    ...(onRename ? [{ label: t('sb.stash.rename'), action: onRename }] : []),
    { separator: true },
    { label: t('sb.delete'), action: onDrop, danger: true },
  ]

  return (
    <>
      <div
        className={`sb-stash-item${hidden ? ' is-hidden' : ''}`}
        onClick={onPreview}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onPreview ? t('sb.stash.title', stash.message) : stash.message}
      >
        <Icon name="stash" size={11} className="stash-icon" />
        <span className="sb-stash-label">{label}</span>
        <span className="sb-stash-index">#{stash.index}</span>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Tag item ──────────────────────────────────────────────────────
function TagItem({ tag, onGoTo, onCheckoutCommit, onDelete, onPush, onDeleteRemote, hidden, onToggleHide }: {
  tag: TagEntry
  /** Double-click: take me here, landing on a branch. Never detaches HEAD. */
  onGoTo?: () => void
  /** Menu only: check out the COMMIT the tag points at, detaching HEAD. */
  onCheckoutCommit?: () => void
  onDelete: () => void; onPush: () => void; onDeleteRemote: () => void
  hidden?: boolean
  onToggleHide?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const { t } = useLang()
  const menuItems: MenuItemDef[] = [
    // A tag is not a branch and cannot be checked out as one. What this does is
    // check out the commit it points at, which detaches HEAD — so the label
    // says commit, not tag, and it is the only entry in the sidebar that
    // detaches anything.
    ...(onCheckoutCommit ? [{ label: t('sb.tag.checkoutCommit'), action: onCheckoutCommit }] : []),
    { label: t('sb.copyName'), action: () => navigator.clipboard.writeText(tag.name) },
    { label: t('sb.tag.push'), action: onPush },
    ...(onToggleHide ? [{
      label: hidden ? t('sb.tag.show') : t('sb.tag.hide'),
      action: onToggleHide,
      checked: !!hidden,
    }] : []),
    { separator: true },
    { label: t('sb.tag.deleteLocal'), action: onDelete, danger: true },
    { label: t('sb.tag.deleteRemote'), action: onDeleteRemote, danger: true },
  ]

  // Same 400ms double-click detection as BranchItem. It used to check the tag
  // out and detach HEAD (v1.23.0); a double-click now means the same thing here
  // as everywhere else — land on a branch — so it offers to create one at the
  // tagged commit instead.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onGoTo) return
    const now = Date.now()
    if (now - lastClickTime.current < 400) {
      e.preventDefault()
      onGoTo()
      lastClickTime.current = 0
    } else {
      lastClickTime.current = now
    }
  }

  return (
    <>
      <div
        className={`sb-tag-item${hidden ? ' is-hidden' : ''}`}
        onMouseDown={handleMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onGoTo ? t('sb.tag.hint', tag.name, tag.hash) : `${tag.name} → ${tag.hash}`}
      >
        <Icon name="tag" size={13} className="sb-tag-icon" />
        <span className="sb-tag-name">{tag.name}</span>
        {hidden && <span className="sb-row-flag" title={t('sb.hidden.flag')}>⊘</span>}
        <code className="sb-tag-hash">{tag.hash}</code>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Reflog item ───────────────────────────────────────────────────
function ReflogItem({ entry, onSelect }: { entry: ReflogEntry; onSelect: () => void }) {
  return (
    <div className="sb-reflog-item" onClick={onSelect} title={`${entry.ref}: ${entry.message}`}>
      <Icon name="reflog" size={13} className="sb-reflog-icon" />
      <div className="sb-reflog-info">
        <span className="sb-reflog-ref">{entry.ref}</span>
        <span className="sb-reflog-msg">{entry.message}</span>
        <span className="sb-reflog-date">{entry.date}</span>
      </div>
    </div>
  )
}

// ── Remote item ───────────────────────────────────────────────────
function RemoteItem({
  remote, isDefault, onSetDefault, onFetch, onPrune, onRename, onRemove, onCopyUrl, hidden, onToggleHide
}: {
  remote: RemoteEntry
  isDefault: boolean
  onSetDefault: () => void
  onFetch: () => void
  onPrune: () => void
  onRename: () => void
  onRemove: () => void
  onCopyUrl: () => void
  /** Hidden here means all of this remote's branches are out of the graph. */
  hidden?: boolean
  onToggleHide?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const menuItems: MenuItemDef[] = [
    { label: t('sb.remote.fetch'), action: onFetch },
    { label: t('sb.remote.prune'), action: onPrune },
    // checked (not just disabled) so the current default is visible at a glance
    { label: t('sb.remote.setDefault'), action: onSetDefault, checked: isDefault },
    { label: t('sb.remote.copyUrl'), action: onCopyUrl },
    { label: t('sb.rename'), action: onRename },
    ...(onToggleHide ? [{
      label: hidden ? t('sb.remote.show') : t('sb.remote.hide'),
      action: onToggleHide,
      checked: !!hidden,
    }] : []),
    { separator: true },
    { label: t('sb.delete'), action: onRemove, danger: true },
  ]

  return (
    <>
      <div
        className={`sb-remote-item${hidden ? ' is-hidden' : ''}`}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={remote.fetchUrl}
      >
        <Icon name="mail" size={11} className="remote-icon" />
        <div className="sb-remote-info">
          <span className="sb-remote-name">
            {remote.name}
            {isDefault && <span className="sb-remote-default" title={t('sb.remote.defaultFlag')}>{t('sb.remote.defaultBadge')}</span>}
            {hidden && <span className="sb-row-flag" title={t('sb.hidden.flag')}>⊘</span>}
          </span>
          <span className="sb-remote-url">{remote.fetchUrl}</span>
        </div>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Submodule item ────────────────────────────────────────────────
function SubmoduleItem({
  sub, onInit, onUpdate
}: {
  sub: SubmoduleEntry
  onInit: () => void
  onUpdate: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const statusColor = sub.status === 'ok' ? 'var(--success)' : sub.status === 'dirty' ? 'var(--attention)' : 'var(--text-disabled)'
  const statusLabel = sub.status === 'ok' ? '✓' : sub.status === 'dirty' ? '~' : '○'

  const menuItems: MenuItemDef[] = [
    ...(sub.status === 'uninitialized' ? [{ label: t('sb.sub.init'), action: onInit }] : []),
    { label: t('sb.sub.update'), action: onUpdate },
  ]

  return (
    <>
      <div
        className="sb-submodule-item"
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={sub.url}
      >
        <span className="sb-sub-status" style={{ color: statusColor }}>{statusLabel}</span>
        <div className="sb-sub-info">
          <span className="sb-sub-path">{sub.path}</span>
          <span className="sb-sub-url">{sub.url}</span>
        </div>
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Worktree item ─────────────────────────────────────────────────
function WorktreeItem({ wt, agents = [], onOpen, onRemove }: {
  wt: WorktreeEntry
  // Running AI agents whose cwd is inside this worktree
  agents?: AgentEntry[]
  onOpen: () => void
  onRemove: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const name = wt.path.split('/').pop() || wt.path
  const menuItems: MenuItemDef[] = [
    { label: t('sb.wt.open'), action: onOpen },
    { label: t('sb.wt.copyPath'), action: () => navigator.clipboard.writeText(wt.path) },
    ...(!wt.isMain ? [
      { separator: true as const },
      { label: t('sb.wt.remove'), action: onRemove, danger: true },
    ] : []),
  ]
  // De-duplicate agent names ("2× Claude Code" reads better than twice the badge)
  const agentSummary = [...new Map(agents.map(a => [a.name, agents.filter(x => x.name === a.name).length])).entries()]

  return (
    <>
      <div
        className="sb-submodule-item"
        onClick={onOpen}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={agents.length ? `${wt.path}\n${agents.map(a => `● ${a.name} (pid ${a.pid})`).join('\n')}` : wt.path}
        style={{ cursor: 'pointer' }}
      >
        <span className="sb-sub-status" style={{ color: wt.isMain ? 'var(--success)' : 'var(--accent)' }}>
          {wt.isMain ? '◉' : '○'}
        </span>
        <div className="sb-sub-info">
          <span className="sb-sub-path">
            {name} <code style={{ opacity: 0.6 }}>{wt.branch}</code>
            {agentSummary.map(([agentName, count]) => (
              <span key={agentName} className="sb-agent-badge">
                <span className="sb-agent-dot" />
                {count > 1 ? `${count}× ` : ''}{agentName}
              </span>
            ))}
          </span>
          <span className="sb-sub-url">{wt.path}</span>
        </div>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────
export default function Sidebar({
  repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags,
  onOpenRepo, onClone, onSetRepo, onRemoveRecent,
  onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch,
  onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream,
  onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onRefreshStashes,
  onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag,
  onSelectCommit, onCompareBranch,
  soloBranch, visibility, onToggleSolo, onToggleHide,
  onToggleHideTag, onToggleHideRemote, onSetFamilyHidden,
  onPull,
  githubPRs, githubIssues, onOpenGithubItem, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo,
  isFavorite, issueFor, onToggleFavorite,
  onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR,
  showAllBranches, onToggleAllBranches,
  onRefreshGithub, githubRefreshing, githubRefreshTick, githubPollTick,
  onCopyBranchLink, onDeleteBranchBoth,
  showToast, showPrompt, showConfirm, onRefresh, embedded = false, view,
}: SidebarProps) {
  // In single-view mode a section is shown when it matches the active view.
  // Without a view (desktop) every section renders (classic stacked layout).
  const single = view !== undefined
  const show = (v: SidebarView) => !single || view === v
  const [reflog, setReflog] = useState<ReflogEntry[]>([])
  const [remotes, setRemotes] = useState<RemoteEntry[]>([])
  // Which remote push/pull target by default — resolved by the service, so it
  // reflects the explicit choice or the origin/first-remote fallback.
  const [defaultRemote, setDefaultRemote] = useState<string | null>(null)
  const [submodules, setSubmodules] = useState<SubmoduleEntry[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([])
  // Running AI agents (Claude Code, aider…) keyed by their cwd — matched
  // against worktree paths to badge "an agent is working here".
  const [agents, setAgents] = useState<AgentEntry[]>([])
  // Working-tree summary for the overview "current work" card.
  const [work, setWork] = useState<{ staged: number; changed: number }>({ staged: 0, changed: 0 })
  const { t } = useLang()

  // Swallowing this silently is what kept the empty Agents view alive in the VS
  // Code panel for two releases: the host answered not-implemented, the catch
  // ate it, and the list just rendered as "none running". Log instead — a
  // console line is the difference between a bug you can see and one you can't.
  const loadAgents = useCallback(() => {
    ;(window.gitAPI as any).listAgents?.()
      .then((r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? []))
      .catch((e: unknown) => console.warn('[sidebar] listAgents failed:', e))
  }, [])

  const loadWorktrees = useCallback(() => {
    window.gitAPI.listWorktrees().then(r => setWorktrees(r.worktrees ?? []))
    loadAgents()
  }, [loadAgents])

  useEffect(() => {
    if (!repoPath) return
    window.gitAPI.getReflog().then(r => setReflog(r.entries ?? []))
    window.gitAPI.getRemotes().then(r => setRemotes(r.remotes ?? []))
    window.gitAPI.getDefaultRemote?.().then(r => setDefaultRemote(r?.remote ?? null)).catch(() => {})
    window.gitAPI.getSubmodules().then(r => setSubmodules(r.submodules ?? []))
    window.gitAPI.getWorkingChanges?.()
      .then(w => setWork({ staged: w.staged.length, changed: w.unstaged.length + w.untracked.length }))
      .catch(() => {})
    loadWorktrees()
    // Light poll so agent badges stay current while the sidebar is open.
    const interval = setInterval(loadAgents, 10000)
    return () => clearInterval(interval)
  }, [repoPath, loadWorktrees, loadAgents])

  const agentsFor = useCallback((wtPath: string) =>
    agents.filter(a => a.cwd === wtPath || a.cwd.startsWith(wtPath + '/')),
  [agents])

  const handleAddWorktree = async () => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const ref = await showPrompt(t('sb.wt.checkoutPrompt'), currentBranch)
    if (ref === null) return
    const r = await window.gitAPI.addWorktree(dir.path, ref || '')
    if (r.success) { showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? '')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleRemoveWorktree = async (path: string) => {
    const ok = await showConfirm(t('sb.wt.removeConfirm', path), true)
    if (!ok) return
    let r = await window.gitAPI.removeWorktree(path)
    if (!r.success && r.error && /contains modified|untracked|use --force|locked/i.test(r.error)) {
      const force = await showConfirm(t('sb.wt.forceConfirm'), true)
      if (force) r = await window.gitAPI.removeWorktree(path, true)
    }
    if (r.success) { showToast(t('sb.wt.removed')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleInitSubmodule = async (path: string) => {
    const r = await window.gitAPI.initSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.initialized', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleUpdateSubmodule = async (path: string) => {
    const r = await window.gitAPI.updateSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.updated', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleAddRemote = async () => {
    const name = await showPrompt(t('sb.remote.namePrompt'))
    if (!name) return
    const url = await showPrompt(t('sb.remote.urlPrompt'))
    if (!url) return
    const r = await window.gitAPI.addRemote(name, url)
    if (r.success) {
      showToast(t('sb.remote.added', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleRemoveRemote = async (name: string) => {
    const ok = await showConfirm(t('sb.remote.removeConfirm', name), true)
    if (!ok) return
    const r = await window.gitAPI.removeRemote(name)
    if (r.success) {
      showToast(t('sb.remote.removed', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleRenameRemote = async (name: string) => {
    const newName = await showPrompt(t('sb.remote.renamePrompt', name), name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameRemote(name, newName)
    if (r.success) {
      showToast(t('sb.remote.renamed', newName))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  // The + on the stash section offers a scope rather than always taking
  // everything: stashing only the index (or only what isn't staged) is a
  // routine move git supports natively (v1.23.0).
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number } | null>(null)
  // §2's search — a display lens like the staging filter: it narrows what is
  // already shown, it does not re-query. One per GitHub section.
  const [prsQuery, setPrsQuery] = useState('')
  const [issuesQuery, setIssuesQuery] = useState('')
  // §4's saved filters — per repository, and each one re-queries on its own.
  const [ghFilters, setGhFilters] = useState<GhFilterStore>({ prs: [], issues: [] })
  // null = closed; -1 = creating; n≥0 = editing that filter
  const [filterEditor, setFilterEditor] = useState<{ section: 'prs' | 'issues'; index: number } | null>(null)
  useEffect(() => { setGhFilters(loadGhFilters(repoName || 'repo')) }, [repoName])
  const mutateFilters = useCallback((section: 'prs' | 'issues', fn: (a: GhSavedFilter[]) => GhSavedFilter[]) => {
    setGhFilters(prev => {
      const next = { ...prev, [section]: fn(prev[section]) }
      saveGhFilters(repoName || 'repo', next)
      return next
    })
  }, [repoName])
  const stashScopeItems: MenuItemDef[] = [
    { label: t('sb.stash.scopeAll'), action: () => onCreateStash('all') },
    { label: t('sb.stash.scopeStaged'), action: () => onCreateStash('staged') },
    { label: t('sb.stash.scopeUnstaged'), action: () => onCreateStash('unstaged') },
  ]

  // git has no `stash rename`, so this re-stores the entry under a new label —
  // which moves it to the top of the stack. Say so rather than let the list
  // reorder itself unexplained (v1.23.0).
  const handleRenameStash = async (index: number, current: string) => {
    const label = current.replace(/^stash@\{\d+\}: /, '')
    const next = await showPrompt(t('sb.stash.renamePrompt'), label)
    if (!next || next === label) return
    const r = await window.gitAPI.renameStash(index, next)
    if (r.success) { showToast(t('sb.stash.renamed')); onRefreshStashes() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // Pruning the remote is only half the cleanup: once its tracking refs go,
  // the local branches that pointed at them read as "gone" and are usually
  // dead too — so offer to sweep them in the same gesture rather than leaving
  // the user to hunt for them one by one (v1.23.0).
  const handlePruneRemote = async (name: string) => {
    const r = await window.gitAPI.pruneRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }

    const pruned = r.pruned ?? []
    showToast(pruned.length ? t('sb.remote.pruneOk', name, pruned.length) : t('sb.remote.pruneNone', name))
    onRefresh?.()

    const { branches: gone } = await window.gitAPI.getGoneBranches()
    if (gone.length === 0) return
    const ok = await showConfirm(t('sb.branch.pruneGoneConfirm', gone.length, gone.join(', ')), true)
    if (!ok) return
    const d = await window.gitAPI.pruneGoneBranches(gone)
    if (d.success) showToast(t('sb.branch.pruneGoneOk', d.deleted.length))
    else showToast(t('toast.err', d.error ?? ''), 'err')
    onRefresh?.()
  }

  const handleSetDefaultRemote = async (name: string) => {
    const r = await window.gitAPI.setDefaultRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    setDefaultRemote(name)
    showToast(t('sb.remote.defaultSet', name))
  }

  const handleFetchRemote = async (name: string) => {
    const r = await window.gitAPI.fetchRemote(name)
    if (r.success) showToast(t('sb.remote.fetchOk', name))
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
  }
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')
  const repoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) {
        setRepoMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Favorites float to the top of LOCAL — the whole point of starring a branch
  // is not to hunt for it in a long list (v1.21.0). Order is otherwise
  // untouched, so unstarred branches keep the ordering git gave us.
  const localBranches = branches
    .filter(b => !b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
    .sort((a, b) => Number(isFavorite?.(b.name) ?? false) - Number(isFavorite?.(a.name) ?? false))
  // ── What each section hides from the graph ────────────────────
  // A row is hidden in its own right or because its family is; the count on a
  // section header has to say both, or "Hide all tags" would leave every tag
  // looking visible.
  // `getBranches` names a remote branch `remotes/origin/x`, which is the one
  // decoration form isRefHidden reads without being told the remotes — so the
  // rule that decides a chip decides a row, rather than a second copy of it.
  const branchHidden = (b: BranchInfo) => isRefHidden(b.name, visibility)
  const tagHidden = (name: string) => visibility.families.has('tags') || visibility.tags.has(name)
  const remoteHidden = (name: string) => visibility.families.has('remotes') || visibility.remotes.has(name)
  const stashesHidden = visibility.families.has('stashes')
  const familyMenu = (family: RefFamily): MenuItemDef[] | undefined => onSetFamilyHidden && [
    {
      label: t('sb.hidden.hideAll'),
      action: () => onSetFamilyHidden(family, true),
      checked: visibility.families.has(family),
    },
    { label: t('sb.hidden.showAll'), action: () => onSetFamilyHidden(family, false) },
  ]
  // Which folders are open, per repository. Everything starts open: a tree
  // that reopens collapsed on every launch is slower than the flat list it
  // replaced. Only what the user closed is remembered.
  const foldersKey = `gv:branch-folders:${repoName || repoPath || ''}`
  const [closedFolders, setClosedFolders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(foldersKey) || '[]')) } catch { return new Set() }
  })
  useEffect(() => {
    try { return void localStorage.setItem(foldersKey, JSON.stringify([...closedFolders])) } catch { /* private mode */ }
  }, [foldersKey, closedFolders])
  const toggleFolder = useCallback((path: string) => {
    setClosedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }, [])
  /** Open = everything the user has not closed. */
  const openFolders = (nodes: BranchNode<any>[]) =>
    new Set(folderPaths(nodes).filter(p => !closedFolders.has(p)))

  // A filter FLATTENS the tree for as long as it is non-empty. A tree that
  // stays folded while you type reads as an empty section, and expanding every
  // ancestor of every match is the same list with indentation in front of it.
  const filtering = !!branchFilter

  /** The panel the filter drawer measures itself against (#145). */
  const rootRef = useRef<HTMLDivElement | null>(null)
  /**
   * A half-written query survives closing the drawer, per section. Escape and
   * a click outside close it, and losing what was typed there would make both
   * of those hostile — so the draft is kept and restored, and only Cancel or a
   * successful create clears it.
   */
  const [filterDraft, setFilterDraft] = useState<{ prs?: GhSavedFilter; issues?: GhSavedFilter }>({})

  const showAll = (family: RefFamily) => onSetFamilyHidden && (() => onSetFamilyHidden(family, false))

  /**
   * LOCAL's menu is the family rows plus the graph's scope, ruled off from
   * them. The two are not the same kind of setting and must not read as three
   * versions of one: hiding takes refs away from `--all`, this decides whether
   * there is an `--all` at all. With it off, the hide rows above have nothing
   * to act on — the log is already one branch (git-service.ts, `options.all`).
   */
  const localMenu = (): MenuItemDef[] | undefined => {
    const family = familyMenu('branches')
    if (!onToggleAllBranches) return family
    const scope: MenuItemDef[] = [
      { separator: true },
      {
        label: t('sb.graph.allBranches'),
        action: onToggleAllBranches,
        checked: !!showAllBranches,
      },
    ]
    return [...(family ?? []), ...scope]
  }

  const remoteBranches = branches
    .filter(b => b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))

  const otherRecents = recentRepos.filter(r => r !== repoPath)

  return (
    <div className="sidebar" ref={rootRef}>
      {/* One drawer, given which section opened it — the two vocabularies are
          a prop, not a second component (#145). */}
      {filterEditor && githubRepo && (
        <PanelDrawer anchor={rootRef} onClose={() => setFilterEditor(null)}
          icon={filterEditor.section === 'prs' ? 'pullRequest' : 'issue'}
          closeLabel={t('common.close')}
          title={filterEditor.index >= 0
            ? t('sb.gh.filter.edit')
            : filterEditor.section === 'prs' ? t('sb.gh.filter.newPr') : t('sb.gh.filter.newIssue')}>
          <GhFilterEditor
            kind={filterEditor.section}
            t={t}
            initial={filterEditor.index >= 0
              ? ghFilters[filterEditor.section][filterEditor.index]
              : undefined}
            draft={filterEditor.index >= 0 ? undefined : filterDraft[filterEditor.section]}
            // An EMPTY draft is no draft: kept as an object it would make the
            // editor think it is editing an existing filter, and its button
            // would read Save on a form that has never been filled in.
            onDraft={f => setFilterDraft(d => ({
              ...d, [filterEditor.section]: (f.name || f.query) ? f : undefined,
            }))}
            onCancel={() => {
              setFilterDraft(d => ({ ...d, [filterEditor.section]: undefined }))
              setFilterEditor(null)
            }}
            onCreate={f => {
              const at = filterEditor.index
              mutateFilters(filterEditor.section, a => at >= 0 ? a.map((x, i) => i === at ? f : x) : [...a, f])
              setFilterDraft(d => ({ ...d, [filterEditor.section]: undefined }))
              setFilterEditor(null)
            }} />
        </PanelDrawer>
      )}
      {/* ── Repo selector ── (hidden when embedded in the VS Code panel: the
          repo is always the workspace, so open/clone/recent don't apply) */}
      {!embedded && (
      <div className="sb-repo-area" ref={repoMenuRef}>
        <button className="sb-repo-btn" onClick={() => setRepoMenuOpen(o => !o)}>
          <Icon name="repo" size={14} />
          <span className="sb-repo-name">{repoName || t('sb.openRepo')}</span>
          <Icon name="caretDown" size={10} />
        </button>

        {repoMenuOpen && (
          <div className="sb-repo-dropdown">
            <button className="sb-dropdown-item sb-open-item"
              onClick={() => { onOpenRepo(); setRepoMenuOpen(false) }}>
              <Icon name="list" size={13} />
              {t('sb.openRepoDots')}
            </button>
            <button className="sb-dropdown-item sb-open-item"
              onClick={() => { onClone(); setRepoMenuOpen(false) }}>
              <Brand name="github" size={13} />
              {t('sb.cloneDots')}
            </button>
            {otherRecents.length > 0 && (
              <>
                <div className="sb-dropdown-sep" />
                <div className="sb-dropdown-label">{t('sb.recents')}</div>
                {otherRecents.map(path => (
                  <div key={path} className="sb-dropdown-item sb-recent-item">
                    <button className="sb-recent-path"
                      onClick={() => { onSetRepo(path); setRepoMenuOpen(false) }} title={path}>
                      <Icon name="repo" size={11} />
                      <span>{path.split('/').pop()}</span>
                      <span className="sb-recent-full">{path}</span>
                    </button>
                    <button className="sb-recent-remove" title={t('sb.removeRecent')}
                      onClick={() => onRemoveRecent(path)}>×</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Branch filter ── (branches view only in single mode) */}
      {repoPath && show('branches') && (
        <div className="sb-search">
          <Icon name="search" size={12} />
          <input type="text" placeholder={t('sb.filterBranches')}
            value={branchFilter} onChange={e => setBranchFilter(e.target.value)} />
          {branchFilter && <button className="sb-filter-clear" title={t('common.clearFilter')} onClick={() => setBranchFilter('')}>×</button>}
        </div>
      )}

      {/* ── Sections ── */}
      {repoPath && (
        <div className="sb-sections">

          {/* OVERVIEW "current work" card (single-view only) */}
          {view === 'overview' && (() => {
            const cur = branches.find(b => b.current)
            const ahead = cur?.ahead ?? 0
            const behind = cur?.behind ?? 0
            const hasStats = ahead > 0 || behind > 0 || work.staged > 0 || work.changed > 0
            return (
              <div className="sb-overview">
                <div className="sb-ov-label">{t('sb.currentWork')}</div>
                <div className="sb-ov-card">
                  <div className="sb-ov-branch">
                    <Icon name="branch" size={14} />
                    <span className="sb-ov-branch-name">{currentBranch}</span>
                    {agents.length > 0 && (
                      <span className="sb-ov-agents" title={t('sb.agentsActive', agents.length)}>
                        <span className="sb-agent-dot" />{agents.length}
                      </span>
                    )}
                  </div>
                  {hasStats && (
                    <div className="sb-ov-stats">
                      {ahead > 0 && <span className="sb-track-ahead" title={t('sb.branch.trackTitle', ahead, behind)}>↑{ahead}</span>}
                      {behind > 0 && <span className="sb-track-behind" title={t('sb.branch.trackTitle', ahead, behind)}>↓{behind}</span>}
                      {work.staged > 0 && <span className="sb-ov-staged" title={t('sb.staged')}>+{work.staged}</span>}
                      {work.changed > 0 && <span className="sb-ov-changed" title={t('sb.changed')}>✎{work.changed}</span>}
                    </div>
                  )}
                  {!hasStats && <div className="sb-ov-clean">{t('sb.clean')}</div>}
                </div>
              </div>
            )
          })()}

          {/* AGENTS (single-view only) */}
          {view === 'agents' && (
            <Section title="AGENTS" icon="agent" count={agents.length} defaultOpen>
              {agents.length === 0
                ? <div className="sb-empty">{t('sb.noAgent')}</div>
                : agents.map(a => (
                    <div key={a.pid} className="sb-submodule-item" title={a.cwd}>
                      <span className="sb-agent-dot" />
                      <div className="sb-sub-info">
                        <span className="sb-sub-path">
                          {a.name} <code style={{ opacity: 0.6 }}>pid {a.pid}</code>
                        </span>
                        <span className="sb-sub-url">{a.cwd}</span>
                      </div>
                    </div>
                  ))
              }
            </Section>
          )}

          {/* LOCAL (also shown in the overview "current work" home) */}
          {(show('branches') || view === 'overview') && (
          <Section title="LOCAL" icon="device" count={localBranches.length} onAdd={onCreateBranch} addLabel={t('sb.newBranch')}
            menuItems={localMenu()}
            hiddenCount={localBranches.filter(branchHidden).length}
            onShowAll={showAll('branches')}>
            {(() => {
              // The rows themselves are unchanged; only their arrangement is.
              const leaf = (b: BranchInfo, displayAs?: string) => (
                <BranchItem
                  displayAs={displayAs}
                  key={b.name}
                name={b.name}
                current={b.current}
                currentBranch={currentBranch}
                onCheckout={() => !b.current && onGoTo(b.name)}
                onDelete={() => onDeleteBranch(b.name)}
                onMerge={() => onMergeBranch(b.name)}
                onRename={() => onRenameBranch(b.name)}
                onCompare={!b.current ? () => onCompareBranch(b.name) : undefined}
                onRebaseOnto={!b.current ? () => onRebaseOnto(b.name) : undefined}
                onPush={() => onPushBranch(b.name)}
                onSetUpstream={() => onSetUpstream(b.name)}
                onPull={b.current ? onPull : undefined}
                soloed={soloBranch === b.name}
                hidden={branchHidden(b)}
                onToggleSolo={() => onToggleSolo(b.name)}
                onToggleHide={() => onToggleHide(b.name)}
                favorite={isFavorite?.(b.name)}
                issue={issueFor?.(b.name)}
                onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                onAssociateIssue={onAssociateIssue && (() => onAssociateIssue(b.name))}
                pr={prIntentFor?.(b.name)}
                onCreatePR={onCreatePR}
                publishedAs={publishedNameFor(b.name, branches) ?? undefined}
                onCopyLink={onCopyBranchLink && (() => onCopyBranchLink(b.name))}
                onDeleteRemote={() => {
                  const published = publishedNameFor(b.name, branches)
                  if (published) onDeleteRemoteBranch(`remotes/${published}`)
                }}
                onDeleteBoth={onDeleteBranchBoth && (() => {
                  const published = publishedNameFor(b.name, branches)
                  if (published) onDeleteBranchBoth(b.name, published)
                })}
                ahead={b.ahead}
                behind={b.behind}
                gone={b.gone}
                      />
              )
              if (filtering) return localBranches.map(b => leaf(b))
              const nodes = buildBranchTree(localBranches, b => b.name)
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
          </Section>
          )}

          {/* REMOTE */}
          {show('branches') && remoteBranches.length > 0 && (
            <Section title="REMOTE" icon="cloud" count={remoteBranches.length} defaultOpen={single}
              menuItems={familyMenu('remotes')}
              hiddenCount={remoteBranches.filter(branchHidden).length}
              onShowAll={showAll('remotes')}>
              {(() => {
              // `remotes/origin/fix/x` minus the `remotes/` prefix is
              // `origin/fix/x` — so the remote becomes the first folder for
              // free, and position now tells two `main`s apart. That is what
              // `showRemotePrefix` was for, and why it is gone.
              const leaf = (b: BranchInfo, displayAs?: string) => (
                <BranchItem
                    displayAs={displayAs}
                    key={b.name}
                    name={b.name}
                    current={false}
                    remote={true}
                    currentBranch={currentBranch}
                    onCheckout={() => onGoTo(b.name)}
                    onDeleteRemote={() => onDeleteRemoteBranch(b.name)}
                    soloed={soloBranch === b.name}
                    hidden={branchHidden(b)}
                    onToggleSolo={() => onToggleSolo(b.name)}
                    onToggleHide={() => onToggleHide(b.name)}
                    favorite={isFavorite?.(b.name)}
                    onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                    onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                    pr={prIntentFor?.(b.name)}
                    onCreatePR={onCreatePR}
                    publishedAs={b.name.replace(/^remotes\//, '')}
                    onCopyLink={onCopyBranchLink && (() => onCopyBranchLink(b.name))}
                  />
              )
              if (filtering) return remoteBranches.map(b => leaf(b))
              const nodes = buildBranchTree(remoteBranches, b => b.name.replace(/^remotes\//, ''))
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
            </Section>
          )}

          {/* TAGS */}
          {show('tags') && (
          <Section title="TAGS" icon="tag" count={tags.length} defaultOpen={single}
            onAdd={onCreateTag} addLabel={t('sb.newTag')}
            menuItems={familyMenu('tags')}
            hiddenCount={tags.filter(tg => tagHidden(tg.name)).length}
            onShowAll={showAll('tags')}>
            {tags.length === 0
              ? <div className="sb-empty">{t('sb.noTag')}</div>
              : tags.map(t => (
                  <TagItem key={t.name} tag={t}
                    onGoTo={() => onGoTo(t.name)}
                    onCheckoutCommit={() => onCheckoutTag(t.name)}
                    onDelete={() => onDeleteTag(t.name)}
                    onPush={() => onPushTag(t.name)} onDeleteRemote={() => onDeleteRemoteTag(t.name)}
                    hidden={tagHidden(t.name)}
                    onToggleHide={onToggleHideTag && (() => onToggleHideTag(t.name))} />
                ))
            }
          </Section>
          )}

          {/* REMOTES */}
          {show('remotes') && (
          <Section title="REMOTES" icon="repo" count={remotes.length} defaultOpen={single}
            onAdd={handleAddRemote} addLabel={t('sb.addRemote')}
            menuItems={familyMenu('remotes')}
            hiddenCount={remotes.filter(r => remoteHidden(r.name)).length}
            onShowAll={showAll('remotes')}>
            {remotes.length === 0
              ? <div className="sb-empty">{t('sb.noRemote')}</div>
              : remotes.map(r => (
                  <RemoteItem
                    key={r.name}
                    remote={r}
                    isDefault={defaultRemote === r.name}
                    onSetDefault={() => handleSetDefaultRemote(r.name)}
                    onFetch={() => handleFetchRemote(r.name)}
                    onPrune={() => handlePruneRemote(r.name)}
                    onRename={() => handleRenameRemote(r.name)}
                    onRemove={() => handleRemoveRemote(r.name)}
                    onCopyUrl={() => navigator.clipboard.writeText(r.fetchUrl)}
                    hidden={remoteHidden(r.name)}
                    onToggleHide={onToggleHideRemote && (() => onToggleHideRemote(r.name))}
                  />
                ))
            }
          </Section>
          )}

          {/* SUBMODULES */}
          {show('overview') && submodules.length > 0 && (
            <Section title="SUBMODULES" icon="listTree" count={submodules.length} defaultOpen={false}>
              {submodules.map(sub => (
                <SubmoduleItem
                  key={sub.path}
                  sub={sub}
                  onInit={() => handleInitSubmodule(sub.path)}
                  onUpdate={() => handleUpdateSubmodule(sub.path)}
                />
              ))}
            </Section>
          )}

          {/* WORKTREES */}
          {show('worktrees') && (
          <Section title="WORKTREES" icon="worktree" count={worktrees.length} defaultOpen={single}
            onAdd={handleAddWorktree} addLabel={t('sb.addWorktree')}>
            {worktrees.length === 0
              ? <div className="sb-empty">{t('sb.noWorktree')}</div>
              : worktrees.map(wt => (
                  <WorktreeItem
                    key={wt.path}
                    wt={wt}
                    agents={agentsFor(wt.path)}
                    onOpen={() => onSetRepo(wt.path)}
                    onRemove={() => handleRemoveWorktree(wt.path)}
                  />
                ))
            }
          </Section>
          )}

          {/* REFLOG — recovery/history tool, kept collapsed at the bottom of
              the overview (not the point of the overview) */}
          {show('overview') && (
          <Section title="REFLOG" icon="reflog" count={reflog.length} defaultOpen={false}>
            {reflog.length === 0
              ? <div className="sb-empty">{t('sb.reflogEmpty')}</div>
              : reflog.map((entry, i) => (
                  <ReflogItem
                    key={i}
                    entry={entry}
                    onSelect={() => onSelectCommit(entry.hash)}
                  />
                ))
            }
          </Section>
          )}

          {/* PULL REQUESTS — a section, not a view of its own: it is read
              beside the branches, and a tab would replace what is being worked
              on. Absent entirely when the host has no GitHub here. */}
          {githubPRs && show('prs') && (
            <Section title="PULL REQUESTS" icon="pullRequest" count={githubPRs.length} defaultOpen={single}
              onRefresh={onRefreshGithub && (() => onRefreshGithub('prs'))}
              refreshing={githubRefreshing === 'prs'}
              onFold={() => setPrsQuery('')}>
              <div className="sb-gh-search">
                <Icon name="search" size={11} />
                <input type="text" placeholder={t('sb.gh.searchPrs')} value={prsQuery}
                  onChange={e => setPrsQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPrsQuery('') } }} />
                {/* The filter editor opens from HERE, not the header: it is an
                    action on the list, and the list is what folds (#144). */}
                <button className="sb-gh-filter-btn" title={t('sb.gh.filter.new')}
                  onClick={() => setFilterEditor(f => f?.section === 'prs' ? null : { section: 'prs', index: -1 })}>
                  <Icon name="sliders" size={12} />
                </button>
              </div>
              {(() => {
                const prRow = (pr: GithubListItem) => (
                  <GithubRow key={pr.number} compact item={{ ...pr, kind: 'pr' }}
                    hoverCard={!githubDetailOpen}
                    onOpen={url => onOpenGithubItem?.(url)}
                    onDetail={onShowGithubDetail ? () => onShowGithubDetail(pr, 'pr') : undefined} />
                )
                // The account groups exist only with an identity: with nobody
                // signed in they have nothing to say, and three empty rows
                // would read as "no pull requests".
                const accountGroups = githubLogin ? [
                  { key: 'mine', title: t('sb.gh.group.mine'), rows: githubPRs.filter(pr => pr.author === githubLogin) },
                  { key: 'assigned', title: t('sb.gh.group.assigned'), rows: githubPRs.filter(pr => pr.assignees?.includes(githubLogin)) },
                  { key: 'review', title: t('sb.gh.group.review'), rows: githubPRs.filter(pr => pr.reviewers?.includes(githubLogin)) },
                ] : []
                // The lens narrows the rows; the counts keep counting
                // everything — the same rule as every filter in the app.
                return (
                  <>
                    {accountGroups.map(g => (
                      <GhGroup key={g.key} title={g.title} count={g.rows.length}>
                        {g.rows.filter(pr => ghMatch(pr, prsQuery)).map(prRow)}
                      </GhGroup>
                    ))}
                    <GhGroup title={t('sb.gh.group.allPrs')} count={githubPRs.length}>
                      {githubPRs.filter(pr => ghMatch(pr, prsQuery)).map(prRow)}
                    </GhGroup>
                    {githubRepo && ghFilters.prs.map((f, fi) => (
                      <GhFilterGroup key={`${f.name}:${f.query}`} filter={f} kind="prs"
                        repo={githubRepo} refreshOn={githubPRs}
                        refreshTick={githubRefreshTick?.prs} pollTick={githubPollTick} t={t}
                        onOpen={url => onOpenGithubItem?.(url)}
                        renderItem={(item, k) => (
                          <GithubRow key={`${k}-${item.number}`} compact item={{ ...item, kind: k }}
                            hoverCard={!githubDetailOpen}
                            onOpen={url => onOpenGithubItem?.(url)}
                            onDetail={onShowGithubDetail ? () => onShowGithubDetail(item, k) : undefined} />
                        )}
                        onEdit={() => setFilterEditor({ section: 'prs', index: fi })}
                        onDelete={() => mutateFilters('prs', a => a.filter((_, i) => i !== fi))} />
                    ))}
                  </>
                )
              })()}
            </Section>
          )}

          {/* GITHUB ISSUES */}
          {githubIssues && show('issues') && (
            <Section title="GITHUB ISSUES" brand="github" count={githubIssues.length} defaultOpen={single}
              onRefresh={onRefreshGithub && (() => onRefreshGithub('issues'))}
              refreshing={githubRefreshing === 'issues'}
              onFold={() => setIssuesQuery('')}>
              <div className="sb-gh-search">
                <Icon name="search" size={11} />
                <input type="text" placeholder={t('sb.gh.searchIssues')} value={issuesQuery}
                  onChange={e => setIssuesQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setIssuesQuery('') } }} />
                {/* The filter editor opens from HERE, not the header: it is an
                    action on the list, and the list is what folds (#144). */}
                <button className="sb-gh-filter-btn" title={t('sb.gh.filter.new')}
                  onClick={() => setFilterEditor(f => f?.section === 'issues' ? null : { section: 'issues', index: -1 })}>
                  <Icon name="sliders" size={12} />
                </button>
              </div>
              <GhGroup title={t('sb.gh.group.allIssues')} count={githubIssues.length}>
                {githubIssues.filter(issue => ghMatch(issue, issuesQuery)).map(issue => (
                  <GithubRow key={issue.number} compact item={{ ...issue, kind: 'issue' }}
                    hoverCard={!githubDetailOpen}
                    onOpen={url => onOpenGithubItem?.(url)}
                    onDetail={onShowGithubDetail ? () => onShowGithubDetail(issue, 'issue') : undefined}
                    onCreateBranch={onStartBranchFromIssue
                      ? () => onStartBranchFromIssue({ number: issue.number, title: issue.title, url: issue.url })
                      : undefined} />
                ))}
              </GhGroup>
              {githubRepo && ghFilters.issues.map((f, fi) => (
                <GhFilterGroup key={`${f.name}:${f.query}`} filter={f} kind="issues"
                  repo={githubRepo} refreshOn={githubIssues} t={t}
                  onOpen={url => onOpenGithubItem?.(url)}
                  renderItem={(item, k) => (
                    <GithubRow key={`${k}-${item.number}`} compact item={{ ...item, kind: k }}
                      hoverCard={!githubDetailOpen}
                      onOpen={url => onOpenGithubItem?.(url)}
                      onDetail={onShowGithubDetail ? () => onShowGithubDetail(item, k) : undefined}
                      onCreateBranch={k === 'issue' && onStartBranchFromIssue
                        ? () => onStartBranchFromIssue({ number: item.number, title: item.title, url: item.url })
                        : undefined} />
                  )}
                  onEdit={() => setFilterEditor({ section: 'issues', index: fi })}
                  onDelete={() => mutateFilters('issues', a => a.filter((_, i) => i !== fi))} />
              ))}
            </Section>
          )}

          {/* STASH */}
          {show('stash') && (
          <Section
            title="STASH"
            icon="stash"
            count={stashes.length}
            defaultOpen={single}
            onAdd={e => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setStashMenu({ x: r.left, y: r.bottom + 4 })
            }}
            addLabel={t('sb.stash.create')}
            menuItems={familyMenu('stashes')}
            hiddenCount={stashesHidden ? stashes.length : 0}
            onShowAll={showAll('stashes')}
          >
            {stashes.length === 0
              ? <div className="sb-empty">{t('sb.noStash')}</div>
              : stashes.map(s => (
                  <StashItem
                    key={s.index}
                    stash={s}
                    onApply={() => onApplyStash(s.index)}
                    onPop={() => onPopStash(s.index)}
                    onDrop={() => onDropStash(s.index)}
                    onPreview={onPreviewStash ? () => onPreviewStash(s.index, s.message) : undefined}
                    onRename={() => handleRenameStash(s.index, s.message)}
                    hidden={stashesHidden}
                  />
                ))
            }
          </Section>
          )}

        </div>
      )}

      {stashMenu && (
        <ContextMenu x={stashMenu.x} y={stashMenu.y} items={stashScopeItems}
          onClose={() => setStashMenu(null)} />
      )}

      {/* ── Empty state ── */}
      {!repoPath && (
        <div className="sb-no-repo">
          <button className="sb-open-btn" onClick={onOpenRepo}>{t('sb.openRepo')}</button>
          <button className="sb-open-btn sb-clone-btn" onClick={onClone}>
            <Brand name="github" size={13} />
            {t('sb.clone')}
          </button>
          {recentRepos.length > 0 && (
            <>
              <div className="sb-recents-title">{t('sb.recents')}</div>
              {recentRepos.map(path => (
                <button key={path} className="sb-recent-btn" onClick={() => onSetRepo(path)} title={path}>
                  <Icon name="repo" size={12} />
                  {path.split('/').pop()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
