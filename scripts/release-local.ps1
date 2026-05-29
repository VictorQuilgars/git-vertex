# release-local.ps1 — Windows equivalent of release-local.sh
# Usage: $env:GH_TOKEN="ton_token"; .\scripts\release-local.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:GH_TOKEN) {
    Write-Error "GH_TOKEN non défini. Lance : `$env:GH_TOKEN='ton_token'"
    exit 1
}

# Derive next patch version from latest git tag (e.g. v1.1.13 -> 1.1.14)
$latestTag = git tag --sort=-version:refname | Where-Object { $_ -match '^v' } | Select-Object -First 1
if (-not $latestTag) {
    Write-Error "Aucun tag trouvé"
    exit 1
}

$version = $latestTag.TrimStart('v')
$parts = $version.Split('.')
$newVersion = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"

Write-Host "📦 $latestTag → $newVersion"

# Bump version in package.json, commit and tag
npm version $newVersion --no-git-tag-version
git add package.json
git commit -m "chore: bump version to $newVersion"
git tag "v$newVersion"
git push origin main
git push origin "v$newVersion"

Write-Host "🚀 Publication de v$newVersion..."
npm run package -- --win --publish always

Write-Host "✅ v$newVersion publié sur GitHub"

# Clean up local build artifacts
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Write-Host "🧹 Dossier dist/ nettoyé"
