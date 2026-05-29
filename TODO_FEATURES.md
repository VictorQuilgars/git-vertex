# Git Vertex — Fonctionnalités à implémenter

Ce fichier liste les fonctionnalités manquantes pour atteindre la parité avec GitKraken.
**Après chaque feature : commit avec un message conventionnel (`feat:`, `fix:`, `chore:`).**

---

## Contexte technique

- Electron + React + TypeScript, electron-vite
- IPC pattern : `ipcMain.handle` → `ipcRenderer.invoke` → `window.gitAPI`
- Tout ajout IPC nécessite des modifications dans **3 fichiers** :
  `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx` (ou le composant concerné)
- Style : dark theme `#0d1117` / `#161b22` / `#21262d`, accents vert `#3fb950`, bleu `#58a6ff`, rouge `#f85149`
- CSS modules par composant, pas de framework CSS global

---

## 1. Menu contextuel sur un commit (clic droit)

**Composant à créer : `src/renderer/src/components/CommitContextMenu/CommitContextMenu.tsx`**

Le menu s'affiche au clic droit sur une ligne du `CommitGraph`. Il doit contenir les actions suivantes, organisées par groupes séparés par des `<hr>` :

### Groupe 1 — Navigation
- **Checkout** → `git checkout <hash>` (detached HEAD)

### Groupe 2 — Branches
- **Create branch here** → `git branch <name> <hash>` + dialogue pour saisir le nom
- **Reset `<branche>` to this commit** → sous-menu : Soft / Mixed / Hard → `git reset --soft|--mixed|--hard <hash>`
- **Create tag here** → dialogue nom + message optionnel → `git tag <name> <hash>`

### Groupe 3 — Modifications du commit
- **Edit commit message** → uniquement si c'est le dernier commit (`HEAD`) : `git commit --amend -m "nouveau message"` via une dialogue modale
- **Revert commit** → `git revert <hash> --no-edit` (déjà implémenté, à exposer dans le menu)
- **Drop commit** → supprime le commit via rebase interactif (`drop <hash>`) sans ouvrir l'UI de rebase
- **Move commit up** → échange ce commit avec le suivant via rebase interactif
- **Move commit down** → échange ce commit avec le précédent via rebase interactif

### Groupe 4 — Utilitaires
- **Copy commit SHA** → `navigator.clipboard.writeText(hash)`
- **Copy commit message** → `navigator.clipboard.writeText(message)`
- **Compare commit against working directory** → affiche un diff entre ce commit et l'état actuel des fichiers (utiliser `git diff <hash>`)

### Implémentation
1. Écouter `onContextMenu` sur chaque ligne `.cg-row` dans `CommitGraph.tsx`
2. Stocker `{ x, y, commit }` dans un state et rendre `<CommitContextMenu>`
3. Fermer le menu au clic ailleurs (`useEffect` sur `mousedown`)
4. Ajouter les IPC nécessaires pour drop/move (rebase interactif ciblé)

**Commit :** `feat(commit-graph): add right-click context menu with branch/commit actions`

---

## 2. Menu contextuel sur une branche (sidebar)

**Dans `Sidebar.tsx`, clic droit sur un item de branche locale ou remote.**

Actions :
- **Checkout** → `git checkout <branche>`
- **Rename** → dialogue → `git branch -m <old> <new>`
- **Delete** → confirmation → `git branch -d <branche>`
- **Delete remote** → `git push origin --delete <branche>`
- **Merge into current** → `git merge <branche>`
- **Rebase current onto** → `git rebase <branche>`
- **Copy branch name** → clipboard
- **Push** → `git push origin <branche>`
- **Set upstream** → `git branch --set-upstream-to=origin/<branche>`

**Commit :** `feat(sidebar): add right-click context menu on branches`

---

## 3. Recherche / filtre dans le graph

**Barre de recherche au-dessus du `CommitGraph`.**

- Champ texte filtrant en temps réel les commits par : message, auteur, hash
- Raccourci `Ctrl+F` / `Cmd+F` pour l'ouvrir
- Les commits non-correspondants sont grisés (pas supprimés) ou on scroll jusqu'au premier résultat
- Bouton ✕ pour effacer

IPC : pas nécessaire, le filtre s'applique côté renderer sur le tableau `commits` déjà chargé.

**Commit :** `feat(commit-graph): add search/filter bar for commits`

---

## 4. Drag & drop de branches

**Dans le `CommitGraph`, glisser une branche (chip dans la colonne BRANCH/TAG) sur un autre commit.**

- Au drop : proposer un sous-menu : "Reset here" (hard) / "Rebase" / "Merge"
- Feedback visuel pendant le drag (opacité réduite sur la source, highlight sur la cible)
- Utiliser les API HTML5 drag & drop ou `onMouseMove` + `onMouseUp`

