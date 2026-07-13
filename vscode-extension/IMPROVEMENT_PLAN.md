# Git Vertex — Extension VS Code : plan d'amélioration

Travail itératif (implémenter → tester → vérifier UI → committer). Objectif :
parité fonctionnelle Git complète + UX au niveau des meilleurs clients Git.

## Repères à reproduire

**GitLens**
- Commit Graph riche avec colonnes responsives (graph / message / auteur+avatar / date / sha / changements).
- **Détection des opérations en cours** (rebase, merge, cherry-pick, revert) → bannière actionnable *Continuer / Abandonner / Skip*.
- Ouverture des **diffs dans des onglets natifs VS Code** (éditeur de diff côte à côte), pas dans le webview.
- Éditeur de rebase interactif comme onglet.
- Recherche/filtre de commits, blame inline, hovers.
- Vues latérales : branches / remotes / tags / stashes / worktrees.

**Clients Git de bureau**
- Graphe avec drag&drop (merge/rebase/reset) — déjà présent.
- Résolution de conflits, push/pull/fetch (avec force), stash, submodules, worktrees, undo/redo.

## État initial (constaté)

- Dispatcher host (`GitVertexViewProvider._dispatch`) énumère à la main → bcp de `not-implemented`.
- `gitService.ts` extension = copie réduite du desktop, méthodes manquantes (conflits continue/abort,
  merge, rebaseOnto, remotes, setUpstream, tags distants, dropStash, getStashDiff, reflog, gitflow, worktrees…).
- `app.tsx` : `onConflictFinish`/`onConflictAbort`/`onOpenResolver`/`onOpenFileDiff` = no-op.
- Le webview réutilise les composants desktop (CommitGraph/RightPanel/InteractiveRebase) via imports relatifs.

## Avancement

- ✅ **Phase A** — parité des opérations Git (dispatcher réflexif + port complet + renforts). Commit `cf5a93e`.
- ✅ **Phase B** — flux conflits/opération en cours : continue/abort réels, bannière, onglets natifs (diff + conflit). Commit `cf5a93e`.
- ✅ **Phase C** — responsive : colonnes masquées selon l'espace réel (fin du « colonnes invisibles »), clip anti-superposition. Commit `63f5426`.
- ✅ **Bonus** — menu contextuel branche/tag sur le graphe (merge/rebase/rename/delete/push/upstream/tags). Commit `d3cafc5`.
- ✅ **Sidebar** — réutilisation de la Sidebar desktop dans l'extension (branches/remotes/tags/stashes/submodules/worktrees/reflog), toggle dans la toolbar, solo/mute des branches, gestion des stashes par index. Port des dernières méthodes service (submodules, worktrees, getLog refs) + host `selectDirectory`.
- ⏳ **Reste** : modal push avec force ; AI commit message ; vérif visuelle (dev host F5).

## Phases

### Phase A — Parité des opérations Git  ✅ priorité
- A1. **Dispatcher réflexif** : transférer toute méthode à `GitService` si elle existe ; garder les
  méthodes host (uiPrompt/uiConfirm/openTerminal/openDesktop…) + overrides (avatarResolve, AI).
- A2. **Porter les méthodes manquantes** du desktop `git-service.ts` vers `gitService.ts` extension
  (conflits, merge, rebaseOnto, renameBranch, setUpstream remote-aware, pushBranch, deleteRemoteBranch,
  pushTo, getRemotes/add/remove/rename/fetchRemote, dropStash, getStashDiff, getReflog, getUpstream,
  getStatus, compareBranches, diff/files BetweenCommits, getFileContent/AtCommit, applyPatch,
  pushTag/deleteRemoteTag, searchInDiffs, submodules, gitflow, worktrees).
- A3. Embarquer les correctifs desktop (discard untracked, revert de merge, conflit stash apply/pop…).

### Phase B — Flux conflits / opération en cours (GitLens-style)
- B1. Brancher `onConflictFinish`/`onConflictAbort` sur les vraies commandes (routées par `conflictMode`).
- B2. Bannière d'opération en cours (rebase/merge/cherry-pick/revert) : Continuer / Abandonner.
- B3. Ouvrir le résolveur de conflit + diffs dans des **onglets natifs VS Code**.

### Phase C — UI/UX responsive
- C1. Corriger les champs qui se superposent (toolbar / RightPanel / graphe).
- C2. Colonnes : message jamais réduit à 0 ; breakpoints affinés ; fallback scroll horizontal.
- C3. Mode empilé (panneau étroit) peaufiné.

### Phase D — Intégrations natives VS Code
- D1. Diff d'un commit (multi-fichiers) en onglets natifs.
- D2. Diff d'un fichier du working tree en éditeur natif.
- D3. Status bar / SCM (optionnel).

## Vérification
- Build : `npm run compile` (extension) + `npm run build` (desktop, composants partagés).
- Tests : `npm test` (extension), `npx jest` (desktop git-service).
- UI : `.vsix` chargé en dev pour vérif visuelle (les webviews ne se vérifient pas en headless).
