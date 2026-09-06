// Real Chromium layout regression for the VS Code bundle. No Git commands run.
// Run after `node vscode-extension/build-webview.js`:
// node scripts/e2e/compact-panel.cjs
const fs = require('fs')
const path = require('path')
const os = require('os')
const assert = require('assert/strict')
const ROOT = path.resolve(__dirname, '../..')
if (!process.versions.electron) {
  const { spawnSync } = require('child_process')
  const result = spawnSync(require('electron'), [__filename], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
  process.exit(result.status ?? 1)
}
const { app, BrowserWindow } = require('electron')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertex-compact-'))
app.setPath('userData', path.join(dir, 'profile'))
const errors = []
const fixture = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file://${ROOT}/vscode-extension/media/main.css"></head><body><div id="root"></div><script>
window.testCalls=[];
window.acquireVsCodeApi=()=>({postMessage:msg=>{
  window.testCalls.push(msg.method);
  const files=['make_images.py','revise_deck.py','src/presentation/a_very_long_file_name_that_must_not_push_the_commit_button_out_of_view.py'];
  const values={
    settingsGetAll:{language:'en',theme:'vertex',rightWidth:'380'},themesInstalled:{themes:[]},
    appGetInfo:{repoName:'preview',repoPath:'/preview'},
    getBranches:{branches:[{name:'main',current:true,commit:'abc123',label:'main'}]},
    getLog:{commits:[{hash:'abc123',shortHash:'abc123',message:'almost done',author:'Victor',authorEmail:'v@example.test',date:new Date().toISOString(),parents:[],refs:['HEAD -> main']}]},
    getWorkingChanges:{staged:[{path:files[0],status:'M'}],unstaged:files.slice(1).map(path=>({path,status:'M'})),untracked:[]},
    getConflictMode:{mode:null},getConflictedFiles:{files:[]},getTags:{tags:[]},getStashes:{stashes:[]},
    getTracking:{ahead:5,behind:0,upstream:'origin/main'},getRemotes:{remotes:[]},
    getLastCommitMessage:{hash:'abc123',message:'almost done'},getMergeMessage:{message:''},
    getCommitFiles:{files:[]},getRecentAuthors:{authors:[]},avatarResolve:null,
    githubGetUser:{user:null},getGlobalConfig:{},getConfig:{},getRepoConfig:{}
  };
  setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'gitApiResult',id:msg.id,ok:true,value:(window.fixtureOverrides||{})[msg.method]??values[msg.method]??{}}})),0);
}});
</script><script src="file://${ROOT}/vscode-extension/media/main.js"></script></body></html>`
fs.writeFileSync(path.join(dir, 'index.html'), fixture)
const settle = () => new Promise(resolve => setTimeout(resolve, 180))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 254, useContentSize: true, show: false, webPreferences: { contextIsolation: true } })
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  const evalJS = code => win.webContents.executeJavaScript(code)
  const geometry = () => evalJS(`(() => {
    const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,scroll:e.scrollHeight,client:e.clientHeight}};
    return {row:!!document.querySelector('.st2--embedded-row'),files:rect('.stx-list'),form:rect('.st2-message'),button:rect('.st2-commit-actions'),right:rect('.app-right'),graph:rect('.app-center'),root:rect('.st2'),splitters:[...document.querySelectorAll('[role=separator]')].map(e=>({label:e.getAttribute('aria-label'),value:Number(e.getAttribute('aria-valuenow'))})),height:innerHeight,width:innerWidth,text:document.body.innerText};
  })()`)
  const assertCompact = async () => {
    const g = await geometry()
    assert(g.row, `horizontal mode missing: ${JSON.stringify(g)}`)
    assert(g.files.h >= 52, `files collapsed: ${JSON.stringify(g)}`)
    assert(g.form.h >= 40, 'message not usable')
    assert(g.button.bottom <= g.height + 1, 'commit outside viewport')
    assert(g.button.y >= g.form.bottom - 1, 'commit overlaps message')
    assert(g.right.right <= g.width + 1, 'panel overflows horizontally')
    return g
  }
  try {
    await win.loadFile(path.join(dir, 'index.html'))
    await new Promise(resolve => setTimeout(resolve, 750))
    await assertCompact()
    await evalJS("document.querySelectorAll('.stx-row input')[1].click()")
    await settle()
    assert(await evalJS("testCalls.includes('stage')"), 'staging checkbox lost its action')
    // A long list scrolls independently; the action bar stays pinned.
    await evalJS(`window.fixtureOverrides={getWorkingChanges:{staged:[{path:'make_images.py',status:'M'}],unstaged:Array.from({length:30},(_,i)=>({path:'src/file-'+i+'.ts',status:'M'})),untracked:[]}};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle()
    const many=await assertCompact(); assert(many.files.scroll>many.files.client)
    await evalJS(`window.fixtureOverrides={};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle()
    // Actual pointer drag: the final width, not the drag-start width, is saved.
    const drag = async (selector, dx) => {
      const point=await evalJS(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3')
      const input = (type, x, buttons) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type, x, y:point.y, button:type==='mouseMoved'?'none':'left', buttons, clickCount:1})
      await input('mouseMoved',point.x,0)
      await input('mousePressed',point.x,1)
      await input('mouseMoved',point.x+dx,1)
      await input('mouseReleased',point.x+dx,0)
      await settle()
    }
    await drag('.st2 .column-resize-handle', -65)
    assert.equal(await evalJS("localStorage.getItem('st-embedded-form-width')"),'365')
    await drag('.app-body > .column-resize-handle', 50)
    const saved=await evalJS("localStorage.getItem('gv-compact-right-width')")
    assert(Number(saved) >= 480)
    await assertCompact()
    await win.loadFile(path.join(dir, 'index.html')); await settle()
    let g=await assertCompact()
    assert.equal(Math.round(g.right.w),Number(saved))
    assert.equal(g.splitters[1].value,365)
    // Bounds are also reachable without a mouse.
    await evalJS("document.querySelector('.st2 .column-resize-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))")
    await settle(); await assertCompact()
    for (const height of [194, 184, 254]) {
      win.setContentSize(1100,height); await settle(); await assertCompact()
    }
    // The minimum horizontal shell width must still activate both columns.
    win.setContentSize(740,254); await settle(); await assertCompact()
    // Narrow windows keep a usable stacked layout, then recover saved widths.
    win.setContentSize(580,254); await settle()
    g=await geometry(); assert(g.right.right<=581)
    win.setContentSize(1100,650); await settle()
    g=await geometry(); assert(!g.row); assert.equal(Math.round(g.right.w),380)
    win.setContentSize(1100,254); await settle(); await assertCompact()
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Hide graph').click()")
    await settle(); g=await assertCompact(); assert.equal(g.graph.w,0)
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Show graph').click()")
    await settle(); await assertCompact()
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Options').click()")
    await settle()
    assert(await evalJS("document.body.innerText.includes('Signed-off-by')"),'compact options unavailable')
    await evalJS("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
    await settle()
    // Clean working trees should retain their next-steps view, not an empty grid.
    await evalJS(`window.fixtureOverrides={getWorkingChanges:{staged:[],unstaged:[],untracked:[]}};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle(); g=await geometry(); assert(!g.row); assert(!g.form)
    // Return to a balanced composition for the visual check.
    await evalJS("localStorage.setItem('st-embedded-form-width','300');localStorage.removeItem('gv-compact-right-width')")
    await win.loadFile(path.join(dir, 'index.html')); await settle()
    await assertCompact()
    fs.writeFileSync(path.join(dir,'compact.png'), (await win.webContents.capturePage()).toPNG())
    assert.equal(errors.length,0,errors.join('\n'))
    console.log('PASS compact panel: layout, pointer and keyboard resizing, persistence, narrow/tall fallback, graph toggle, options')
    console.log('Screenshot: '+path.join(dir,'compact.png'))
  } catch (error) {
    console.error(error)
    console.error('Browser errors:', errors)
    console.error(await geometry())
    process.exitCode=1
  } finally { win.destroy(); app.exit(process.exitCode || 0) }
})
