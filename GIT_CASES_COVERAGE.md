# Git Vertex — Matrice de couverture des cas Git

> Tableau de suivi : pour **chaque fonction Git**, on liste les **actions** qu'un
> utilisateur peut faire, les **cas possibles** de chaque action, et si le cas est
> **géré**. À valider au fur et à mesure.
>
> Statuts :
> - ✅ **géré** — confirmé dans le code (service + UI quand vérifié)
> - ⚠️ **partiel** — fonctionne mais incomplet / améliorable
> - ❌ **non géré** — le cas n'est pas traité
> - ❓ **à vérifier** — logique service OK mais comportement UI/UX non confirmé
>
> Source service : `src/main/git-service.ts`. UI : `src/renderer/src/App.tsx`.
> Dernière revue : 2026-06-17 (1ère passe + corrections des lacunes, vérifiées sur les 3 couches).
> Tests de régression : `src/main/__tests__/git-service.test.ts` (97 passants).

---

## 1. Commit (`commit`, amend)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Créer un commit | Changements stagés présents | ✅ | `commit()` |
| | Rien de stagé | ✅ | Garde explicite `Nothing to commit` (simple-git ne throw pas) |
| | Message vide | ❓ | Pas de garde côté service — à vérifier côté UI (bouton désactivé ?) |
| | Tout premier commit (repo sans HEAD) | ✅ | Noeud WIP affiché, commit possible (cf. `getLog` empty) |
| | Commit signé GPG | ✅ | Flag `sign` → `-S` |
| | Échec signature (pas de clé GPG) | ❓ | Erreur remontée mais message brut — UX à vérifier |
| Amender le dernier commit | Amend message + fichiers | ✅ | `commit(msg, amend=true)` |
| | Amend message seul | ✅ | `amendMessage()` → `--amend --only` |
| | Amend d'un commit déjà poussé | ⚠️ | Possible mais aucun avertissement « réécrit l'historique poussé » |
| Réinitialiser le redo stack | Nouveau commit après un undo | ✅ | `redoStack = []` dans `commit()` |

## 2. Staging (`stage`, `stageAll`, `unstage`, `discardFile`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Stager | Fichier unique | ✅ | `git add -- <path>` |
| | Dossier | ✅ | git add gère les dossiers |
| | Tout stager | ✅ | `stageAll()` → `add -A` |
| | Fichier supprimé | ✅ | `add -A` / `add --` couvre la suppression |
| | Staging partiel (hunk/ligne) | ✅ | `applyPatch(--cached)` (cf. TODO_FEATURES) |
| Désindexer | Fichier / dossier | ✅ | `reset HEAD --` + fallback `restore --staged` |
| | Désindexer dans un repo sans HEAD | ⚠️ | `reset HEAD` échoue sans commit ; fallback `restore --staged` à confirmer |
| Annuler les modifs (discard) | Fichier suivi modifié | ✅ | `restore --` puis fallback `checkout --` |
| | Fichier non suivi (untracked) | ✅ | **Corrigé** : `discardFile` détecte l'untracked → `git clean -fd` ; bouton 🗑 dédié dans le panneau |
| | Discard de masse | ✅ | `discardAll` (untracked inclus) + confirm |
| | Confirmation avant perte | ✅ | `window.confirm` par fichier et global ; message dédié pour untracked |

## 3. Checkout / changement de branche (`checkout`, `createBranch`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Checkout branche | Branche propre | ✅ | `checkout(ref)` |
| | Changements non commités bloquants | ⚠️ | Erreur git remontée ; auto-stash existe en option (settings) |
| | Checkout d'un commit (detached HEAD) | ❓ | Possible ; signalement « detached » côté UI à vérifier |
| | Ref invalide / option injection (`-X`) | ✅ | `assertRef` rejette vide + leading-dash |
| Créer + checkout branche | Nom valide | ✅ | `checkoutLocalBranch` |
| | Nom déjà existant | ⚠️ | Erreur git brute remontée |
| | Nom invalide (espaces, `~`, `..`) | ❓ | Dépend de git, message brut |

