import { useCallback, useReducer, useRef } from 'react'
import type { SeedKey } from '../../../../main/theme-validate'
import type { Seeds } from './seeds'

type State = { seeds: Seeds; history: Partial<Record<SeedKey, string[]>>; groups: Partial<Record<SeedKey, number>> }
type Action = { type: 'edit'; patch: Partial<Seeds>; group: number } | { type: 'undo'; key: SeedKey }
function reduce(state: State, action: Action): State {
  const next = { seeds: { ...state.seeds }, history: { ...state.history }, groups: { ...state.groups } }
  if (action.type === 'undo') {
    const past = state.history[action.key] ?? []
    if (!past.length) return state
    next.seeds[action.key] = past[past.length - 1]
    next.history[action.key] = past.slice(0, -1)
    delete next.groups[action.key]
  } else {
    for (const key of Object.keys(action.patch) as SeedKey[]) {
      const value = action.patch[key]!.toUpperCase()
      if (value === state.seeds[key]) continue
      if (state.groups[key] !== action.group) {
        next.history[key] = [...(state.history[key] ?? []), state.seeds[key]].slice(-100)
      }
      next.groups[key] = action.group
      next.seeds[key] = value
    }
  }
  return next
}

/** One undo per editing gesture, even when a colour picker emits many changes. */
export function useSeedHistory(initial: () => Seeds) {
  const [state, dispatch] = useReducer(reduce, undefined, () => ({ seeds: initial(), history: {}, groups: {} }))
  const group = useRef(0)
  const beginEdit = useCallback(() => { group.current++ }, [])
  const setSeed = useCallback((key: SeedKey, value: string) => {
    dispatch({ type: 'edit', patch: { [key]: value }, group: group.current })
  }, [])
  const importSeeds = useCallback((patch: Partial<Seeds>) => {
    dispatch({ type: 'edit', patch, group: ++group.current })
    group.current++
  }, [])
  const undoSeed = useCallback((key: SeedKey) => { dispatch({ type: 'undo', key }) }, [])
  return { seeds: state.seeds, history: state.history, beginEdit, setSeed, importSeeds, undoSeed }
}
