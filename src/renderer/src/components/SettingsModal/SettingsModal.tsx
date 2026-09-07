// The settings page: a header, a nav with a search box, and one section at a time.
// Its state is useSettingsPage, its sections are in ./sections, and what they share is in ./shared.
import { Icon } from '../Icon/Icon'
import { type SettingsModalProps } from './shared'
import { useSettingsPage } from './useSettingsPage'
import { GitSection } from './sections/GitSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { GraphSection } from './sections/GraphSection'
import { GithubSection } from './sections/GithubSection'
import { AiSection } from './sections/AiSection'
import { BehaviorSection } from './sections/BehaviorSection'
import { ExternalToolsSection } from './sections/ExternalToolsSection'
import { SshSection } from './sections/SshSection'
import { AboutSection } from './sections/AboutSection'
import './SettingsModal.css'

export default function SettingsModal(props: SettingsModalProps) {
  const page = useSettingsPage(props)
  const { t, settings, section, setSection, navQuery, setNavQuery, navGroups, onClose } = page
  return (
    <div className="stg-page">
      {/* Header */}
      <div className="stg-header">
        <button className="stg-back" onClick={onClose} title={t('settings.back')}>
          <Icon name="chevronLeft" />
          {t('settings.back')}
        </button>
        <span className="stg-title">{t('settings.title')}</span>
      </div>

      <div className="stg-body">
        {/* Left nav — grouped */}
        <nav className="stg-nav">
          <div className="stg-nav-search">
            <Icon name="search" size={12} />
            <input
              type="search"
              value={navQuery}
              placeholder={t('settings.search')}
              aria-label={t('settings.search')}
              onChange={e => setNavQuery(e.target.value)}
              spellCheck={false}
            />
          </div>
          {navGroups.length === 0 && <div className="stg-nav-empty">{t('settings.searchNone')}</div>}
          {navGroups.map(grp => (
            <div key={grp.group} className="stg-nav-group">
              <div className="stg-nav-group-label">{t(grp.group as any)}</div>
              {grp.items.map(item => (
                <button
                  key={item.id}
                  className={`stg-nav-item ${section === item.id ? 'active' : ''}`}
                  data-section={item.id}
                  onClick={() => setSection(item.id)}
                >
                  <span className="stg-nav-icon">{item.icon}</span>
                  <span>{t(item.label as any)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

          {/* Content */}
          {/* Appearance is the one pane that is not a column of fields. The
              600px reading measure is right for prose and inputs and wrong for
              a grid of theme tiles — it left two thirds of the window empty
              and made the tiles smaller than they need to be. */}
          <div className={`stg-content ${section === 'appearance' || section === 'ai' ? 'stg-content--wide' : ''} ${section === 'ai' ? 'stg-content--ai' : ''}`}>

            {/* ── Git ── */}
            {section === 'git' && <GitSection page={page} />}

            {/* ── Apparence ── */}
            {section === 'appearance' && <AppearanceSection page={page} />}

            {/* ── Graphe de commits ── */}
            {section === 'graph' && <GraphSection page={page} />}

            {/* ── GitHub ── */}
            {section === 'github' && <GithubSection page={page} />}

            {/* ── AI ── */}
            {section === 'ai' && <AiSection page={page} />}
            {/* ── Notifications ── */}
            {section === 'notifications' && <BehaviorSection page={page} />}

            {/* ── Outils externes (v1.20.0) ── */}
            {section === 'externalTools' && <ExternalToolsSection page={page} />}

            {/* ── SSH (v1.20.0) ── */}
            {section === 'ssh' && <SshSection page={page} />}

            {/* ── About ── */}
            {section === 'about' && <AboutSection page={page} />}

          </div>
        </div>
      </div>
  )
}