## 4. Branches (`createBranchAt`, `deleteBranch`, `renameBranch`, `deleteRemoteBranch`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Créer branche à un commit | Avec/sans checkout | ✅ | `createBranchAt` |
| Supprimer branche locale | Branche mergée / non mergée | ⚠️ | `branch -D` force toujours — pas de garde « non mergée » |
| | Supprimer la branche courante | ⚠️ | Git refuse ; message brut |
| Renommer branche | Nom libre | ✅ | `branch -m` |
| | Renommer vers un nom existant | ⚠️ | Erreur brute |
| Supprimer branche distante | `origin` / remote nommé | ✅ | Parse `remotes/<r>/<name>` |
| | Branche distante protégée | ⚠️ | Refus serveur → message brut |

## 5. Merge (`merge`, `mergeCommitInto`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Merger une branche | Fast-forward | ✅ | `merge(branch)` |
| | Merge avec commit (no-ff implicite) | ✅ | |
| | **Conflit** | ✅ | Détecté via `hasUnmergedPaths` (simple-git ne throw pas) |
| | Already up-to-date | ❓ | Succès silencieux — feedback UI à vérifier |
| | Merge avec working tree sale | ⚠️ | Git peut refuser ; message brut |
| Merger un commit dans une branche | Checkout + merge | ✅ | `mergeCommitInto` |
| | Conflit après checkout d'une autre branche | ✅ | Détecté ; mais l'utilisateur a changé de branche |

## 6. Rebase (`rebaseOnto`, `rebaseBranchOnto`, `interactiveRebase`, `dropCommit`, `moveCommit`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Rebase branche courante sur une autre | Sans conflit | ✅ | `rebase --autostash` |
| | **Conflit** | ⚠️ | **Abort automatique** — pas de résolution interactive pour ce chemin |
| | Working tree sale | ✅ | `--autostash` |
| Rebase interactif | pick/reword/squash/fixup/drop | ✅ | `interactiveRebase` via `GIT_SEQUENCE_EDITOR` |
| | Conflit pendant le rebase i | ❓ | Erreur remontée ; continue/abort dispo via `continueRebase`/`abortRebase` — flux UI à vérifier |
| | Timeout (30s) | ⚠️ | `timeout: 30000` — gros rebase peut être coupé |
| Drop d'un commit | Commit milieu/historique | ✅ | `dropCommit` (séquence pré-construite) |
| | Conflit au drop | ✅ | Abort auto → « history unchanged » |
| | Commit introuvable | ✅ | Garde `picks.length === 0` |
| Déplacer un commit (up/down) | Voisin existe | ✅ | `moveCommit` swap |
| | Aux extrémités (impossible) | ✅ | Garde `Déplacement impossible` |
| | Conflit au déplacement | ✅ | Abort auto |
| Rebase d'une branche sur un commit | drag&drop | ✅ | `rebaseBranchOnto` (checkout + rebase) |
| | Conflit | ⚠️ | Abort auto, pas de résolution |

## 7. Reset (`reset`, `moveBranchTo`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Reset soft / mixed / hard | Vers un commit | ✅ | `reset(--mode)` |
| | Reset hard avec modifs non commitées | ⚠️ | Détruit silencieusement — **pas** de garde dans `reset()` direct |
| | Annulable | ✅ | Toast « Annuler » 8s (cf. TODO_FEATURES) |
| Déplacer un ref de branche (drag) | Branche courante = hard reset | ✅ | **Garde isDirty** → refuse si modifs non commitées |
| | Branche non courante = `branch -f` | ✅ | Force-update |
| | Ref invalide | ✅ | `assertRef` |

## 8. Cherry-pick (`cherryPick`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Cherry-pick un commit | Sans conflit | ✅ | `cherry-pick <hash>` |
| | **Conflit** | ✅ | **Corrigé** : résolveur s'ouvre (mode 'cherry-pick') + `continueCherryPick`/`abortCherryPick` câblés |
| | Hash invalide | ✅ | `assertRef` |
| | Cherry-pick range / multiples | ❌ | Un seul hash supporté |
| | Empty (déjà appliqué) | ❓ | Comportement git brut |

