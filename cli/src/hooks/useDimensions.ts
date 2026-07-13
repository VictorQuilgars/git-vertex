import { useEffect, useState } from 'react'

// Terminal size, updated on resize. Falls back to 80x24.
export function useDimensions(): { cols: number; rows: number } {
  const [dim, setDim] = useState({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  })
  useEffect(() => {
    const onResize = () => setDim({
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    })
    process.stdout.on('resize', onResize)
    return () => { process.stdout.off('resize', onResize) }
  }, [])
  return dim
}
