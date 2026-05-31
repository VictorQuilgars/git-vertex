# Git Vertex — Roadmap & Fonctionnalités

Ce fichier suit l'évolution de Git Vertex vers une expérience complète et performante de gestion Git.

---

## 🚀 Prochaines fonctionnalités (À implémenter)

### 1. Productivité & Sécurité
- [ ] **Bouton "Undo" (Annuler) :** Bouton dans la toolbar permettant d'annuler la dernière action Git (commit, merge, rebase, checkout) via le `reflog`.
- [ ] **Gestion des profils/identités :** Switcher facilement entre profils (Pro/Perso) pour changer l'email et le nom de l'auteur.
- [ ] **Signatures GPG :** Afficher l'état de validation des signatures sur les commits et permettre de signer les nouveaux commits.
- [ ] **Auto-Stash :** Stasher automatiquement les modifications lors d'un changement de branche et les restaurer au retour.

### 2. Visualisation & Gestion des fichiers
- [ ] **Historique de fichier & Blame :** Vue dédiée pour voir l'historique complet d'un fichier spécifique et qui a modifié chaque ligne.
- [ ] **Vue Tree vs List :** Dans le panneau de commit, permettre de basculer entre une liste plate de fichiers et une arborescence de dossiers.
- [ ] **Support des Sous-modules :** Détection, affichage dans la sidebar et actions de mise à jour/init.
- [ ] **Support Git LFS :** Visualisation des fichiers trackés par LFS et gestion des locks.

### 3. Intégrations & UX
- [ ] **Intégration Issue Trackers :** Lier les commits/branches à des tickets GitHub Issues ou Jira.
- [ ] **Avatars des auteurs :** Afficher les avatars (Gravatar ou GitHub) dans le graphe de commits.
- [ ] **Solo / Mute de branches :** Permettre de masquer ou de mettre en avant certaines branches dans le graphe pour réduire le bruit.
- [ ] **Éditeur de Diff/Merge externe :** Option pour ouvrir les conflits dans un outil tiers (VS Code, Meld, etc.).

---

## ✅ Fonctionnalités implémentées

### Graphe & Navigation
- **Graphe de commits moderne** : Lignes courbées, couleurs distinctes par branche pour une lisibilité maximale.
- **Drag & Drop de branches** : Glisser une branche sur un commit pour merger, rebaser ou reset.
- **Recherche/Filtre** : Filtrage en temps réel des commits par message, auteur ou SHA.
- **Onglets Multi-repo** : Navigation entre plusieurs dépôts ouverts simultanément.

### Menus Contextuels (Clic Droit)
- **Sur les Commits** : Checkout, Create branch/tag, Reset, Edit message, Revert, Drop, Move, Compare.
- **Sur les Branches (Sidebar)** : Rename, Delete, Merge, Rebase, Push, Set upstream, Copy name.

### Outils Avancés
- **Gitflow** : Initialisation et gestion des branches feature, release et hotfix.
- **Worktrees** : Gestion complète des arbres de travail secondaires (Sidebar).
- **Command Palette (Ctrl+P)** : Accès rapide à toutes les commandes via recherche fuzzy.
- **Gestion des Stashes** : Liste, Apply, Pop et Drop directement depuis la sidebar.
- **Notifications Bureau** : Alertes pour les fetch, commits réussis et mises à jour.

### UI & Diff
- **Éditeur de conflits** : Interface dédiée pour résoudre les conflits de fusion.
- **Diff Viewer** : Vue inline avec coloration syntaxique des changements.
- **Commit Panel** : Zone de staging et de commit avec génération de messages par IA.

---

## Contexte technique

- **Stack** : Electron + React + TypeScript, electron-vite.
- **Pattern IPC** : `ipcMain.handle` → `ipcRenderer.invoke` → `window.gitAPI`.
- **Design** : Dark theme GitHub-style, CSS modules par composant.
- **Opérations Git** : Utilisation de `simple-git`.
