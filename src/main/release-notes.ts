// Release notes shown in the "What's new" tab the first time the app opens
// after an update (like VS Code). Keyed by version — must match package.json /
// the release tag. Keep the newest entry in sync with the top of CHANGELOG.md.
export const RELEASE_NOTES: Record<string, string> = {
  '1.12.0': `## Quoi de neuf dans la 1.12.0

### 🆕 Quoi de neuf après chaque mise à jour
Cet onglet, justement : à la première ouverture après une mise à jour, Git Vertex vous montre les nouveautés — comme le fait VS Code.

### ⚙️ Réglages accessibles dès l'accueil
Les boutons **Réglages** et **profil** sont maintenant disponibles sur l'écran d'accueil, sans avoir à ouvrir un dépôt d'abord.

### ⚠️ Avertissement avant un conflit *(depuis la 1.11)*
Avant un **merge, rebase, cherry-pick, revert ou pull** (et le glisser-déposer de branches sur le graphe), Git Vertex prédit si l'opération va créer un conflit — un essai à blanc via \`git merge-tree\`, **rien n'est écrit sur le disque** — et vous prévient, avec le choix de continuer ou d'annuler. Le **rebase** est simulé commit par commit. Réglable dans *Réglages › Comportement*.
`,
}
