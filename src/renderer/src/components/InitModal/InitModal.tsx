import { useState, useEffect } from 'react'
import './InitModal.css'
import { useLang } from '../../i18n/LanguageContext'

interface Props {
  onClose: () => void
  onCreated: (path: string) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function InitModal({ onClose, onCreated, showToast }: Props) {
  const { t } = useLang()
  const [tab, setTab] = useState<'local' | 'github'>('local')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [branch, setBranch] = useState('main')
  const [gitignore, setGitignore] = useState('')
  const [license, setLicense] = useState('')
  const [lfs, setLfs] = useState(false)
  const [description, setDescription] = useState('')
  const [access, setAccess] = useState<'public' | 'private'>('public')
  const [cloneAfter, setCloneAfter] = useState(true)
  const [creating, setCreating] = useState(false)
  const [templates, setTemplates] = useState<string[]>([])
  const [licenses, setLicenses] = useState<{ key: string; name: string }[]>([])
  const [account, setAccount] = useState<string>('')

  useEffect(() => {
    ;(window.gitAPI as any).listGitignoreTemplates().then((r: any) => setTemplates(r.templates ?? [])).catch(() => {})
    ;(window.gitAPI as any).listLicenses().then((r: any) => setLicenses(r.licenses ?? [])).catch(() => {})
    ;(window.gitAPI as any).githubGetUser?.().then((r: any) => setAccount(r.user?.login ?? '')).catch(() => {})
  }, [])

  const browse = async () => {
    const r = await window.gitAPI.selectDirectory(t('init.chooseLocation'))
    if (r.path) setLocation(r.path)
  }
  const fullPath = location && name ? `${location}/${name}` : location ? `${location}/` : '/'

  const createLocal = async () => {
    if (!name.trim() || !location) return
    setCreating(true)
    const res = await (window.gitAPI as any).initAdvanced({ location, name: name.trim(), branch, gitignore, license, lfs })
    setCreating(false)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    if (res.path) { onCreated(res.path); onClose() }
  }

  const createGithub = async () => {
    if (!name.trim()) return
    setCreating(true)
    const res = await (window.gitAPI as any).githubCreateRepo({
      name: name.trim(), description, private: access === 'private',
      gitignore, license, cloneTo: cloneAfter && location ? location : undefined,
    })
    setCreating(false)
    if (res.error === 'not_authenticated') { showToast(t('init.needAuth'), 'err'); return }
    if (res.error === 'scope') { showToast(t('init.needRepoScope'), 'err'); return }
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    showToast(t('init.created', res.fullName ?? name.trim()) as any)
    if (res.path) { onCreated(res.path); onClose() }
    else onClose()
  }

  const PROVIDERS: { id: 'local' | 'github'; icon: string; label: string }[] = [
    { id: 'local',  icon: '💻', label: t('init.localOnly') },
    { id: 'github', icon: '🐙', label: 'GitHub.com' },
  ]

  return (
    <div className="init-backdrop" onClick={onClose}>
      <div className="init-modal" onClick={e => e.stopPropagation()}>
        <div className="init-head">
          <span className="init-title">{t('init.title')}</span>
          <button className="init-close" onClick={onClose}>✕</button>
        </div>
        <div className="init-body">
          <nav className="init-nav">
            {PROVIDERS.map(p => (
              <button key={p.id} className={`init-nav-item ${tab === p.id ? 'active' : ''}`} onClick={() => setTab(p.id)}>
                <span className="init-nav-icon">{p.icon}</span>{p.label}
              </button>
            ))}
          </nav>

          <div className="init-form">
            <h3 className="init-form-title">{t('init.formTitle')}</h3>

            {tab === 'github' && (
              <div className="init-field">
                <label>{t('init.account')}</label>
                <input className="init-input" value={account} readOnly placeholder={t('init.accountPlaceholder')} />
              </div>
            )}

            <div className="init-field">
              <label>{t('init.name')}</label>
              <input className="init-input" autoFocus value={name} onChange={e => setName(e.target.value)} />
            </div>

            {tab === 'github' && (
              <div className="init-field">
                <label>{t('init.description')}</label>
                <input className="init-input" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            )}

            {tab === 'github' && (
              <div className="init-field">
                <label>{t('init.access')}</label>
                <select className="init-input" value={access} onChange={e => setAccess(e.target.value as any)}>
                  <option value="public">{t('init.public')}</option>
                  <option value="private">{t('init.private')}</option>
                </select>
              </div>
            )}

            {tab === 'github' && (
              <label className="init-check">
                <input type="checkbox" checked={cloneAfter} onChange={e => setCloneAfter(e.target.checked)} />
                {t('init.cloneAfter')}
              </label>
            )}

            {(tab === 'local' || cloneAfter) && (
              <div className="init-field">
                <label>{tab === 'github' ? t('init.whereToClone') : t('init.initIn')}</label>
                <div className="init-row">
                  <input className="init-input" value={location} onChange={e => setLocation(e.target.value)} />
                  <button className="init-browse" onClick={browse}>{t('init.browse')}</button>
                </div>
              </div>
            )}

            {(tab === 'local' || cloneAfter) && (
              <div className="init-field">
                <label>{t('init.fullPath')}</label>
                <div className="init-fullpath">{fullPath}</div>
              </div>
            )}

            <div className="init-field">
              <label>{t('init.defaultBranch')}</label>
              <input className="init-input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
            </div>

            <div className="init-field">
              <label>{t('init.gitignore')}</label>
              <select className="init-input" value={gitignore} onChange={e => setGitignore(e.target.value)}>
                <option value="">{t('init.select')}</option>
                {templates.map(tpl => <option key={tpl} value={tpl}>{tpl}</option>)}
              </select>
            </div>

            <div className="init-field">
              <label>{t('init.license')}</label>
              <select className="init-input" value={license} onChange={e => setLicense(e.target.value)}>
                <option value="">{t('init.select')}</option>
                {licenses.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
              </select>
            </div>

            {tab === 'local' && (
              <label className="init-check">
                <input type="checkbox" checked={lfs} onChange={e => setLfs(e.target.checked)} />
                {t('init.lfs')}
              </label>
            )}

            <div className="init-foot">
              <button
                className="init-create"
                disabled={creating || !name.trim() || (tab === 'local' && !location)}
                onClick={tab === 'local' ? createLocal : createGithub}
              >
                {creating ? t('init.creating') : tab === 'local' ? t('init.createRepo') : t('init.createAndClone')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
