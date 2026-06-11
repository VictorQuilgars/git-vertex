# Git Vertex — Roadmap & Fonctionnalités

Ce fichier suit l'évolution de Git Vertex vers une expérience complète et performante de gestion Git.

---

## 🚀 Prochaines fonctionnalités (À implémenter)

### Intégrations externes (reste à faire)
- [ ] **Support Git LFS :** Visualisation des fichiers trackés par LFS et gestion des locks. (Nécessite git-lfs installé ; détection via `.gitattributes` + `git lfs ls-files`.)
- [ ] **Intégration Jira :** Lier les commits/branches à des tickets Jira (la partie GitHub Issues est faite).

---

## ✅ Fonctionnalités implémentées

### Productivité & Sécurité
- **Bouton "Undo"** : Annule la dernière action Git (Ctrl+Z / toolbar) via `undoLastAction`.
- **Auto-Stash au checkout** : Option dans les settings (Comportement) ; stashe/restaure automatiquement.
- **Profils / identités** : Enregistrer plusieurs identités (nom + email), basculer en un clic (Settings → Git).
- **Signatures GPG** : Badge de signature dans le graphe (vert/rouge/ambre) + option pour signer les commits (`-S`).

### Visualisation & Gestion des fichiers
- **Vue Tree vs List** : Bascule liste plate / arborescence dans le staging.
- **Syntax highlighting dans le diff** : Coloration via highlight.js selon l'extension.
- **Solo / Mute de branches** : Clic droit sur une branche → Solo (afficher seule) ou Masquer du graphe.
- **Staging partiel** : Indexer/désindexer par bloc (hunk) ou ligne par ligne dans la diff centrale.

### Intégrations & UX
- **Liens GitHub Issues/PRs** : Les références `#123` dans les messages de commit (graphe + panneau de détail) deviennent cliquables, avec tooltip au survol (titre + état Ouvert/Fermé/Mergé via l'API GitHub, cache en session).
- **Avatars Gravatar des auteurs** : Image Gravatar dans le graphe, fallback initiales colorées.
- **Éditeur de Diff/Merge externe** : Commande configurable (code, subl, meld…) ; bouton dans le résolveur de conflits.
- **Raccourcis clavier** : F5/Ctrl+R = refresh, Ctrl+Z = undo, Ctrl+P = command palette.

### Graphe & Navigation
- **Graphe de commits moderne** : Lignes courbées GitKraken-style, couleurs distinctes par branche, commits ancêtres partagés sur la bonne couleur.
- **Ordre chronologique des commits** : `--date-order` pour un affichage temporel fidèle comme GitKraken.
- **Grisage des commits hors branche** : Quand un commit est sélectionné, les commits sur d'autres branches sont atténués.
- **Drag & Drop de branches** : Glisser une branche sur un commit pour merger, rebaser ou reset.
- **Recherche/Filtre** : Filtrage en temps réel des commits par message, auteur ou SHA.
- **Onglets Multi-repo** : Navigation entre plusieurs dépôts ouverts simultanément.
- **Toggle du right panel** : Cliquer à nouveau sur un commit ou le nœud WIP ferme le panneau.
- **Auto-refresh** : fs.watch sur `.git` et le working tree — l'UI se met à jour automatiquement sans cliquer sur refresh.
- **Layout colonnes GitKraken** : BRANCH/TAG | GRAPH | MESSAGE | AUTHOR | DATE | SHA avec redimensionnement.

### Menus Contextuels (Clic Droit)
- **Sur les Commits** : Checkout, Create branch/tag, Reset, Edit message, Revert, Drop, Move, Compare, Select for compare.
- **Sur les Branches (Sidebar)** : Rename, Delete, Merge, Rebase, Push, Set upstream, Copy name.
- **Compare deux commits** : Sélectionner un commit de base puis comparer avec un autre.

### Gestion des Conflits (Merge Tool)
- **Détection automatique** : ConflictPanel affiché dès qu'un conflit est détecté, StagingView avec boutons Abort/Commit & Merge quand tout est résolu.
- **Merge tool 3 panneaux** : Ours | Theirs | Output avec blocs cliquables, sélection ordonnée (A puis B ou B puis A).
- **Contenu ancêtre commun** : L'output est pré-rempli avec le contenu de base (git stage 1 ou section |||||||).
- **Lignes colorées dans l'output** : Bleu (A), jaune (B), violet (base), blanc (commun).
- **Boutons Tout A / Tout B** : Sélectionner/désélectionner tous les chunks d'un côté en un clic.
- **Auto-avance** : Passe automatiquement au fichier suivant après résolution.
- **Validation des markers** : Bloque la sauvegarde si des markers `<<<<<<<` restent en mode édition manuelle.
- **Blocage navigation** : Impossible de changer d'onglet repo pendant un conflit.
- **Message de merge pré-rempli** : getMergeMessage() remplace le SHA par le nom de branche si disponible.

### Outils Avancés
- **Gitflow** : Initialisation et gestion des branches feature, release et hotfix.
- **Worktrees** : Gestion complète des arbres de travail secondaires (Sidebar).
- **Command Palette (Ctrl+P)** : Accès rapide à toutes les commandes via recherche fuzzy.
- **Gestion des Stashes** : Liste, Apply, Pop et Drop directement depuis la sidebar.
- **Interactive Rebase** : Squash, reorder, drop via interface graphique.
- **Notifications Bureau** : Alertes pour les fetch, commits réussis et mises à jour.
- **Reflog** : Visualisation de l'historique complet des actions git.
- **Submodules** : Détection, init et update depuis la sidebar.
- **Remotes** : Ajout, suppression, renommage depuis la sidebar.

### UI & Diff
- **Éditeur de conflits 3-way** : Interface dédiée pour résoudre les conflits de fusion ligne par ligne.
- **Diff Viewer** : Vue inline avec coloration des changements (+/-).
- **Diff entre 2 commits** : Sélectionner deux commits et voir les différences.
- **Commit Panel** : Zone de staging et de commit avec génération de messages par IA (Anthropic, Google, Groq, OpenAI).
- **Blame & File History** : Voir qui a modifié chaque ligne et l'historique d'un fichier.
- **GitHub integration** : PRs, Issues, clone, OAuth.
- **Auto-updater** : Mise à jour automatique de l'application.

---

## Contexte technique

- **Stack** : Electron + React + TypeScript, electron-vite.
- **Pattern IPC** : `ipcMain.handle` → `ipcRenderer.invoke` → `window.gitAPI`.
- **Design** : Dark theme GitHub-style, CSS modules par composant.
- **Opérations Git** : `simple-git` wrapping le binaire git.