## 9. Revert (`revert`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Revert un commit | `--no-edit`, sans conflit | ✅ | `revert --no-edit` |
| | **Conflit** | ✅ | **Corrigé** : résolveur (mode 'revert') + `continueRevert`/`abortRevert` câblés |
| | Revert d'un merge commit | ✅ | **Corrigé** : détecte >1 parent → `-m 1` (test de régression) |
| | Hash invalide | ✅ | `assertRef` |

## 10. Push (`push`, `pushTo`, `pushBranch`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Push simple | Upstream configuré | ✅ | `push()` |
| | **Pas d'upstream** | ✅ | Auto `--set-upstream origin <branch>` (détection multilingue) |
| | Rejet (non fast-forward) | ⚠️ | Message brut, pas de proposition force/pull |
| | Aucun remote configuré | ✅ | PushModal masque le bouton, message dédié |
| Push ciblé (modal) | remote + branche + set-upstream | ✅ | `pushTo` (`HEAD:<branch>`) |
| Push d'une branche précise | Force set-upstream origin | ✅ | `pushBranch` |
| | Force push | ✅ | **Corrigé** : case `--force-with-lease` dans PushModal + avertissement |
| | Auth échouée (token/HTTPS) | ⚠️ | Message brut |
| | Push de tags | ❓ | Pas vu — à vérifier (tags poussés ?) |

## 11. Pull (`pull`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Pull | Fast-forward / merge propre | ✅ | `pull()` |
| | **Conflit de merge** | ✅ | Détecté via `hasUnmergedPaths`, message dédié |
| | Pas d'upstream | ⚠️ | Erreur git brute |
| | Pull --rebase | ❌ | Seul le merge est exposé |
| | Modifs locales bloquantes | ⚠️ | Git refuse → message brut |

## 12. Fetch (`fetch`, `fetchRemote`, `getRemoteRefs`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Fetch tous remotes | `--all --prune` | ✅ | `fetch()` |
| | Détection nouveaux commits | ✅ | `getRemoteRefs` snapshot diff |
| Fetch un remote précis | | ✅ | `fetchRemote(name)` |
| | Aucun remote | ❓ | Succès vide — feedback à vérifier |
| | Réseau indisponible | ⚠️ | Message brut |

## 13. Stash (`createStash`, `applyStash`, `popStash`, `dropStash`, `getStashDiff`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Créer un stash | Avec/sans message, untracked inclus | ✅ | `stash push --include-untracked` |
| | Rien à stasher | ❓ | git « No local changes » — feedback à vérifier |
| | Stash partiel (fichiers choisis) | ❌ | Pas de `--patch` / pathspec |
| Appliquer un stash | Sans conflit | ✅ | `stash apply` |
| | **Conflit à l'application** | ✅ | **Corrigé** : `hasUnmergedPaths` après apply → message clair (test de régression) |
| Pop un stash | | ✅ | `stash pop` |
| | Conflit au pop | ✅ | **Corrigé** : détecté + message « stash conservé, résolvez puis indexez » |
| Supprimer un stash | | ✅ | `stash drop` |
| Aperçu d'un stash | Patch + untracked | ✅ | Fallback git < 2.32 sans untracked |
| | Index obsolète (stash supprimé) | ⚠️ | Index numérique — décalage possible après drop |

## 14. Tags (`createTag`, `deleteTag`, `getTags`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Créer tag léger | Sur HEAD / commit donné | ✅ | `createTag` sans message |
| Créer tag annoté | Avec message | ✅ | `tag -a -m` |
| | Tag déjà existant | ⚠️ | Erreur brute |
| Supprimer tag | Local | ✅ | `tag -d` |
| | Supprimer tag distant | ✅ | **Corrigé** : `deleteRemoteTag` (`:refs/tags/<name>`) + menu contextuel + confirm |
| | Pousser un tag | ✅ | **Corrigé** : `pushTag` (`refs/tags/<name>`) + menu contextuel |

