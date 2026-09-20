// Which reference's card is open, for a host. The graph asks (a click on a
// chip), the host holds the answer, and the card closes on its own when it
// stops being about anything: the selection leaves the reference's tip — the
// panel under it is about something else by then — or the reference itself is
// deleted, which the card's own Delete button is the commonest way to do.
import { useCallback, useEffect, useState } from 'react'
import type { BranchInfo } from '../../types'
import { refGone, type RefTarget } from './ref-card-model'

export function useRefCard(
  selectedHash: string | null,
  branches: readonly BranchInfo[] = [],
  tags: readonly { name: string }[] = []
) {
  const [card, setCard] = useState<RefTarget | null>(null)
  useEffect(() => {
    if (card && (selectedHash !== card.hash || refGone(card, branches, tags))) setCard(null)
  }, [selectedHash, card, branches, tags])
  /** A click on the chip whose card is open closes it; any other chip takes its place. */
  const toggle = useCallback((ref: RefTarget | null) => {
    setCard(prev => ref && prev && prev.kind === ref.kind && prev.name === ref.name ? null : ref)
  }, [])
  const close = useCallback(() => setCard(null), [])
  return { card, toggle, close }
}
