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
    getLog:{commits:[{hash:'abc123',shortHash:'abc123',message:'almost done',author:'Victor',authorEmail:'v@example.test',date:new Date().toISOString(),parents:['def456'],refs:['HEAD -> main']},{hash:'def456',shortHash:'def456',message:'first light',author:'Victor',authorEmail:'v@example.test',date:new Date(Date.now()-40*864e5).toISOString(),parents:[],refs:[]}]},
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
    const rows=[...document.querySelectorAll('.gvt-row')];
    return {row:!!document.querySelector('.st2--embedded-row'),files:rect('.stx-list'),form:rect('.st2-message'),button:rect('.st2-commit-actions'),right:rect('.app-right'),graph:rect('.app-center'),root:rect('.st2'),splitters:[...document.querySelectorAll('[role=separator]')].map(e=>({label:e.getAttribute('aria-label'),value:Number(e.getAttribute('aria-valuenow')),orientation:e.getAttribute('aria-orientation')})),height:innerHeight,width:innerWidth,
      rail:rect('.gv-rail'),overlay:rect('.gv-side-overlay'),stackedBar:!!document.querySelector('.gv-stacked-bar'),toolbarRows:rows.length,
      // Every control of every toolbar row inside its row: nothing clipped at the right edge.
      toolbarFits:rows.every(r=>{const rr=r.getBoundingClientRect();return [...r.children].every(c=>c.getBoundingClientRect().right<=rr.right+1)}),
      text:document.body.innerText};
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
    const wide = await assertCompact()
    // ── The two columns are for the FILES, not for the home card ──
    // A clean tree shows one card of next steps in the same pane. It was
    // getting the whole compact treatment: a column at 73% of the panel to
    // hold it, and a *Hide graph* button offering the rest of the window.
    assert(wide.text.includes('Hide graph'), 'the graph toggle belongs to the files layout')
    await evalJS(`window.fixtureOverrides={getWorkingChanges:{staged:[],unstaged:[],untracked:[]}};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle(); await settle()
    const home = await geometry()
    assert(home.text.includes('NEXT STEPS') || home.text.includes('Next steps'), 'the home card should be showing on a clean tree')
    assert(!home.row, 'the home is one card — it must not be laid out in two columns')
    assert(home.right.w < home.width * 0.6 && home.right.w < wide.right.w - 40,
      `the home kept the files' width: ${home.right.w} of ${home.width}, files had ${wide.right.w}`)
    assert(!home.text.includes('Hide graph'), 'nothing to give the window to: no graph toggle over the home')
    assert(home.graph && home.graph.w > 100, 'the graph keeps its place beside the home')
    await evalJS(`window.fixtureOverrides={};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle(); await settle()
    const back = await assertCompact()
    assert(Math.abs(back.right.w - wide.right.w) < 2, `the files' width did not come back: ${back.right.w} vs ${wide.right.w}`)
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
    const drag = async (selector, dx, dy = 0) => {
      const point=await evalJS(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3')
      const input = (type, x, y, buttons) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type, x, y, button:type==='mouseMoved'?'none':'left', buttons, clickCount:1})
      await input('mouseMoved',point.x,point.y,0)
      await input('mousePressed',point.x,point.y,1)
      await input('mouseMoved',point.x+dx,point.y+dy,1)
      await input('mouseReleased',point.x+dx,point.y+dy,0)
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
    // By label, not by position: the minimap's height handle is a separator too,
    // and it arrived above these — which silently moved every index by one.
    assert.equal(g.splitters.find(s=>s.label==='Resize files and commit')?.value,365)
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
    // The minimap's block goes with the graph, and the body grows by its height:
    // at 360 px it started the compact layout under 300 and ended it over 300,
    // which brought the graph back, which started it again — every frame. The
    // hidden graph has to stay hidden.
    win.setContentSize(956,360); await settle()
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Hide graph').click()")
    const hiddenFor = []
    for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 120)); hiddenFor.push(await evalJS("document.querySelector('.app-center').style.display")) }
    assert.deepEqual(hiddenFor, Array(5).fill('none'), `Hide graph did not hold: ${hiddenFor}`)
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Show graph').click()")
    await settle()
    // Between a narrow column and a wide panel, the toolbar stays inside the
    // panel — it drops the sync words, then gives the search a row of its own —
    // and every action stays in the bar: none goes behind the "⋯" of the narrow
    // column's layout.
    for (const w of [1100, 1000, 956, 860, 760, 700]) {
      win.setContentSize(w, 360); await settle()
      assert(await evalJS("(()=>{const g=document.querySelector('.gvt');return g.scrollWidth<=g.clientWidth+1&&[...document.querySelectorAll('.gvt-row')].every(r=>{const rr=r.getBoundingClientRect();return [...r.children].every(c=>c.getBoundingClientRect().right<=rr.right+1)})})()"), `the toolbar runs off the panel at ${w}px`)
      assert(await evalJS("['Stash','Terminal'].every(l=>document.querySelector(`.gvt-btn[aria-label=\"${l}\"]`))"), `an action left the bar at ${w}px`)
    }
    win.setContentSize(1100,254); await settle(); await assertCompact()
    await evalJS("[...document.querySelectorAll('button')].find(b=>b.textContent==='Options').click()")
    await settle()
    assert(await evalJS("document.body.innerText.includes('Signed-off-by')"),'compact options unavailable')
    await evalJS("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
    await settle()
    // Clean working trees should retain their next-steps view, not an empty grid.
    await evalJS(`window.fixtureOverrides={getWorkingChanges:{staged:[],unstaged:[],untracked:[]}};window.dispatchEvent(new MessageEvent('message',{data:{type:'event',name:'workingChanged'}}))`)
    await settle(); g=await geometry(); assert(!g.row); assert(!g.form)
    // ── A side-bar column: narrow and tall. The rail stays, compact; the
    // toolbar folds into two rows that fit; the details go UNDER the graph
    // behind a horizontal splitter; a rail icon opens its view as a layer
    // over the graph, and Escape or a press elsewhere closes it.
    // A fresh load: the Escape above, meant for the Options menu, also
    // reached the graph and cleared its selection (see CommitGraph's key
    // handler) — a state this scenario should not inherit.
    await evalJS("localStorage.removeItem('gv-details-h')")
    await win.loadFile(path.join(dir, 'index.html')); await settle(); await settle()
    win.setContentSize(320,800); await settle(); await settle()
    g=await geometry()
    assert.equal(g.rail && Math.round(g.rail.w),36,`narrow rail missing: ${JSON.stringify(g.rail)}`)
    assert.equal(g.toolbarRows,2,'narrow toolbar should have a search row')
    assert(g.toolbarFits,'a toolbar control is clipped in the narrow column')
    assert(g.graph.w>0&&g.graph.h>=140,`graph not visible in the column: ${JSON.stringify(g.graph)}`)
    assert(g.right&&g.right.h>=140&&g.right.y>=g.graph.bottom-1,`details not under the graph: ${JSON.stringify(g.right)}`)
    assert(g.right.right<=321,'details overflow the column')
    assert(g.splitters.some(s=>s.orientation==='horizontal'),'no horizontal splitter between graph and details')
    assert(!g.overlay,'no view should float open by itself')
    await evalJS("document.querySelector('.gv-rail-btn[aria-label=\"Branches\"]').click()"); await settle()
    g=await geometry()
    assert(g.overlay&&g.overlay.w<=320-36-24+1&&g.overlay.w>=160,`floating view wrong: ${JSON.stringify(g.overlay)}`)
    assert(g.text.includes('LOCAL')||g.text.includes('Local'),'the floating view shows the branches')
    await evalJS("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await settle()
    g=await geometry(); assert(!g.overlay,'Escape should close the floating view')
    await evalJS("document.querySelector('.gv-rail-btn[aria-label=\"Branches\"]').click()"); await settle()
    g=await geometry(); assert(g.overlay,'the view reopens from the rail')
    fs.writeFileSync(path.join(dir,'sidebar-overlay.png'), (await win.webContents.capturePage()).toPNG())
    await evalJS("document.querySelector('.app-center').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); await settle()
    g=await geometry(); assert(!g.overlay,'a press on the graph should close the floating view')
    fs.writeFileSync(path.join(dir,'sidebar.png'), (await win.webContents.capturePage()).toPNG())
    // The splitter between the rows is dragged, and the height it lands on is the one remembered.
    const before=(await geometry()).right.h
    await drag('.gv-stack--rows > .column-resize-handle',0,-60)
    g=await geometry(); assert(g.right.h>before+30,`details did not grow: ${before} → ${g.right.h}`)
    assert.equal(Number(await evalJS("localStorage.getItem('gv-details-h')")),Math.round(g.right.h))
    // Narrow AND short: one pane at a time, the search behind a button.
    win.setContentSize(320,400); await settle()
    g=await geometry()
    assert(g.stackedBar,'a short column should show the details in place of the graph, with a way back')
    assert.equal(g.toolbarRows,1)
    assert(await evalJS("!!document.querySelector('.gvt-btn[aria-label=\"Search commits\"]')"),'search toggle missing in the short column')
    assert(g.toolbarFits,'a toolbar control is clipped in the short column')
    fs.writeFileSync(path.join(dir,'sidebar-short.png'), (await win.webContents.capturePage()).toPNG())
    // Back to the bottom panel: the wide layout and its saved widths return.
    win.setContentSize(1100,254); await settle(); await assertCompact()
    g=await geometry(); assert.equal(Math.round(g.rail.w),44); assert.equal(g.toolbarRows,0)
    // Return to a balanced composition for the visual check.
    await evalJS("localStorage.setItem('st-embedded-form-width','300');localStorage.removeItem('gv-compact-right-width');localStorage.removeItem('gv-details-h')")
    await win.loadFile(path.join(dir, 'index.html')); await settle()
    await assertCompact()
    fs.writeFileSync(path.join(dir,'compact.png'), (await win.webContents.capturePage()).toPNG())
    assert.equal(errors.length,0,errors.join('\n'))
    console.log('PASS compact panel: layout, the home card kept out of it, pointer and keyboard resizing, persistence, narrow/tall fallback, graph toggle that holds, a toolbar that fits, options, side-bar column')
    console.log('Screenshots: '+['compact','sidebar','sidebar-overlay','sidebar-short'].map(n=>path.join(dir,n+'.png')).join(' '))
  } catch (error) {
    console.error(error)
    console.error('Browser errors:', errors)
    console.error(await geometry())
    process.exitCode=1
  } finally { win.destroy(); app.exit(process.exitCode || 0) }
})
