import React from 'react'

/**
 * A deliberately small markdown renderer for GitHub-authored bodies — issue
 * and pull-request descriptions in the hover card.
 *
 * Everything is built as React nodes, never `dangerouslySetInnerHTML`: the
 * input is whatever anyone typed into a public issue, and escaping is React's
 * default, not something this file has to remember to do. What it does not
 * recognise it prints as the text it was — a table or a raw HTML tag reads as
 * its source, which is honest, rather than half-rendered.
 *
 * Covered, because issue bodies actually use them: `#`–`####` headings,
 * bullet and numbered lists, `- [ ]` / `- [x]` task items (rendered as the
 * disabled checkboxes GitHub shows), fenced code blocks, inline `code`,
 * **bold**, *italic*, and [links](…) — links go through the handler the card
 * provides, since a webview must not navigate itself.
 */

type OpenLink = (url: string) => void

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/

function inline(text: string, openLink: OpenLink | undefined, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null, k = 0
  // A fresh regex per call: inline() recurses for bold and italic, and a
  // shared /g regex carries its lastIndex across those calls — the outer
  // loop then re-matches the span it just consumed, forever. That froze a
  // real renderer before any test saw it.
  const rx = new RegExp(INLINE.source, 'g')
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${k++}`
    if (tok.startsWith('`')) out.push(<code key={key}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('**')) out.push(<strong key={key}>{inline(tok.slice(2, -2), openLink, key)}</strong>)
    else if (tok.startsWith('*')) out.push(<em key={key}>{inline(tok.slice(1, -1), openLink, key)}</em>)
    else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!
      const url = lm[2]
      out.push(
        <a key={key} className="mdl-link"
          onClick={e => { e.preventDefault(); e.stopPropagation(); openLink?.(url) }}>
          {lm[1]}
        </a>
      )
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface Block { kind: 'h' | 'p' | 'li' | 'code'; depth?: number; checked?: boolean | null; text: string }

function parse(md: string): Block[] {
  const blocks: Block[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence (or EOF)
      blocks.push({ kind: 'code', text: buf.join('\n') })
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) { blocks.push({ kind: 'h', depth: h[1].length, text: h[2] }); i++; continue }
    const li = /^\s*(?:[-*]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line)
    if (li) {
      blocks.push({ kind: 'li', checked: li[1] === undefined ? null : li[1] !== ' ', text: li[2] })
      i++; continue
    }
    if (line.trim() === '') { i++; continue }
    // A paragraph runs to the next blank line or structural line.
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() !== ''
      && !/^(#{1,4})\s|^```|^\s*(?:[-*]|\d+\.)\s/.test(lines[i])) buf.push(lines[i++])
    blocks.push({ kind: 'p', text: buf.join(' ') })
  }
  return blocks
}

export default function MdLite({ source, openLink }: { source: string; openLink?: OpenLink }) {
  const blocks = parse(source)
  return (
    <div className="mdl">
      {blocks.map((b, i) => {
        if (b.kind === 'code') return <pre key={i} className="mdl-pre">{b.text}</pre>
        if (b.kind === 'h') {
          const H = (`h${Math.min((b.depth ?? 1) + 2, 6)}`) as 'h3' | 'h4' | 'h5' | 'h6'
          return <H key={i} className="mdl-h">{inline(b.text, openLink, String(i))}</H>
        }
        if (b.kind === 'li') return (
          <div key={i} className="mdl-li">
            {b.checked === null
              ? <span className="mdl-bullet">•</span>
              : <input type="checkbox" checked={b.checked} disabled readOnly />}
            <span>{inline(b.text, openLink, String(i))}</span>
          </div>
        )
        return <p key={i} className="mdl-p">{inline(b.text, openLink, String(i))}</p>
      })}
    </div>
  )
}
