// The shapes the sidebar is given: its entries, and every prop of the panel.
import { BranchInfo, StashScope } from '../../types'
import type { PRIntent } from '../ContextMenu/prIntent'
import { type GraphVisibility, type RefFamily } from '../../utils/graphVisibility'
import { type IssueRef as LinkedIssueRef } from '../../utils/issueRef'

export interface StashEntry { index: number; message: string }

export interface TagEntry   { name: string; hash: string }

// Single-view mode (VS Code panel): the rail on the left selects which one of
// these views the resizable side-panel shows. When `view` is undefined the
// Sidebar renders its classic stacked layout (desktop app).
export type SidebarView =
  | 'overview' | 'worktrees' | 'branches' | 'remotes' | 'stash' | 'tags'
  | 'prs' | 'issues'
  /**
   * What the model does in this repository: what it has written, and what is
   * running. It was two rail entries — an `agents` one and an `ai` one, both
   * wearing a robot head — and they are one.
   */
  | 'ai'

export interface ReflogEntry { hash: string; ref: string; message: string; date: string }

/**
 * Where a row's subject went.
 *
 * `live` its ref still resolves · `landed` the ref is gone but the commits are
 * in another one · `lost` the commits themselves are unreachable. Only the
 * third is a strike-through: a branch that merged and was pruned reached the
 * ordinary, successful end of a branch, and striking it out on that day said
 * the opposite of what happened.
 */
export type SubjectState = 'live' | 'landed' | 'lost'

/** A changelog this repository has had written — the shape the host returns. */
export interface ChangelogEntry {
  branch: string; text: string; base: string
  commits: number; at: number; newCommits: number
  subject?: SubjectState; landedIn?: string; hashes?: string[]
}

/** A kept reading of a branch, a stash or the working tree. */
export interface NoteEntry {
  kind: 'branch' | 'stash' | 'working'
  key: string; title: string; text: string; at: number; sha: string
  newCommits: number
  subject?: SubjectState; landedIn?: string; hashes?: string[]
}

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

export interface RemoteEntry { name: string; fetchUrl: string; pushUrl: string }

export interface SubmoduleEntry { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }

export interface WorktreeEntry { path: string; branch: string; head: string; isMain: boolean; locked: boolean }

export interface AgentEntry { pid: number; name: string; cwd: string }

export interface SidebarProps {
  repoPath: string | null
  repoName: string
  /**
   * The working changes as a destination. The graph's //WIP row is the way to
   * them, and it is there only while the tree is dirty, under a name nobody
   * new would look for: this row is always there and says what it is. Absent
   * onViewWip ⇒ no row — the panel's rail already has one.
   */
  wipCount?: number
  wipSelected?: boolean
  onViewWip?: () => void
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
  /** Reads the stash aloud (#70 P1). Absent ⇒ no row, the menu's rule. */
  onExplainStash?: (index: number, message: string) => void
  /** The same, for a branch — and the changelog of what it carries (#70 P1). */
  onExplainBranch?: (name: string) => void
  onBranchChangelog?: (name: string) => void
  /**
   * The AI tab's two ways back in: a stored changelog, and a commit whose
   * explanation is already written. Absent ⇒ the row is not clickable, the
   * panel's rule — and on the desktop the tab itself does not appear.
   */
  onOpenChangelog?: (branch: string) => void
  onOpenExplanation?: (hash: string) => void
  /** A kept reading — the drawer reopens it without asking the model again. */
  onOpenNote?: (note: { kind: 'branch' | 'stash' | 'working'; key: string; title: string }) => void
  /** Point the graph at a set of commits — what a reading covered (#70). */
  onShowCommits?: (hashes: string[]) => void
  /**
   * Which of the two stacks is showing, held by the host: generating a
   * changelog anywhere in the app brings this one into view, and it cannot do
   * that if the state lives in here.
   */
  tab?: 'list' | 'ai'
  onTab?: (tab: 'list' | 'ai') => void
  /** Bumped when something was written — the lists re-read themselves. */
  memoryToken?: number
  /** What a stored explanation is about — the commit's subject, if loaded. */
  subjectFor?: (hash: string) => string | undefined
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
  /**
   * The header's `+` on PULL REQUESTS — opens the composer, prefilled with
   * the request the checked-out branch proposes when the rules have one, and
   * with where you stand when they do not: the composer's four ends are
   * choosable, so the door stays open even where a single pair would not
   * (default branch, or the pair's request already open). Absent only when
   * there is no GitHub to compose against.
   */
  onStartPR?: () => void
  /** The header's `+` on GITHUB ISSUES — the host's own new-issue form; the
   *  app has no composer for one. */
  onNewIssue?: () => void
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
  // Single-view mode: render only the section the activity rail selected.
  // Undefined = classic stacked layout (desktop).
  view?: SidebarView
}
