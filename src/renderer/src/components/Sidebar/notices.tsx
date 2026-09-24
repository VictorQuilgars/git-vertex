// What a side bar view shows in place of its list when there is no list to
// show: a load that failed (#277), or a GitHub list with a reason for being
// empty (#292). A sentence, what went wrong when there is something to quote,
// and the one or two things that fix it — never a blank view.
import { Icon } from '../Icon/Icon'
import { Section } from './Section'
import { forgeGap } from './forgeGap'
import type { SidebarState } from './useSidebar'

export interface NoticeAction { label: string; onClick: () => void }

export function SbNotice({ tone, text, detail, actions }: {
  tone: 'err' | 'info'
  text: string
  /** Quoted as it came — git's sentence, or the server's. */
  detail?: string
  actions: NoticeAction[]
}) {
  return (
    <div className={`sb-notice sb-notice--${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <div className="sb-notice-text">
        <Icon name={tone === 'err' ? 'conflict' : 'info'} size={12} />
        <span>{text}</span>
      </div>
      {detail && <code className="sb-notice-detail">{detail}</code>}
      {actions.length > 0 && (
        <div className="sb-notice-actions">
          {actions.map(a => (
            <button key={a.label} type="button" className="sb-notice-btn" onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A list the side bar reads for itself, and its load refused (#277). */
export function LoadError({ error, onRetry, t }: {
  error: string
  onRetry: () => void
  t: SidebarState['t']
}) {
  return <SbNotice tone="err" text={t('sb.load.failed')} detail={error}
    actions={[{ label: t('sb.load.retry'), onClick: onRetry }]} />
}

/**
 * The PULL REQUESTS or GITHUB ISSUES section when there is no list (#292).
 *
 * In the panel the rail has chosen this view, so every reason is said. On the
 * desktop the sections are stacked under everything else: a repository with
 * no GitHub remote has never had them and still does not — only a reason the
 * user can act on for a repository that IS on GitHub earns the room.
 */
export function ForgeGapSection({ s, kind }: { s: SidebarState; kind: 'prs' | 'issues' }) {
  const { t, single, githubErrors, remotes, onOpenSettings, handleAddRemote, onRefreshGithub } = s
  const prs = kind === 'prs'
  const gap = forgeGap(prs ? s.githubPRs : s.githubIssues, githubErrors?.[kind])
  if (!gap || (gap.kind === 'no-remote' && !single)) return null
  const settings: NoticeAction[] = onOpenSettings
    ? [{ label: t('sb.gh.gap.openSettings'), onClick: () => onOpenSettings('github') }] : []
  const addRemote: NoticeAction = { label: t('sb.addRemote'), onClick: () => { void handleAddRemote() } }
  const notice = gap.kind === 'no-token'
    ? <SbNotice tone="info" text={t('sb.gh.gap.noToken', prs)} actions={settings} />
    : gap.kind === 'no-remote'
      ? remotes.length === 0
        ? <SbNotice tone="info" text={t('sb.gh.gap.noRemote', prs)} actions={[addRemote]} />
        // A remote on a server nothing has named as a GitHub: naming it is
        // the fix as often as adding one, so both doors are offered.
        : <SbNotice tone="info" text={t('sb.gh.gap.noGithubRemote', prs)} actions={[...settings, addRemote]} />
      : <SbNotice tone="err" text={t('sb.gh.gap.error', prs)} detail={gap.message}
          actions={onRefreshGithub ? [{ label: t('sb.load.retry'), onClick: () => onRefreshGithub(kind) }] : []} />
  return prs
    ? <Section id="prs" title="PULL REQUESTS" icon="pullRequest">{notice}</Section>
    : <Section id="issues" title="GITHUB ISSUES" brand="github">{notice}</Section>
}
