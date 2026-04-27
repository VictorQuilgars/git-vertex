# Prompt pour Claude CLI — Git GUI (GitKraken clone)

> Colle ce prompt directement dans Claude CLI (`claude`) pour le faire travailler en autonomie.

---

## PROMPT À COPIER-COLLER

```
Tu vas travailler en autonomie sur un projet Electron + React + TypeScript situé dans le répertoire courant.
C'est un clone de GitKraken (GUI Git). Voici les règles impératives :

RÈGLES :
1. Après chaque feature complète, lance `npm run build` et vérifie que le build passe sans erreur.
2. Si le build passe → fais un commit git avec un message clair (ex: "feat: add interactive rebase UI").
3. Si le build échoue → corrige les erreurs avant de passer à la suite. Ne commit pas un build cassé.
4. Passe à la feature suivante sans me demander la permission. Tu prends toutes les décisions seul.
5. Avant de commencer chaque nouvelle feature, vérifie ton nombre de tokens restants.
   Si tu estimes ne pas avoir assez de tokens pour finir la feature entière, arrête-toi proprement,
   fais un commit de ce qui est stable, et laisse une note dans TODO.md sur où tu t'es arrêté.
6. Ne me pose AUCUNE question. Prends toutes les décisions architecturales toi-même.
7. En cas d'erreur TypeScript ou de build, corrige-la immédiatement avant de continuer.

STACK TECHNIQUE :
- Electron + React + TypeScript via electron-vite
- simple-git pour toutes les opérations git
- contextBridge avec contextIsolation: true (window.prompt/confirm sont BLOQUÉS — utilise les composants Dialog existants)
- Composants Dialog custom : PromptDialog et ConfirmDialog dans src/renderer/src/components/Dialog/Dialog.tsx
- ContextMenu réutilisable dans src/renderer/src/components/ContextMenu/ContextMenu.tsx
- IPC : preload dans src/preload/index.ts, handlers dans src/main/index.ts, logique git dans src/main/git-service.ts
- Types globaux dans src/renderer/src/types.ts (Window.gitAPI)
- IMPORTANT : après toute modification du preload, un redémarrage complet d'Electron est nécessaire
  (le HMR ne met à jour que le renderer)

CE QUI EST DÉJÀ IMPLÉMENTÉ (ne pas refaire) :
- Graphe de commits SVG avec lanes colorées
- Sidebar : branches locales/distantes, tags, stashes avec menus contextuels
- Toolbar : fetch, push, pull (avec auto set-upstream), nouvelle branche, toggle all branches, search
- Context menus sur commits : créer branche ici, cherry-pick, revert, reset soft/mixed/hard, créer tag, copier hash
- Checkout branche (double-clic sur la sidebar)
- Créer/supprimer/renommer branche, merge
- Créer/supprimer tag
- Créer/appliquer/pop/drop stash
- Staging/unstaging de fichiers, commit (avec amend), discard file
- Diff viewer basique (unified, sans coloration syntaxique)
- Dialogues custom PromptDialog + ConfirmDialog
- Repos récents

FEATURES À IMPLÉMENTER DANS CET ORDRE :

### FEATURE 1 — Coloration syntaxique dans le diff viewer
Fichier : src/renderer/src/components/DiffViewer/DiffViewer.tsx
Installe `npm install highlight.js` puis applique la coloration sur les lignes `+` et `-` du diff.
Ligne ajoutée : fond vert sombre (#1a3a1a), texte vert clair.
Ligne supprimée : fond rouge sombre (#3a1a1a), texte rouge clair.
Ligne de contexte : couleur #8b949e.
Header de hunk (@@ ... @@) : fond #1f2d3d, texte #58a6ff.
Garde le scroll synchronisé si tu fais du split view.

### FEATURE 2 — Vue split diff (côte à côte)
Dans DiffViewer, ajoute un toggle "Unified / Split" en haut.
En mode Split, affiche deux panneaux côte à côte : gauche = lignes supprimées, droite = lignes ajoutées.
Les lignes vides correspondent aux lignes de l'autre panneau (alignement).
Utilise un bouton simple dans le header du DiffViewer pour switcher.

### FEATURE 3 — Reflog
Dans la sidebar, ajoute une section "REFLOG" après les tags.
Backend : `git reflog --pretty=format:"%H|%gd|%gs|%ar"` → retourne les 50 dernières entrées.
Ajoute `getReflog()` dans git-service.ts, le handler IPC dans index.ts, et l'exposition dans preload.
UI : liste cliquable dans la sidebar, clic → sélectionne le commit dans le graphe (via onSelectCommit).
Chaque item affiche : icône 📋, référence (ex: HEAD@{0}), message court, date relative.

### FEATURE 4 — Historique d'un fichier (File History)
Dans le RightPanel, quand un fichier est sélectionné dans la liste des fichiers d'un commit,
ajoute un bouton "Historique" (icône horloge) à côté du nom du fichier.
Clic → ouvre un panneau/modal qui liste tous les commits qui ont touché ce fichier :
`git log --follow --pretty=format:"%H|%s|%an|%ai" -- <filepath>`
Ajoute `getFileHistory(filepath)` dans git-service.ts.
Affiche la liste dans une modale (Dialog) ou un panel latéral avec hash, message, auteur, date.
Clic sur un commit de la liste → ferme la modale et sélectionne ce commit dans le graphe principal.

### FEATURE 5 — Blame view
Dans le RightPanel/DiffViewer, ajoute un toggle "Diff / Blame".
En mode Blame, affiche git blame pour le fichier sélectionné dans le commit courant :
`git blame --porcelain <hash> -- <filepath>`
Parse la sortie porcelain pour extraire : hash court, auteur, date, numéro de ligne, contenu.
Affiche une table : [hash court] [auteur] [date] | [numéro] [ligne de code]
Le hash est cliquable → sélectionne ce commit dans le graphe.
Colore chaque bloc de lignes du même commit avec une couleur dérivée du hash (comme dans VSCode GitLens).

### FEATURE 6 — Gestion des remotes
Dans la sidebar, ajoute une section "REMOTES" après les branches distantes.
Affiche la liste des remotes avec leur URL : `git remote -v`
Menu contextuel sur un remote : "Fetch ce remote", "Renommer", "Supprimer", "Copier l'URL"
Bouton "+" dans le header de la section → PromptDialog pour ajouter un remote (nom + URL).
Ajoute dans git-service.ts : getRemotes(), addRemote(), removeRemote(), renameRemote(), fetchRemote().

### FEATURE 7 — Auto-fetch en arrière-plan
Dans App.tsx, ajoute une option (stockée dans localStorage) pour activer l'auto-fetch toutes les X minutes.
Dans la Toolbar, ajoute un petit indicateur qui montre le dernier fetch (ex: "fetched 2 min ago").
Utilise setInterval dans useEffect (cleanup sur unmount).
Quand auto-fetch est actif et réussi, rafraîchit silencieusement le graphe sans notification intrusive.
L'intervalle par défaut est 5 minutes. Pas de modal, juste un petit indicateur textuel dans la toolbar.

### FEATURE 8 — Interactive Rebase
C'est la feature la plus complexe. Voici comment l'aborder :
- Clic droit sur un commit → ajouter "⚡ Interactive Rebase depuis ici" dans le menu.
- Ouvre un modal plein-écran qui liste les commits entre HEAD et ce commit.
- Chaque ligne a : une action (pick/reword/squash/fixup/drop), le hash court, le message.
- Actions modifiables via un select dropdown sur chaque ligne.
- Les lignes sont réordonnables par drag & drop (utilise les APIs HTML5 drag & drop natives).
- Bouton "Lancer le rebase" → génère un fichier de séquence et exécute `git rebase -i` via un script.
- ATTENTION : git rebase -i ouvre normalement un éditeur. Pour l'éviter, utilise la variable
  d'environnement GIT_SEQUENCE_EDITOR=true et prépare le fichier de séquence manuellement.
- Dans git-service.ts, ajoute `interactiveRebase(baseHash, sequence)` qui :
  1. Écrit le fichier de séquence dans un fichier temporaire
  2. Lance git rebase avec GIT_SEQUENCE_EDITOR pointant vers un script qui copie ce fichier
  3. Retourne success ou l'erreur

### FEATURE 9 — Résolution de conflits
Quand un merge, cherry-pick ou rebase échoue avec des conflits :
- Détecte les fichiers en conflit via `git status` (working_dir === 'U' ou index === 'U')
- Affiche une bannière rouge dans l'app : "⚠️ X fichier(s) en conflit — Résoudre"
- Clic → ouvre un panneau de résolution pour chaque fichier conflictuel
- Utilise `git show :1:<file>` (base), `:2:<file>` (ours), `:3:<file>` (theirs)
- Affiche les 3 versions côte à côte avec les marqueurs de conflit mis en évidence
- Pour chaque bloc de conflit, boutons : "Garder le nôtre", "Garder le leur", "Garder les deux"
- Bouton "Marquer comme résolu" → `git add <file>`
- Une fois tous les fichiers résolus → bouton "Continuer le rebase/merge" → `git rebase --continue` ou `git merge --continue`

### FEATURE 10 — Command palette (Ctrl+P / Cmd+P)
Overlay global accessible via Ctrl+P (ou Cmd+P sur Mac).
Champ de recherche en haut, liste de commandes filtrées en temps réel.
Commandes disponibles : Fetch, Pull, Push, Nouvelle branche, Checkout branche (liste), Merge branche,
Créer tag, Appliquer stash, Ouvrir repo, Rafraîchir.
Navigation clavier : flèches haut/bas pour naviguer, Entrée pour exécuter, Escape pour fermer.
Style : overlay sombre centré, similaire à VSCode.

### FEATURE 11 — Notifications toast
Remplace tous les `alert()` et les messages d'erreur/succès inline par un système de toasts.
Crée un composant Toast dans src/renderer/src/components/Toast/Toast.tsx.
API : `useToast()` hook qui expose `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`.
Les toasts apparaissent en bas à droite, durée 4 secondes, disparaissent avec animation.
Erreur = rouge, succès = vert, info = bleu.
Remplace tous les usages d'alert() dans App.tsx par ce système.

### FEATURE 12 — Recherche globale dans les commits
Le champ de recherche dans la toolbar filtre déjà par message/auteur/hash.
Améliore-le pour aussi chercher dans le contenu des diffs (git log -S ou git log -G).
Ajoute un toggle "Recherche étendue" qui, quand activé, envoie la query au backend et cherche
dans le contenu des commits via `git log --all -S "<query>"`.
Limite les résultats à 100 commits, affiche un spinner pendant la recherche.
Les commits correspondants sont surlignés, les autres sont dimmed (déjà implémenté).

### FEATURE 13 — Comparaison de branches
Dans la sidebar, clic droit sur une branche → "Comparer avec branche courante".
Ouvre un panneau qui montre :
- Les commits présents dans la branche sélectionnée mais pas dans la courante (ahead)
- Les commits présents dans la courante mais pas dans l'autre (behind)
Utilise `git log --oneline <current>..<other>` et `git log --oneline <other>..<current>`.
Affiche les deux listes côte à côte dans une modale.

### FEATURE 14 — Submodules
Dans la sidebar, ajoute une section "SUBMODULES" si le repo en a.
Détecte : existence de .gitmodules.
Affiche la liste des submodules avec leur path et état (à jour / dirty / pas initialisé).
Menu contextuel : "Initialiser", "Mettre à jour", "Ouvrir dans une nouvelle fenêtre".
Commandes : `git submodule init`, `git submodule update`, `git submodule status`.

ORDRE DE PRIORITÉ si tu manques de tokens :
1-4 sont les plus importantes 
5-8 sont importantes 
9-15 sont des bonus 

STRUCTURE DES COMMITS GIT :
Utilise ce format pour chaque commit :
- feat: add <feature-name>
- fix: <description du fix>
- style: <amélioration CSS>

Lance `git log --oneline -5` à la fin pour confirmer que les commits sont bien là.
```
