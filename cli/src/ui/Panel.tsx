import React from 'react'
import { Box, Text } from 'ink'

export interface MenuItem { label: string; active?: boolean }

const SUP: Record<string, string> = { '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶' }
const superscript = (n?: string) => (n ? (SUP[n] ?? n) : '')

// btop-style layout with the Git Vertex desktop dark palette (#0d1117, etc.)
export const THEME = {
  bg: '#0d1117',      // desktop background
  surface: '#161b22',
  border: '#30363d',
  title: '#3fb950',   // desktop green
  num: '#f85149',     // red hotkey number
  menu: '#6e7681',    // dim menu word
  menuKey: '#c9d1d9', // brighter first letter
  menuOn: '#58a6ff',  // blue accent (active)
  text: '#c9d1d9',
  dim: '#6e7681',
  selBg: '#1f3a5f',
}

function TopLine({ width, title, num, menu, accent, borderColor }: {
  width: number; title: string; num?: string; menu?: MenuItem[]; accent: string; borderColor: string
}) {
  const sup = superscript(num)
  let used = 2 /* ╭─ */ + sup.length + title.length + 1 /* ╮ */
  const items = menu ?? []
  for (const m of items) used += 1 + m.label.length // space + label
  const fill = Math.max(0, width - used)
  return (
    <Text wrap="truncate-end">
      <Text color={borderColor}>╭─</Text>
      {sup && <Text color={THEME.num} bold>{sup}</Text>}
      <Text color={accent} bold>{title}</Text>
      {items.map((m, i) => (
        <Text key={i}>
          <Text color={borderColor}> </Text>
          {m.active
            ? <Text color={THEME.menuOn} bold>{m.label}</Text>
            : <Text><Text color={THEME.menuKey}>{m.label.slice(0, 1)}</Text><Text color={THEME.menu}>{m.label.slice(1)}</Text></Text>}
        </Text>
      ))}
      <Text color={borderColor}>{'─'.repeat(fill)}╮</Text>
    </Text>
  )
}

// A btop-style bordered panel: rounded corners, title + hotkey number + menu
// items embedded in the top border. Children are laid out between the vertical
// side borders (they should be at most `height - 2` single-line rows).
export default function Panel({ width, height, title, num, menu, accent = THEME.title, borderColor = THEME.border, footer, children }: {
  width: number
  height: number
  title: string
  num?: string
  menu?: MenuItem[]
  accent?: string
  borderColor?: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const innerH = Math.max(1, height - 2)
  const bars = Array.from({ length: innerH })
  return (
    <Box flexDirection="column" width={width} height={height}>
      <TopLine width={width} title={title} num={num} menu={menu} accent={accent} borderColor={borderColor} />
      <Box flexDirection="row" height={innerH}>
        <Box flexDirection="column">{bars.map((_, i) => <Text key={i} color={borderColor}>│</Text>)}</Box>
        <Box flexDirection="column" width={width - 2} height={innerH} paddingX={1}>{children}</Box>
        <Box flexDirection="column">{bars.map((_, i) => <Text key={i} color={borderColor}>│</Text>)}</Box>
      </Box>
      {footer
        ? <Text wrap="truncate-end"><Text color={borderColor}>╰─</Text>{footer}<Text color={borderColor}>{'─'.repeat(Math.max(0, width - 3))}╯</Text></Text>
        : <Text color={borderColor}>{'╰' + '─'.repeat(Math.max(0, width - 2)) + '╯'}</Text>}
    </Box>
  )
}
