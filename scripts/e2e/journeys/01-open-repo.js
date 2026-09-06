// The welcome, a repository, and one answer per IPC domain.
'use strict'
module.exports = {
  name: 'open a repository, every domain answers',
  async run({ page, expect }) {
    await page.until(`!!document.querySelector('.welcome-recent-item')`, { what: 'the welcome screen' })
    await page.click('.welcome-recent-item')
    await page.until(`!!document.querySelector('.sb-history')`, { what: 'the status bar with the loaded count' })
    expect.match(await page.eval(`document.querySelector('.sb-history').textContent`), /^3 commits loaded/, 'the status bar')
    expect(await page.eval(`!!document.querySelector('.sb-wip')`), 'the Working changes row is there')
    const calls = {
      git: `window.gitAPI.getBranches().then(r => r.branches.map(b => b.name).includes('main'))`,
      github: `window.gitAPI.githubDetectRepo().then(r => r === null || typeof r === 'object')`,
      ai: `window.gitAPI.aiListProviderModels('openai', '').then(r => 'error' in r || 'models' in r)`,
      app: `window.gitAPI.appGetInfo().then(r => typeof r.version === 'string')`,
      settings: `window.gitAPI.settingsGetAll().then(s => typeof s === 'object')`,
      themes: `window.gitAPI.themesInstalled().then(r => Array.isArray(r.themes))`,
      updater: `window.gitAPI.getUpdaterState().then(r => typeof r === 'object')`,
      deepLink: `window.gitAPI.getPendingDeepLink().then(r => r === null || typeof r === 'object')`,
    }
    for (const [domain, expr] of Object.entries(calls)) expect(await page.eval(expr), `${domain}: the handler answers`)
    expect(await page.eval(`window.gitAPI.openExternal('file:///etc/hosts').then(r => r.success === false)`), 'a file: link is refused')
  },
}
