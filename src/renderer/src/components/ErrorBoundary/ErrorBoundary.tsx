import React from 'react'
import { useLang } from '../../i18n/LanguageContext'
import './ErrorBoundary.css'

// A view that throws during render used to take the whole window with it: a
// white page, and everything — the other tabs, the sidebar, the toolbar —
// gone with the one pane that failed. Each major pane is fenced now: the one
// that failed says so and offers to try again; the rest keeps working.

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[view]', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return <ViewFailed error={this.state.error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

function ViewFailed({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useLang()
  return (
    <div className="view-failed" role="alert">
      <div className="view-failed-title">{t('view.failed')}</div>
      <code className="view-failed-error">{error.message || String(error)}</code>
      <button className="view-failed-retry" onClick={onRetry}>{t('common.retry')}</button>
    </div>
  )
}
