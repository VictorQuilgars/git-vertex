// StagingEditor — the file staging tool shown in a standalone VS Code editor tab.
// Thin wrapper around the desktop CenterFileDiff: line-by-line + per-hunk staging,
// line numbers, syntax highlighting, and a "whole file" toggle. A Non-indexé/Indexé
// switch (onChangeArea) lets the single tab both stage and unstage.

import React, { useState } from 'react'
import CenterFileDiff from '../CenterFileDiff/CenterFileDiff'

export default function StagingEditor({ file }: { file: string }) {
  const [area, setArea] = useState<'unstaged' | 'staged'>('unstaged')
  return (
    <CenterFileDiff
      target={{ type: 'working', filePath: file, area }}
      onChangeArea={setArea}
    />
  )
}
