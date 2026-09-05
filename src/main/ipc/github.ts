// github:* and avatar:* — the GitHub integration.
import { handle } from './handle'
import { ipcMain, dialog } from 'electron'
import { join } from 'path'
import { gitBinary, makeSimpleGit } from '../git-service'
import { startOAuthFlow } from '../github-auth'
import { githubRepo } from '../../renderer/src/utils/remoteUrl'
import { join as pathJoin } from 'path'
import { openRepoAt } from '../repo-session'
import { state } from '../app-state'
import { readSettings, writeSettings } from '../settings-store'
import { ghApi, detectGithubRepo, avatarCache, githubIdenticonUrl, loadAuthedUserEmails, conditionalGet, prBlockedSupplement, searchCache } from '../github-client'



export function registerGithubHandlers(): void {
  handle('github:list-gitignore-templates', async () => {
    try {
      const api = await ghApi()
      const token = api.token
      const r = await fetch(`${api.base}/gitignore/templates`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      return r.ok ? { templates: await r.json() } : { templates: [] }
    } catch { return { templates: [] } }
  })

  handle('github:list-licenses', async () => {
    try {
      const api = await ghApi()
      const token = api.token
      const r = await fetch(`${api.base}/licenses`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!r.ok) return { licenses: [] }
      const d = await r.json() as any[]
      return { licenses: d.map(l => ({ key: l.key, name: l.name })) }
    } catch { return { licenses: [] } }
  })

  // Init on GitHub.com: create the remote repo, optionally clone
  // it to a chosen local folder.
  handle('github:create-repo', async (_e, opts: { name: string; description?: string; private?: boolean; gitignore?: string; license?: string; cloneTo?: string }) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const r = await fetch(`${api.base}/user/repos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          name: opts.name,
          description: opts.description || '',
          private: !!opts.private,
          auto_init: true,
          gitignore_template: opts.gitignore || undefined,
          license_template: opts.license || undefined,
        }),
      })
      if (r.status === 403 || r.status === 404) return { error: 'scope' }
      if (!r.ok) { const e = await r.json().catch(() => ({})) as any; return { error: e.message || `HTTP ${r.status}` } }
      const d = await r.json() as any
      if (opts.cloneTo) {
        const target = join(opts.cloneTo, opts.name)
        try {
          // Clone over HTTPS with the token so private repos work.
          const authUrl = d.clone_url.replace('https://', `https://${token}@`)
          await makeSimpleGit().clone(authUrl, target)
          // Rewrite origin without the embedded token.
          await makeSimpleGit(target).remote(['set-url', 'origin', d.clone_url])
          const opened = await openRepoAt(target)
          return { ...opened, htmlUrl: d.html_url, fullName: d.full_name }
        } catch (e: any) { return { error: e.message, htmlUrl: d.html_url } }
      }
      return { htmlUrl: d.html_url, fullName: d.full_name }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:start-auth', () => {
    startOAuthFlow()
  })

  handle('github:disconnect', () => {
    const s = readSettings()
    delete s.githubToken
    writeSettings(s)
    return { success: true }
  })

  handle('github:get-token', () => {
    return { token: readSettings().githubToken ?? null }
  })

  handle('avatar:resolve', async (_e, email: string, sha?: string) => {
    const key = email.trim().toLowerCase()
    if (avatarCache.has(key)) return avatarCache.get(key)!

    // GitHub noreply emails encode the user directly — resolve deterministically.
    // `{id}+{login}@users.noreply.github.com` → avatar by user id (covers Copilot
    // and any human hiding their email). Older `{login}@...` form needs a lookup.
    const noreply = key.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/)
    const api = await ghApi()
    const token = api.token
    if (noreply) {
      const [, id, login] = noreply
      if (id) {
        const url = `https://avatars.githubusercontent.com/u/${id}?v=4`
        avatarCache.set(key, url)
        return url
      }
      if (token) {
        try {
          const res = await fetch(`${api.base}/users/${login}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          })
          if (res.ok) {
            const d: any = await res.json()
            if (d?.avatar_url) { avatarCache.set(key, d.avatar_url); return d.avatar_url }
          }
        } catch { /* ignore */ }
      }
    }

    if (token) {
      // First: resolve via the authenticated user's own email list. Works for the
      // logged-in user's commits even when unpushed or using a private email.
      await loadAuthedUserEmails(api.base, token)
      if (avatarCache.has(key)) return avatarCache.get(key)!

      // Next: the commits API. GitHub resolves the commit's author to a real user
      // account regardless of whether the email is public, and gives back
      // avatar_url for both the author and committer. We cache by email so every
      // distinct contributor is resolved at most once.
      if (sha) {
        const repo = await detectGithubRepo()
        if (repo) {
          try {
            const res = await fetch(
              `${api.base}/repos/${repo.owner}/${repo.repo}/commits/${sha}`,
              { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
            )
            if (res.ok) {
              const data: any = await res.json()
              const pairs: [string | undefined, string | undefined][] = [
                [data?.commit?.author?.email, data?.author?.avatar_url],
                [data?.commit?.committer?.email, data?.committer?.avatar_url],
              ]
              for (const [e, url] of pairs) {
                if (e && url) avatarCache.set(e.trim().toLowerCase(), url)
              }
              if (avatarCache.has(key)) return avatarCache.get(key)!
            }
          } catch { /* ignore network errors */ }
        }
      }

      // Fallback: search the user by public email.
      try {
        const res = await fetch(
          `${api.base}/search/users?q=${encodeURIComponent(key)}+in:email&per_page=1`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
        )
        if (res.ok) {
          const data: any = await res.json()
          const url: string | undefined = data?.items?.[0]?.avatar_url
          if (url) { avatarCache.set(key, url); return url }
        }
      } catch { /* ignore network errors */ }
    }

    // Last resort: GitHub identicon (colorful, matches github.com style).
    const url = githubIdenticonUrl(key)
    avatarCache.set(key, url)
    return url
  })

  handle('github:detect-repo', async () => {
    if (!state.gitService) return { owner: null, repo: null }
    try {
      const remotes = await (state.gitService as any).git.getRemotes(true)
      const origin = remotes.find((r: any) => r.name === 'origin') ?? remotes[0]
      if (!origin) return { owner: null, repo: null }
      // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git,
      // and the shapes the hand-written pattern used to get wrong: a dot in the
      // repository name, an ssh port, credentials in the URL.
      return githubRepo(origin.refs?.fetch ?? origin.refs?.push ?? '')
    } catch { return { owner: null, repo: null } }
  })

  // Same GitHub-remote detection, but for an arbitrary local path (cross-repo
  // Launchpad: recent repos other than the currently-open one).
  handle('github:detect-repo-at', async (_e, repoPath: string) => {
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const exec = promisify(execFile)
      const r = await exec(gitBinary(), ['-C', repoPath, 'remote', 'get-url', 'origin'])
      return githubRepo(r.stdout.trim())
    } catch { return { owner: null, repo: null } }
  })

  handle('github:list-prs', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      return await conditionalGet(
        `prs:${api.base}:${owner}/${repo}`,
        `${api.base}/repos/${owner}/${repo}/pulls?per_page=50&state=open`,
        token,
        (data: any[]) => ({
        prs: data.map(pr => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          author: pr.user?.login ?? '',
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          comments: pr.comments + pr.review_comments,
          labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          body: pr.body ?? '',
          assignees: (pr.assignees ?? []).map((a: any) => a.login),
          reviewers: (pr.requested_reviewers ?? []).map((r: any) => r.login),
          url: pr.html_url,
          headRef: pr.head?.ref ?? '',
          baseRef: pr.base?.ref ?? '',
        }))
        }),
      )
    } catch (e: any) { return { error: e.message } }
  })

  // Cloud Patches, the zero-server way: the commit's patch goes into a SECRET
  // gist under the user's own account and the shareable URL comes back.
  // Secret gists are unlisted (anyone with the link can read) — good enough
  // for "feedback before the PR", and revocable by deleting the gist.
  handle('github:share-patch', async (_e, hash: string) => {
    if (!state.gitService) return { error: 'No repo open' }
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    const patchRes = await state.gitService.createPatch(hash)
    if ((patchRes as any).error) return { error: (patchRes as any).error }
    try {
      const short = hash.slice(0, 7)
      let subject = short
      try {
        subject = (await (state.gitService as any).git.raw(['log', '-1', '--pretty=format:%s', hash])).trim() || short
      } catch { /* subject is cosmetic */ }
      const res = await fetch(`${api.base}/gists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          description: `git-vertex patch — ${short}: ${subject}`,
          public: false,
          files: { [`${short}.patch`]: { content: patchRes.patch } },
        }),
      })
      // 404 on the gists endpoint almost always means the token lacks the `gist`
      // scope (GitHub hides it rather than 403) — tell the user to reconnect.
      if (res.status === 404) return { error: 'gist_scope' }
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { url: data.html_url }
    } catch (e: any) { return { error: e.message } }
  })

  // ── The PR detail (#110 §2): the request itself, and its checks ─────────────
  // Two reads, mirrored in the extension host. The PR endpoint is the one that
  // knows mergeability; the checks are a second call because GitHub keys them
  // by ref, not by request. No write here — merging from the panel is #73's.

  handle('github:get-pr', async (_e, owner: string, repo: string, number: number) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      // Conditional, because the detail pane re-asks while you watch it (#141):
      // a 304 costs no rate limit, and the cached body already carries the
      // GraphQL supplement below, so an unchanged request costs one free call
      // instead of three paid ones.
      return await conditionalGet(
        `pr:${api.base}:${owner}/${repo}#${number}`,
        `${api.base}/repos/${owner}/${repo}/pulls/${number}`,
        token,
        async (pr: any) => ({
        pr: {
          number: pr.number,
          title: pr.title,
          state: pr.state,                       // open | closed
          merged: !!pr.merged,
          draft: !!pr.draft,
          author: pr.user?.login ?? '',
          createdAt: pr.created_at,
          body: pr.body ?? '',
          headRef: pr.head?.ref ?? '',
          headSha: pr.head?.sha ?? '',
          baseRef: pr.base?.ref ?? '',
          commits: pr.commits ?? 0,
          changedFiles: pr.changed_files ?? 0,
          additions: pr.additions ?? 0,
          deletions: pr.deletions ?? 0,
          // null while GitHub is still computing — the UI says "computing",
          // it does not guess.
          mergeable: pr.mergeable,
          mergeableState: pr.mergeable_state ?? '',
          labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          assignees: (pr.assignees ?? []).map((a: any) => a.login),
          reviewers: (pr.requested_reviewers ?? []).map((r: any) => r.login),
          url: pr.html_url,
          ...(await prBlockedSupplement(api, token, owner, repo, number,
            { blocked: pr.mergeable_state === 'blocked', baseRef: pr.base?.ref ?? '' })),
        },
        }),
      )
    } catch (e: any) { return { error: e.message } }
  })

  // The one write of #110's pane, #73's P2: merge the request. GitHub is the
  // judge — branch protections, required checks and the rest answer here, so
  // the UI's own gating is a courtesy, not the authority.
  //
  // ⚠️ GraphQL, not REST — measured on this very repository. The REST merge
  // refuses a review-blocked request even for an actor the ruleset lists as
  // a bypasser (405, "review is required"); the GraphQL mergePullRequest
  // mutation applies the bypass — it is what `gh pr merge --admin` calls,
  // and what the ruleset's own semantics promise a bypass actor. The node id
  // the mutation needs rides the same lookup that confirms the request.
  handle('github:merge-pr', async (_e, owner: string, repo: string, number: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge') => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const prRes = await fetch(`${api.base}/repos/${owner}/${repo}/pulls/${number}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!prRes.ok) return { error: `HTTP ${prRes.status}` }
      const nodeId = ((await prRes.json()) as any).node_id
      // GraphQL lives at the api host's /graphql — on GHES that is the same
      // base with /api/v3 swapped for /api/graphql.
      const gqlUrl = api.base.endsWith('/api/v3')
        ? api.base.replace(/\/api\/v3$/, '/api/graphql')
        : `${api.base}/graphql`
      const res = await fetch(gqlUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          query: 'mutation($id: ID!, $method: PullRequestMergeMethod!) { mergePullRequest(input: {pullRequestId: $id, mergeMethod: $method}) { pullRequest { merged } } }',
          variables: { id: nodeId, method: method.toUpperCase() },
        }),
      })
      const data = await res.json().catch(() => ({})) as any
      const gqlError = data?.errors?.[0]?.message
      if (!res.ok || gqlError) return { error: gqlError ?? `HTTP ${res.status}` }
      searchCache.clear()
      return { success: true }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:get-checks', async (_e, owner: string, repo: string, ref: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      return await conditionalGet(
        `checks:${api.base}:${owner}/${repo}@${ref}`,
        `${api.base}/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`,
        token,
        (data: any) => {
          const runs = (data.check_runs ?? []) as any[]
          const failed = runs.filter(r => r.conclusion && !['success', 'neutral', 'skipped'].includes(r.conclusion)).length
          const pending = runs.filter(r => r.status !== 'completed').length
          return {
            checks: {
              total: runs.length,
              passed: runs.length - failed - pending,
              failed,
              pending,
            },
          }
        },
      )
    } catch (e: any) { return { error: e.message } }
  })

  // ── The issue detail (§3 bis): its reads and its writes ────────────────────
  // Five endpoints, each mirrored in the extension host — a method the panel
  // can reach but a host cannot answer is the dead-button class the parity
  // test exists to catch.

  handle('github:issue-comments', async (_e, owner: string, repo: string, number: number) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      return await conditionalGet(
        `comments:${api.base}:${owner}/${repo}#${number}`,
        `${api.base}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
        token,
        (data: any[]) => ({
          comments: data.map(c => ({
            author: c.user?.login ?? '',
            createdAt: c.created_at,
            body: c.body ?? '',
          })),
        }),
      )
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:add-issue-comment', async (_e, owner: string, repo: string, number: number, body: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${number}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      return { success: true }
    } catch (e: any) { return { error: e.message } }
  })

  // One PATCH for every field the detail edits — title, body, state (which is
  // how reopen exists without a second verb), assignees, labels. Only the keys
  // present are sent, so a title edit does not rewrite the labels.
  handle('github:update-issue', async (_e, owner: string, repo: string, number: number,
    patch: { title?: string; body?: string; state?: 'open' | 'closed'; assignees?: string[]; labels?: string[] }) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${number}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      searchCache.clear()
      return { success: true }
    } catch (e: any) { return { error: e.message } }
  })

  // Review is asked for AFTER creation — the create endpoint does not take
  // reviewers, so the composer makes two calls and says so when the second
  // fails (#130): a request that exists with nobody asked is not a rollback
  // case, it is a fact to report.
  handle('github:request-reviewers', async (_e, owner: string, repo: string, number: number, reviewers: string[]) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reviewers }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as any
        return { error: data.message ?? `HTTP ${res.status}` }
      }
      return { success: true }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:list-assignees', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/assignees?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any[]
      return { assignees: data.map(a => a.login) }
    } catch (e: any) { return { error: e.message } }
  })

  // The issue composer (#95's sibling surface): one POST carries title, body,
  // labels and assignees together — unlike a pull request, an issue's create
  // endpoint takes its staffing. Without push access GitHub silently ignores
  // the labels and assignees rather than refusing, which is the right degrade.
  handle('github:create-issue', async (_e, owner: string, repo: string, title: string, body: string, labels: string[], assignees: string[]) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: labels ?? [], assignees: assignees ?? [] }),
      })
      const data = await res.json() as any
      if (!res.ok) {
        const detail = Array.isArray(data.errors)
          ? data.errors
              .map((e: any) => e.message ?? (e.field ? `${e.field}: ${e.code}` : null))
              .filter(Boolean)
              .join(' — ')
          : ''
        const msg = data.message ?? `HTTP ${res.status}`
        return { error: detail ? `${msg} (${detail})` : msg }
      }
      return { url: data.html_url, number: data.number }
    } catch (e: any) { return { error: e.message } }
  })

  // The composer's label picker can CREATE a label that does not exist yet
  // (#130). Explicit — a POST with a colour we chose — rather than leaning on
  // any endpoint's implicit auto-creation, so the write is announced, the
  // colour is deterministic, and a refusal has one place to surface.
  handle('github:create-label', async (_e, owner: string, repo: string, name: string, color: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, color }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) {
        const detail = Array.isArray(data.errors)
          ? data.errors.map((e: any) => e.code ?? e.message).filter(Boolean).join(' — ')
          : ''
        const msg = data.message ?? `HTTP ${res.status}`
        return { error: detail ? `${msg} (${detail})` : msg }
      }
      return { label: { name: data.name, color: data.color } }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:list-repo-labels', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/labels?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any[]
      return { labels: data.map(l => ({ name: l.name, color: l.color })) }
    } catch (e: any) { return { error: e.message } }
  })

  // Launchpad "Mark as closed": close an issue or PR. GitHub's issues endpoint
  // closes both. Invalidates the search cache so the next refresh drops it.
  handle('github:close-issue', async (_e, owner: string, repo: string, number: number) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${number}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ state: 'closed' }),
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      searchCache.clear()
      return { success: true }
    } catch (e: any) { return { error: e.message } }
  })

  // Launchpad WIP "Create cloud patch": the working-tree diff of a local repo
  // (uncommitted, tracked changes vs HEAD) goes to a secret gist; the link comes
  // back. Zero-server, revocable by deleting the gist.
  handle('github:share-wip-patch', async (_e, repoPath: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const exec = promisify(execFile)
      const diff = await exec(gitBinary(), ['-C', repoPath, 'diff', 'HEAD'], { maxBuffer: 20 * 1024 * 1024 })
      const patch = diff.stdout
      if (!patch.trim()) return { error: 'no_changes' }
      const name = repoPath.split('/').pop() || 'wip'
      const res = await fetch(`${api.base}/gists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          description: `git-vertex WIP patch — ${name}`,
          public: false,
          files: { [`${name}-wip.patch`]: { content: patch } },
        }),
      })
      // 404 on the gists endpoint almost always means the token lacks the `gist`
      // scope (GitHub hides it rather than 403) — tell the user to reconnect.
      if (res.status === 404) return { error: 'gist_scope' }
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { url: data.html_url }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:list-issues', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      return await conditionalGet(
        `issues:${api.base}:${owner}/${repo}`,
        `${api.base}/repos/${owner}/${repo}/issues?per_page=50&state=open&pulls=false`,
        token,
        (data: any[]) => ({
        // GitHub issues endpoint also returns PRs — filter them out
        issues: data.filter((i: any) => !i.pull_request).map((issue: any) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          author: issue.user?.login ?? '',
          createdAt: issue.created_at,
          comments: issue.comments,
          labels: (issue.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          body: issue.body ?? '',
          assignees: (issue.assignees ?? []).map((a: any) => a.login),
          url: issue.html_url,
        }))
        }),
      )
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:search-issues', async (_e, q: string, force?: boolean) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    const hit = searchCache.get(q)
    if (!force && hit && Date.now() - hit.ts < 20_000) return hit.data
    try {
      const res = await fetch(
        `${api.base}/search/issues?q=${encodeURIComponent(q)}&per_page=50&sort=updated`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
      )
      if (res.status === 403 || res.status === 429) {
        // Secondary/primary rate limit — tell the renderer how long to wait.
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000
        const secs = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60
        return { error: 'rate_limited', retryIn: secs }
      }
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any
      const result = {
        total: data.total_count ?? 0,
        items: (data.items ?? []).map((x: any) => {
          const repo = (x.repository_url ?? '').split('/').slice(-2).join('/')
          return {
            type: x.pull_request ? 'pr' : 'issue',
            number: x.number,
            title: x.title,
            draft: x.draft ?? false,
            author: x.user?.login ?? '',
            authorAvatar: x.user?.avatar_url ?? '',
            createdAt: x.created_at,
            updatedAt: x.updated_at,
            comments: x.comments ?? 0,
            labels: (x.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
            body: x.body ?? '',
            url: x.html_url,
            repo,                          // owner/repo
            repoUrl: `https://github.com/${repo}`,
          }
        }),
      }
      searchCache.set(q, { ts: Date.now(), data: result })
      return result
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:get-issue', async (_e, owner: string, repo: string, number: number) => {
    const api = await ghApi()
    const token = api.token
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      // The issues endpoint resolves both issues and PRs by number
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${number}`, { headers })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const d = await res.json() as any
      return {
        issue: {
          number: d.number,
          title: d.title,
          state: d.state,
          isPR: !!d.pull_request,
          merged: d.pull_request?.merged_at != null,
          url: d.html_url,
          // What the hover card renders (#95 §3): the `#123` reference shows
          // the same card as a sidebar row, so it needs the same material.
          body: d.body ?? '',
          labels: (d.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          assignees: (d.assignees ?? []).map((a: any) => a.login),
          author: d.user?.login,
          draft: !!d.draft,
        }
      }
    } catch (e: any) { return { error: e.message } }
  })

  // `head` crosses repositories as `owner:branch` — the fork case (#130). GitHub
  // reads the bare form as "this repository's branch", so same-repo callers
  // change nothing.
  handle('github:create-pr', async (_e, owner: string, repo: string, title: string, body: string, head: string, base: string, draft?: boolean) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        // A refused `draft` (plan without draft PRs) comes back through the
        // errors array below, named — not swallowed.
        body: JSON.stringify({ title, body, head, base, draft: !!draft }),
      })
      const data = await res.json() as any
      if (!res.ok) {
        // A rejected PR comes back as a bare "Validation Failed"; everything that
        // tells you what to fix ("No commits between main and x", an unpublished
        // head branch) is in the errors array. Surface that instead.
        const detail = Array.isArray(data.errors)
          ? data.errors
              .map((e: any) => e.message ?? (e.field ? `${e.field}: ${e.code}` : null))
              .filter(Boolean)
              .join(' — ')
          : ''
        const msg = data.message ?? `HTTP ${res.status}`
        return { error: detail ? `${msg} (${detail})` : msg }
      }
      return { url: data.html_url, number: data.number }
    } catch (e: any) { return { error: e.message } }
  })

  // A fork's pull request usually lands on its parent — a repository the
  // /user/repos listing has no reason to hold. One lookup so the composer can
  // offer it as a target (#130); every failure reads as "not a fork", because
  // a composer that cannot ask this question still composes.
  handle('github:repo-parent', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { parent: null }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) return { parent: null }
      const data = await res.json() as any
      return data.fork && data.parent
        ? {
            parent: {
              owner: data.parent.owner.login,
              repo: data.parent.name,
              defaultBranch: data.parent.default_branch ?? null,
            }
          }
        : { parent: null }
    } catch { return { parent: null } }
  })

  handle('github:list-branches', async (_e, owner: string, repo: string) => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { branches: [] }
    try {
      const res = await fetch(`${api.base}/repos/${owner}/${repo}/branches?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) return { branches: [] }
      const data = await res.json() as any[]
      return { branches: data.map((b: any) => b.name) }
    } catch { return { branches: [] } }
  })

  handle('github:list-repos', async () => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { error: 'not_authenticated' }
    try {
      let repos: any[] = []
      let page = 1
      while (true) {
        const res = await fetch(
          `${api.base}/user/repos?per_page=100&sort=updated&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
        )
        if (!res.ok) return { error: `HTTP ${res.status}` }
        const batch = await res.json() as any[]
        repos = repos.concat(batch)
        if (batch.length < 100) break
        page++
      }
      return {
        repos: repos.map(r => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          description: r.description ?? '',
          private: r.private,
          language: r.language ?? null,
          stars: r.stargazers_count,
          updatedAt: r.updated_at,
          cloneUrl: r.clone_url,
          sshUrl: r.ssh_url,
          // The composer picks a target repository's base from this (#130).
          defaultBranch: r.default_branch ?? null,
        }))
      }
    } catch (e: any) { return { error: e.message } }
  })

  handle('github:clone', async (_e, cloneUrl: string, repoName: string) => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: `Choose where to clone "${repoName}"`
    })
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true }
    const parentDir = result.filePaths[0]
    const targetPath = pathJoin(parentDir, repoName)
    try {
      const sg = makeSimpleGit()
      await sg.clone(cloneUrl, targetPath)
      return openRepoAt(targetPath)
    } catch (e: any) {
      return { error: e.message }
    }
  })

  handle('github:get-user', async () => {
    const api = await ghApi()
    const token = api.token
    if (!token) return { user: null }
    try {
      const res = await fetch(`${api.base}/user`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) return { user: null }
      const user = await res.json() as { login: string; avatar_url: string }

      // Fetch avatar as base64 to avoid CSP issues in renderer
      let avatar = ''
      try {
        const imgRes = await fetch(user.avatar_url)
        const contentType = imgRes.headers.get('content-type') ?? 'image/png'
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        avatar = `data:${contentType};base64,${buffer.toString('base64')}`
      } catch { /* avatar stays empty */ }

      return { user: { login: user.login, avatar } }
    } catch { return { user: null } }
  })
}