## 15. Résolution de conflits (`getConflictedFiles`, `getConflictVersions`, `resolveConflict*`, `continueRebase/Merge`, `abort*`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Lister fichiers en conflit | U/U, A/A, D/D | ✅ | `getConflictedFiles` |
| Voir versions base/ours/theirs | Stages :1/:2/:3 | ✅ | `getConflictVersions` |
| Résoudre via contenu édité | Écrit fichier + add | ✅ | `resolveConflict` (+ garde path traversal) |
| Prendre un côté entier | ours / theirs | ✅ | `resolveConflictWithSide` |
| | Conflit add/add ou delete/delete | ⚠️ | `checkout --ours/--theirs` peut échouer selon le type |
| Marquer résolu | add du fichier | ✅ | `markResolved` |
| Continuer | Rebase | ✅ | `continueRebase` |
| | Merge (avec/sans message) | ✅ | `continueMerge` (bypass éditeur) |
| | Cherry-pick / revert continue | ✅ | **Corrigé** : `continueCherryPick`/`continueRevert` (GIT_EDITOR=true) ; routé via `conflictMode` |
| Abandonner | Rebase / Merge | ✅ | `abortRebase` / `abortMerge` |
| | Abort cherry-pick / revert | ✅ | **Corrigé** : `abortCherryPick`/`abortRevert` ; `handleConflictAbort` branche sur `conflictMode` |
| Détecter le mode | merge/rebase/cherry-pick/revert | ✅ | `getConflictMode` via fichiers .git |
| Éditeur de merge externe | code/subl/meld | ✅ | cf. TODO_FEATURES |

## 16. Undo / Redo (`undoLastAction`, `redoLastAction`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Annuler dernière action | ORIG_HEAD présent (merge/rebase/reset) | ✅ | `reset --soft ORIG_HEAD` |
| | Sinon dernier commit | ✅ | `reset --soft HEAD~1` |
| | Pas de commit précédent | ✅ | Garde « impossible d'annuler » |
| | Modifs non commitées présentes | ✅ | Soft reset les préserve |
| Rétablir (redo) | Cible encore atteignable | ✅ | `cat-file -e` avant reset |
| | Rien à rétablir | ✅ | Garde « Rien à rétablir » |
| | Cible GC'd / disparue | ✅ | Erreur remontée proprement |
| | Invalidation après nouveau commit | ✅ | `redoStack = []` au commit |

## 17. Remotes (`getRemotes`, `addRemote`, `removeRemote`, `renameRemote`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Lister remotes | fetch/push URLs | ✅ | `remote -v` parsé |
| Ajouter remote | nom + url | ✅ | `remote add` |
| | Nom déjà existant | ⚠️ | Erreur brute |
| | URL invalide | ❓ | Non validé avant l'appel |
| Supprimer remote | | ✅ | `remote remove` |
| Renommer remote | | ✅ | `remote rename` |

## 18. Tracking / upstream (`getTracking`, `getUpstream`, `setUpstream`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Lire ahead/behind | Upstream présent | ✅ | `rev-list --left-right --count` |
| | Pas d'upstream | ✅ | Retourne 0/0 |
| | HEAD détaché | ✅ | `branch = null` |
| | Upstream supprimé (gone) | ✅ | Badge ✂ via `getBranches` |
| Définir upstream | `origin/<branch>` | ✅ | `setUpstream` |
| | Upstream avec remote ≠ origin | ✅ | **Corrigé** : préfère origin, sinon 1er remote ; erreur si aucun (test de régression) |

## 19. Worktrees (`listWorktrees`, `addWorktree`, `removeWorktree`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Lister worktrees | main / liés / détachés / locked | ✅ | Parse `--porcelain` |
| Ajouter worktree | Branche existante / nouvelle | ✅ | `-b` optionnel |
| | Chemin déjà utilisé | ⚠️ | Erreur brute |
| Supprimer worktree | Propre / forcé | ✅ | `--force` optionnel |
| | Worktree sale sans force | ⚠️ | Git refuse → message brut |

