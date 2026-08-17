import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import './CommandPalette.css'

export interface PaletteCommand {
  id: string
  label: string
  icon?: string
  action: () => void | Promise<void>
}

interface CommandPaletteProps {
  commands: PaletteCommand[]
  onClose: () => void
}

export default function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const execute = useCallback((cmd: PaletteCommand) => {
    onClose()
    cmd.action()
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) execute(filtered[activeIndex])
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="cp-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="cp-panel">
        <div className="cp-search">
          <Icon name="search" size={14} className="cp-search-icon" />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder={t('cp.search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cp-esc">Esc</kbd>
        </div>
        <div className="cp-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cp-empty">{t('cp.empty')}</div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`cp-item ${i === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => execute(cmd)}
            >
              {cmd.icon && <span className="cp-item-icon">{cmd.icon}</span>}
              <span className="cp-item-label">{cmd.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
