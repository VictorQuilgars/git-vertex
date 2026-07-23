import React from 'react'
import { useLang } from '../../i18n/LanguageContext'
import './WhatsNew.css'

// Minimal markdown-subset renderer for our own curated release notes:
// ## / ### headings, "- " bullet lists, **bold**, *italic*, `code`.
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) nodes.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else nodes.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderNotes(md: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const lines = md.split('\n')
  let list: React.ReactNode[] | null = null
  let key = 0
  const flush = () => { if (list) { out.push(<ul key={key++} className="wn-list">{list}</ul>); list = null } }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('- ')) { (list ??= []).push(<li key={key++}>{inline(line.slice(2))}</li>); continue }
    flush()
    if (!line.trim()) continue
    if (line.startsWith('### ')) out.push(<h3 key={key++} className="wn-h3">{inline(line.slice(4))}</h3>)
    else if (line.startsWith('## ')) out.push(<h2 key={key++} className="wn-h2">{inline(line.slice(3))}</h2>)
    else out.push(<p key={key++} className="wn-p">{inline(line)}</p>)
  }
  flush()
  return out
}

export default function WhatsNew({ version, notes }: { version: string; notes: string }) {
  const { t } = useLang()
  const releaseUrl = `https://github.com/VictorQuilgars/git-vertex/releases/tag/v${version}`
  return (
    <div className="wn">
      <div className="wn-inner">
        <div className="wn-head">
          <h1 className="wn-title">{t('whatsnew.title')}</h1>
          <button className="wn-browser" onClick={() => (window as any).gitAPI?.openExternal?.(releaseUrl)}>
            {t('whatsnew.openInBrowser')}
          </button>
        </div>
        <p className="wn-intro">{t('whatsnew.intro')}</p>
        <div className="wn-badge">Git Vertex v{version}</div>
        <div className="wn-body">{renderNotes(notes)}</div>
      </div>
    </div>
  )
}
