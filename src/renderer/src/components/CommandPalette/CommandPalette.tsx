import React, { useState, useEffect, useRef, useCallback } from 'react'
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="cp-search-icon">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
          </svg>
          <input
            ref={inputRef}
            className="cp-input"
            placeholder={title || t('cp.search')}
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
