// Release notes shown in the "What's new" tab the first time the app opens
// after an update (like VS Code). Keyed by version — must match package.json /
// the release tag. Keep the newest entry in sync with the top of CHANGELOG.md.
export const RELEASE_NOTES: Record<string, string> = {
  '1.16.0': `## Quoi de neuf dans la 1.16.0

### 🔔 Centre de notifications
- La **cloche** en haut à droite est maintenant fonctionnelle : un clic ouvre un **panneau de notifications**.
- Chaque notification peut être **marquée comme lue/non lue** ou **supprimée** ; boutons **« Tout marquer comme lu »** et **« Tout effacer »**.
- Une **pastille bleue** indique le nombre de notifications **non lues**.
- Les **mises à jour disponibles** créent automatiquement une notification, conservée entre les sessions.
`,
  '1.15.4': `## Quoi de neuf dans la 1.15.4

### 🟢 Bouton « Mise à jour » plus clair
- Quand une mise à jour est disponible, un petit **bouton « Mise à jour »** (avec libellé) s'affiche en haut à droite, à la place de la simple icône avec un point vert. Un clic ouvre l'écran de mise à jour.
`,
  '1.15.3': `## Quoi de neuf dans la 1.15.3

### 🪟 Repos récents lisibles sur Windows
- Sur l'accueil, les **repos récents** affichent maintenant le **nom du dossier** en haut et le **chemin parent** en dessous, comme sur macOS. Avant, sur Windows, seul le chemin complet s'affichait.
`,
  '1.15.2': `## Quoi de neuf dans la 1.15.2

### 🔔 Mise à jour plus discrète et plus fiable
- Une **pastille discrète** (petit point vert) apparaît à côté de la **cloche de notifications** quand une mise à jour est disponible — un clic ouvre l'écran de mise à jour. Fini le gros bouton orange.
- **Détection automatique** peu après le démarrage puis toutes les 30 minutes.
- Depuis les Réglages, « Vérifier les mises à jour » ouvre l'écran par-dessus : **« Plus tard » revient aux Réglages** (au lieu de l'accueil).
`,
  '1.15.0': `## Quoi de neuf dans la 1.15.0

### ✨ Écran de lancement animé
- Au **démarrage** (et juste après une mise à jour), une petite fenêtre affiche le **graphe en V de Git Vertex qui se dessine**, puis laisse place à l'application. Le retour de l'app après une mise à jour paraît net.

### ⬇️ Mise à jour par étapes
- Un écran clair : **disponible → téléchargement (avec pourcentage réel) → installation**.
- Le **téléchargement démarre à votre clic**, donc vous voyez vraiment sa progression ; l'installation vous indique que l'app **redémarre dans quelques instants**.
- « Vérifier les mises à jour » dans les Réglages ouvre désormais le même écran.
`,
  '1.14.2': `## Quoi de neuf dans la 1.14.2

### 🐛 Corrections
- **Windows** : le nom de l'application affiche enfin **« Git Vertex »** dans la barre de titre, la barre des tâches et Alt-Tab (au lieu de « Git GUI »).
- **Graphe des commits** : le trait pointillé du **WIP** (changements en cours) ne **traverse plus** le commit d'une autre branche — il est désormais **décalé** sur sa propre lane et ne rejoint sa branche qu'en bas.
- Plus d'avertissement **MaxListeners** dans la console : les abonnements internes (deep-link, mises à jour, connexion GitHub) ne s'accumulent plus.
`,
  '1.14.1': `## Quoi de neuf dans la 1.14.1

### 🐛 Corrections Windows
- Fini l'**assistant d'installation** qui réapparaissait à chaque mise à jour : la mise à jour s'applique désormais **en silence** puis relance l'application.
- L'**icône Git Vertex** s'affiche à nouveau dans la barre des tâches et la barre de titre.

### 🧭 Graphe des commits
- La colonne **+/−** n'est plus **coupée** par le bord droit de la fenêtre : toutes les colonnes tiennent par défaut, barre de défilement comprise.
`,
  '1.14.0': `## Quoi de neuf dans la 1.14.0

### 🚀 Nouvel écran d'accueil
- Une **page d'accueil** repensée en deux colonnes : à gauche **Ouvrir / Cloner / Créer** un dépôt, une **recherche** et vos **récents** ; à droite un panneau **Ressources** (Notes de version, Code source, Documentation).
- Nouveau : bouton **Créer** un dépôt (\`git init\`).
- L'accueil est un **onglet** que vous pouvez garder ouvert ; ouvrir un dépôt le referme, ouvrir les notes de version le laisse ouvert.

### 📝 Notes de version
- Accessibles **à tout moment** depuis *Ressources › Notes de version*, avec un lien **Ouvrir dans le navigateur**.
`,
  '1.13.0': `## Quoi de neuf dans la 1.13.0

### 🖱️ Menus du graphe repensés
- **Clic droit sur une branche = sur son commit-tip** : le même menu complet (merge/rebase/renommer/supprimer… + les actions du commit), comme GitKraken. Un commit qui ne porte pas de branche garde son menu de commit.
- **Menu plus compact** : *Réinitialiser*, *Copier* et *Déplacer* sont maintenant des **sous-menus** qui s'ouvrent au survol.
- **Glisser-déposer clarifié** : glisser une branche A sur une branche B propose *« Merger A dans B »* / *« Rebaser A sur B »* avec les **vrais noms** (plus de SHA), dans le bon sens.
- La puce de branche dans le graphe propose enfin **Merger / Rebaser** (elles manquaient).
`,
  '1.12.0': `## Quoi de neuf dans la 1.12.0

### 🆕 Quoi de neuf après chaque mise à jour
Cet onglet, justement : à la première ouverture après une mise à jour, Git Vertex vous montre les nouveautés — comme le fait VS Code.

### ⚙️ Réglages accessibles dès l'accueil
Les boutons **Réglages** et **profil** sont maintenant disponibles sur l'écran d'accueil, sans avoir à ouvrir un dépôt d'abord.

### ⚠️ Avertissement avant un conflit *(depuis la 1.11)*
Avant un **merge, rebase, cherry-pick, revert ou pull** (et le glisser-déposer de branches sur le graphe), Git Vertex prédit si l'opération va créer un conflit — un essai à blanc via \`git merge-tree\`, **rien n'est écrit sur le disque** — et vous prévient, avec le choix de continuer ou d'annuler. Le **rebase** est simulé commit par commit. Réglable dans *Réglages › Comportement*.
`,
}