**Commit :** `feat(commit-graph): add drag-and-drop branches onto commits`

---

## 5. Panneau de comparaison de branches

**Nouveau composant `BranchComparePanel`.**

Accessible via un bouton dans la toolbar ou le menu contextuel de branche.

Affiche :
- Les commits présents dans la branche A mais pas dans B (ahead)
- Les commits présents dans B mais pas dans A (behind)
- Utilise `git log A..B` et `git log B..A`

IPC : `git:compare-branches` existe déjà dans `git-service.ts`.

**Commit :** `feat(branch-compare): add branch comparison panel`

---

## 6. Gitflow

**Bouton "Gitflow" dans la toolbar.**

Quand cliqué, si Gitflow n'est pas initialisé : dialogue pour initialiser (`git flow init` ou créer les branches `develop`, `feature/*`, `release/*`, `hotfix/*` manuellement).

Actions disponibles :
- Start feature / release / hotfix → crée la branche correspondante
- Finish feature / release / hotfix → merge + suppression de la branche source

Implémentation sans dépendance `git-flow` : reproduire les commandes git manuellement.

**Commit :** `feat(gitflow): add gitflow panel with start/finish actions`

---

## 7. Palette de commandes (Command Palette)

**Raccourci `Ctrl+P` / `Cmd+P`.**

Overlay modal avec un champ de recherche flou permettant d'accéder à toutes les actions :
- Checkout une branche
- Créer une branche
- Ouvrir un repo récent
- Stash / Pop stash
- Pull / Push / Fetch

Implémentation : liste statique d'actions + filtre fuzzy côté renderer.

**Commit :** `feat(ui): add command palette with fuzzy search (Ctrl+P)`

---

## 8. Onglets multi-repo

**Barre d'onglets en haut de la fenêtre.**

- Chaque onglet = un repo ouvert
- `+` pour ouvrir un nouveau repo dans un onglet
- Clic droit sur onglet : fermer, fermer les autres
- L'état (branche, commit sélectionné) est propre à chaque onglet

Implémentation : transformer le state de `App.tsx` en tableau d'états indexés par `tabId`, `activeTabId`.

**Commit :** `feat(ui): add multi-repo tabs`

---

## 9. Indicateur de conflits amélioré

**Quand `git status` détecte des conflits (fichiers `UU`), afficher :**

- Une bannière rouge en haut du RightPanel
- La liste des fichiers en conflit avec un bouton "Résoudre" par fichier
- Pour chaque fichier : affichage côte-à-côte (ours / theirs) ou éditeur inline avec marqueurs `<<<<<<<`
- Boutons "Accept Ours" / "Accept Theirs" / "Mark as resolved"

IPC : `git:get-conflicted-files` et `git:get-conflict-versions` existent déjà.

**Commit :** `feat(conflicts): improve conflict resolution UI with side-by-side view`

---

## 10. Worktrees

**Accessible via le menu contextuel commit ou un bouton dans la sidebar.**

- Lister les worktrees existants : `git worktree list`
- Créer un worktree depuis un commit/branche : `git worktree add <path> <branch>`
- Supprimer : `git worktree remove <path>`
- Afficher les worktrees dans la sidebar sous une section dédiée

IPC à créer : `git:list-worktrees`, `git:add-worktree`, `git:remove-worktree`.

**Commit :** `feat(worktrees): add worktree management in sidebar and context menu`

---

## 11. Notifications de bureau

**Utiliser `Notification` d'Electron pour notifier l'utilisateur :**

- Quand un `git fetch` détecte des nouveaux commits sur le remote
- Quand un commit réussit (optionnel, désactivable dans les settings)
- Quand une mise à jour est disponible (en complément du panneau settings)

**Commit :** `feat(notifications): add desktop notifications for fetch/update events`

---

## 12. Section Stashes dans la sidebar

**Actuellement les stashes ne sont pas visibles dans la sidebar.**

- Ajouter une section "Stashes" dans `Sidebar.tsx` sous les tags
- Afficher la liste des stashes avec leur message
- Clic droit : Apply / Pop / Drop
- Clic gauche : afficher le diff du stash dans le RightPanel

**Commit :** `feat(sidebar): add stashes section with apply/pop/drop actions`

---

## Notes pour l'implémentation

- Respecter le pattern IPC documenté dans `CLAUDE.md` pour tout nouvel endpoint
- Utiliser `simple-git` dans `src/main/git-service.ts` pour les opérations git
- Les composants CSS utilisent des modules (fichier `.css` par composant)
- L'UI est en français (labels, tooltips, messages d'erreur)
- Les messages de commit doivent être en anglais, format conventionnel
