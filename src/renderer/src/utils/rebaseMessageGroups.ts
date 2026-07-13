// Groups a planned rebase sequence into "message groups": a leader commit
// (pick/reword/edit) plus any trailing squash/fixup commits folded into it.
// Mirrors git's own squash/fixup grouping rules so we know exactly which
// groups will actually prompt for a commit message (and in which order —
// the order this function returns groups in is the order git invokes the
// message editor), letting the UI offer a message box only where it matters
// instead of ending up with git's raw multi-message concatenation.

export interface RebaseSeqEntry {
  action: string
  hash: string
  message: string
}

export interface MessageGroup {
  leaderIndex: number
  lastMemberIndex: number
  memberIndexes: number[]
  // Whether git will actually invoke the commit-message editor for this
  // group: true for any group containing a 'squash', or a lone 'reword'.
  needsMessage: boolean
  // Kept messages joined as a sensible starting point to edit (leader +
  // any 'squash' members — 'fixup' members never contribute their message).
  defaultMessage: string
}

export function computeMessageGroups(seq: RebaseSeqEntry[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let current: { leaderIndex: number; memberIndexes: number[] } | null = null

  const closeCurrent = (): void => {
    if (!current) return
    const members = current.memberIndexes.map(i => seq[i])
    const leader = seq[current.leaderIndex]
    const squashMembers = members.slice(1).filter(m => m.action === 'squash')
    const hasSquash = squashMembers.length > 0
    const needsMessage = leader.action === 'reword' || hasSquash
    const kept = leader.action === 'reword' && !hasSquash
      ? [leader]
      : [leader, ...squashMembers]
    groups.push({
      leaderIndex: current.leaderIndex,
      lastMemberIndex: current.memberIndexes[current.memberIndexes.length - 1],
      memberIndexes: current.memberIndexes,
      needsMessage,
      defaultMessage: kept.map(m => m.message).join('\n\n'),
    })
    current = null
  }

  seq.forEach((entry, i) => {
    // Directive-like entries (no hash — exec/break/etc.) and drops both
    // close any open group and don't start/extend one themselves.
    if (!entry.hash || entry.action === 'drop') { closeCurrent(); return }
    if (entry.action === 'squash' || entry.action === 'fixup') {
      if (current) current.memberIndexes.push(i)
      // A squash/fixup with no open group (shouldn't happen — validated
      // elsewhere) is treated as a no-op leader on its own.
      else current = { leaderIndex: i, memberIndexes: [i] }
      return
    }
    // pick / reword / edit — starts a new group.
    closeCurrent()
    current = { leaderIndex: i, memberIndexes: [i] }
  })
  closeCurrent()

  return groups
}