## 20. Submodules (`getSubmodules`, `initSubmodule`, `updateSubmodule`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Lister submodules | ok / dirty / uninitialized | ✅ | `submodule status` + `.gitmodules` |
| | Pas de `.gitmodules` | ✅ | Retourne liste vide |
| Initialiser | | ✅ | `submodule init` |
| Mettre à jour | | ✅ | `submodule update` |
| | Deinit / sync URL | ❌ | Non exposé |

## 21. Gitflow (`gitflowStatus/Init/Start/Finish`)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Statut gitflow | develop présent ? main détecté | ✅ | `detectMainBranch` (main→master→courant) |
| Init | Crée `develop` | ✅ | Idempotent si déjà présent |
| Démarrer feature/release/hotfix | base correcte | ✅ | hotfix sur main, autres sur develop |
| | Démarrer feature sans develop | ✅ | Garde « Gitflow non initialisé » |
| Finir | feature → develop | ✅ | merge `--no-ff` |
| | release/hotfix → main(+tag)+develop | ✅ | merge + tag optionnel |
| | **Conflit pendant le finish** | ✅ | **Corrigé** : `gitflowMerge` détecte le conflit → `merge --abort`, repo inchangé (test de régression) |
| | Branche finish inexistante | ⚠️ | Erreur brute |

## 22. Lecture seule (log, diff, blame, history, search, compare, reflog)

| Action | Cas | Statut | Notes |
|---|---|---|---|
| Log | Repo vide (sans HEAD) | ✅ | Retourne `[]`, UI montre WIP |
| | maxCount défaut 200 | ✅ | Pagination ? ❓ au-delà de 200 |
| | Filtre par refs (solo/mute) | ✅ | `options.refs` prioritaire sur `--all` |
| Diff d'un commit | Commit normal | ✅ | `diff parent..commit` |
| | Commit racine (sans parent) | ✅ | `show` |
| | Diff entre 2 commits | ✅ | `diffBetweenCommits` (assertRef) |
| Blame | Fichier à un commit | ✅ | `blame --porcelain` |
| | Fichier binaire / inexistant | ⚠️ | Retourne lignes vides, pas d'erreur explicite |
| Historique fichier | `--follow` (renommages) | ✅ | `getFileHistory` |
| Recherche dans diffs | Pickaxe `-S` | ✅ | `searchInDiffs` (max 100) |
| Comparer branches | ahead/behind | ✅ | `compareBranches` |
| Reflog | 50 dernières entrées | ✅ | `getReflog` |

---

## Bilan des corrections (2026-06-17)

Lacunes ❌ corrigées sur les 3 couches (service → IPC → preload → UI) :

1. ✅ **Discard d'un fichier non suivi** (§2) — `git clean -fd` + bouton 🗑 dédié + confirm.
2. ✅ **Conflit au stash apply/pop** (§13) — détection `hasUnmergedPaths` + message clair.
3. ✅ **Cherry-pick / revert continue/abort** (§15) — 4 méthodes + routage via `conflictMode`.
4. ✅ **Revert d'un commit de merge** (§9) — `-m 1` auto sur les merges.
5. ✅ **Force push** (§10) — case `--force-with-lease` dans PushModal + avertissement.
6. ✅ **setUpstream remote-aware** (§18) — origin sinon 1er remote, erreur si aucun.
7. ✅ **Gitflow finish sans gestion de conflit** (§21) — abort + repo inchangé.
8. ✅ **Tags distants** (§14) — `pushTag` / `deleteRemoteTag` + menu contextuel.

Couvert par 7 tests de régression dans `git-service.test.ts` (97 passants au total).

### Reste à traiter (non bloquant)

- ⚠️ **Reset hard direct** (§7) — pas de garde `isDirty` dans `reset()`, mais l'UI affiche
  déjà un `confirm` danger (`prompt.resetHard`). Acceptable ; durcissement possible.
- ⚠️ **Messages d'erreur git bruts** (transversal) — erreurs remontées telles quelles, peu UX.
- ❓ Quelques cas « à vérifier » restants (feedback up-to-date, push de tags en masse, etc.).
