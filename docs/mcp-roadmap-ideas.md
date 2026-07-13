# MCP — Pistes de différenciation

État des lieux (juillet 2026) : le serveur MCP (`mcp/src/index.ts`) expose 11 tools, tous en
lecture sauf le trio conflits (`resolve_conflict`, `continue_operation`, `abort_operation`).
Le vrai différenciateur déjà en place : le pont `open_in_git_vertex` — **l'agent propose,
l'humain valide dans l'éditeur visuel**, rien n'est écrit sur disque avant revue.

Objectif : se démarquer de la concurrence (git-mcp, serveur GitHub officiel…) et être
utilisable par **tous les providers IA** et les **clients open source** (Cline, Continue, Zed…).

---

## 1. Généraliser le pattern « l'agent propose, l'humain valide dans l'UI » — le moat

Le pattern existe pour les conflits ; il s'applique partout ailleurs :

- **`propose_commit`** — l'agent prépare un message + une sélection de hunks, ça ouvre la
  zone de staging de Git Vertex pré-remplie. L'utilisateur ajuste et valide.
  Aucun concurrent ne fait ça.
- **`propose_rebase_plan`** — l'agent construit un plan (squash, reorder, reword) et le
  précharge dans l'éditeur de rebase interactif existant. « Je te propose de squasher ces
  4 commits WIP » → validation visuelle.
- **`propose_split`** — découper un gros diff en commits logiques, revue hunk par hunk
  dans l'UI.

Positionnement : **« safe agentic git »** — l'agent ne touche jamais l'historique sans
passer par l'écran de revue.

## 2. Primitives MCP que 95 % des serveurs ignorent — et qui règlent le multi-provider

- **Sampling** — le serveur demande au LLM *du client* de générer du texte.
  → Génération de message de commit **sans aucune clé API** : ça marche avec Claude, GPT,
  Gemini, un modèle local Ollama… c'est le client qui fournit le modèle. Rend la feature IA
  phare 100 % provider-agnostique.
- **Elicitation** — le serveur demande une confirmation à l'utilisateur via le client MCP.
  Fallback human-in-the-loop standard quand l'app desktop n'est pas installée
  (aujourd'hui : simple demande dans le chat).
- **Resources** — exposer `git://status`, `git://log`, `git://diff/staged` comme ressources
  abonnables. Les clients open source peuvent les épingler au contexte sans appel de tool.
- **Prompts** — prompts découvrables (`/review-branch`, `/release-notes`,
  `/explain-commit`) qui apparaissent nativement dans n'importe quel client MCP.

## 3. Tools « haute altitude » que les agents adorent et que `git` brut ne donne pas

**✅ Implémentés le 12/07/2026 (mcp v0.4.0, branche `feat/mcp-power-tools`)** :
`predict_conflicts`, `git_pickaxe`, `git_bisect` (un tool, action start/good/bad/skip/reset/log),
`find_lost_work`.

- **`predict_conflicts`** — via `git merge-tree --write-tree` : prédire les conflits d'un
  merge **avant** de le faire, sans toucher le working tree. « Est-ce que merger
  `feature/x` dans `main` va conflicter, et où ? » Très différenciant, aucun serveur MCP
  git ne le fait.
- **`git_pickaxe`** — `git log -S/-G` : « quand cette fonction a-t-elle été
  introduite/supprimée ? » La question n°1 des agents qui débuggent.
- **`bisect_*`** — start/good/bad/reset. Les agents sont excellents pour piloter un bisect
  (tester, juger, itérer) ; quasi aucun serveur ne l'expose.
- **`find_lost_work`** — reflog + commits dangling : « récupère mon travail perdu », cas de
  détresse classique où un agent + l'UI de graphe brillent ensemble.

## 4. Compatibilité maximale (tous providers + open source)

- **Transport Streamable HTTP** en plus de stdio — indispensable pour les agents
  web/cloud (connectors ChatGPT, agents hébergés).
- **Tool annotations** (`readOnlyHint`, `destructiveHint`) sur chaque tool — les clients
  open source s'en servent pour auto-approuver les lectures → serveur beaucoup plus fluide
  dans Cline/Continue.
- **Publication** — registre MCP officiel, Smithery, catalogue Docker MCP : c'est là que
  les utilisateurs d'outils open source découvrent les serveurs.

---

## Par où commencer

Deux chantiers recommandés — **implémentés le 12/07/2026 (mcp v0.3.0)** :

1. ✅ **Sampling** — `generate_commit_message` : message généré par le LLM du client MCP,
   aucune clé API côté serveur ; fallback (diff + consignes) si le client ne supporte pas
   le sampling.
2. ✅ **`propose_commit` / `propose_rebase_plan`** — deep links `propose-commit` /
   `propose-rebase` vers l'app : message préchargé dans la zone de staging (+ liste de
   fichiers proposés avec indexation en un clic), plan préchargé dans l'éditeur de rebase
   interactif. Rien n'est indexé/commité/réécrit tant que l'utilisateur n'agit pas.
