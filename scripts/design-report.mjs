import { readFileSync } from 'node:fs'

const assets = new URL('./design-report-assets/', import.meta.url)
const font = (name) => readFileSync(new URL(name, assets)).toString('base64')
const styles = readFileSync(new URL('./design-report.css', import.meta.url), 'utf8')
const fonts = `
@font-face { font-family: Inter; font-style: normal; font-weight: 400 650; font-display: swap; src: url(data:font/woff2;base64,${font('inter-latin.woff2')}) format('woff2'); }
@font-face { font-family: "Instrument Serif"; font-style: normal; font-weight: 400; font-display: swap; src: url(data:font/woff2;base64,${font('instrument-serif-latin.woff2')}) format('woff2'); }
`

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const ICON = {
  ok:   '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6.5 10.2 2.4 2.4 4.6-5"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.2 17.6 16.2H2.4z"/><path d="M10 8.2v3.4M10 13.8v.01"/></svg>',
  bad:  '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m7.4 7.4 5.2 5.2m0-5.2-5.2 5.2"/></svg>',
  idle: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M6.5 10h7"/></svg>',
  knob: '<svg class="icon" viewBox="0 0 22 22" aria-hidden="true"><path d="m9 6.5-4.5 4.5L9 15.5"/><path d="m13 6.5 4.5 4.5-4.5 4.5"/></svg>',
}

const pct = (n) => `${Math.floor(n * 10) / 10}%`
const ms = (s) => { const v = s * 1000; return v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`; }
const mb = (b) => `${Math.round(b / 1048576)} MB`
const device = (w) => (w <= 600 ? 'phone' : 'desktop')
const when = (iso) => Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC' : 'Not recorded'
const took = (a, b) => { if (!Number.isFinite(Date.parse(a)) || !Number.isFinite(Date.parse(b))) return 'not recorded'; const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; }
const stage = (s) => ({ completed: 'Done', running: 'Running', blocked: 'Stopped', paused: 'Paused', 'not-run': 'Not run' })[s] || 'Not run'
const stageTone = (s) => (s === 'completed' ? 'ok' : s === 'blocked' ? 'bad' : s === 'paused' ? 'warn' : 'idle')

function plainMiss(text, picturesDiffer) {
  let m
  if (/^article element semantics[.!]?$/i.test(text)) return { title: 'The cards are plain boxes, not “article” sections', why: 'Screen readers and search engines get a smaller hint about what each card is. It looks the same.', visible: false, kind: 'block-limit' }
  if ((m = text.match(/^(\d+)px: ([\d.]+)% of pixels differ/))) return { title: `On the ${device(+m[1])}, ${+m[2]}% of the picture is different`, why: 'Compare the two pictures above to see where.', visible: true }
  if ((m = text.match(/Horizontal overflow at (\d+)px/))) return { title: `On the ${device(+m[1])}, the page scrolls sideways`, why: 'Something is wider than the screen.', visible: true }
  if ((m = text.match(/Missing required text: (.+)/))) return { title: `Text is missing: “${m[1]}”`, why: 'The copy dropped words that are in the original.', visible: true }
  if (picturesDiffer && /box-sizing|body margin|viewport metadata/i.test(text)) {
    const title = /body margin/i.test(text) ? 'The space around the page may differ'
      : /box-sizing/i.test(text) ? 'Boxes may be sized differently'
        : 'The phone may show the page at the wrong size'
    return { title, why: 'The pictures differ. Compare them above to check the spacing, sizing and phone layout.', visible: true }
  }
  if (/not rebuilt as an H1/i.test(text)) return { title: 'The main title is not a proper heading', why: 'Blocks can set the page title. This rebuild used the wrong heading level, which changes its meaning for screen readers and search engines.', visible: false, kind: 'semantic' }
  return { title: text, why: 'The AI reported this detail. Check the pictures and original wording to assess its effect.', visible: false, kind: 'unclassified' }
}

function scoreCard(vm) {
  const failed = !vm.captures.length
  const rows = failed
    ? ['Desktop', 'Phone'].map((l) => `<div class="size-row"><dt>${l}</dt><dd class="muted">—</dd><dd class="muted">Not run</dd></div>`)
    : vm.captures.map((c) => {
        const tone = c.match >= 99 ? 'ok' : 'warn'
        return `<div class="size-row"><dt>${device(c.width) === 'phone' ? 'Phone' : 'Desktop'}</dt>
          <dd class="meter" data-tone="${tone}" style="--w:${c.match}%" aria-hidden="true"><i></i></dd>
          <dd>${pct(c.match)}</dd></div>`
      })
  return `<div class="card score" role="group" aria-label="Picture match">
    <p class="eyebrow">Picture match</p>
    <p class="score-num num">${failed ? '—' : `${pct(vm.lowest).slice(0, -1)}<small>%</small>`}</p>
    <p class="score-note">${failed ? vm.rebuilt ? 'No score. The page was rebuilt, but picture capture did not finish.' : 'No score. The page has not been rebuilt.' : 'of the original’s pixels also look the same in the copy. 99% or more counts as the same.'}</p>
    <dl class="sizes">${rows.join('')}</dl>
  </div>`
}

function compareSection(vm, state) {
  if (!vm.captures.length) {
    return `<section aria-labelledby="h-compare">
      <div class="section-head"><div><h2 id="h-compare">Side by side</h2></div></div>
      <div class="card compare-card"><div class="stage"><div class="empty">
        <h3>No pictures were taken</h3>
        <p>${vm.rebuilt ? 'The page was rebuilt, but picture capture did not finish.' : 'The pictures appear here once the page has been rebuilt and both versions captured.'}</p>
      </div></div></div></section>`
  }
  const identical = vm.captures.every((c) => c.match === 100)
  const hint = state.compare === 'slide'
    ? (identical ? 'Drag the handle to compare. At 100% you won’t see anything change.' : 'Drag the handle to reveal the original on the left and the copy on the right.')
    : 'The original and the copy, next to each other.'
  return `<section aria-labelledby="h-compare">
    <div class="section-head">
      <div><h2 id="h-compare">Side by side</h2><p class="muted small" id="hint">${hint}</p></div>
      <div class="controls">
        <fieldset class="seg" id="view"><legend class="sr">Screen size</legend>
          <label><input type="radio" name="view" value="desktop" ${state.view === 'desktop' ? 'checked' : ''} ${vm.captures.some((c) => device(c.width) === 'desktop') ? '' : 'disabled'}>Desktop <span class="sub">${vm.captures.some((c) => device(c.width) === 'desktop') ? '1440' : 'not captured'}</span></label>
          <label><input type="radio" name="view" value="phone" ${state.view === 'phone' ? 'checked' : ''} ${vm.captures.some((c) => device(c.width) === 'phone') ? '' : 'disabled'}>Phone <span class="sub">${vm.captures.some((c) => device(c.width) === 'phone') ? '390' : 'not captured'}</span></label>
        </fieldset>
        <fieldset class="seg" id="compare"><legend class="sr">How to compare</legend>
          <label><input type="radio" name="compare" value="slide" ${state.compare === 'slide' ? 'checked' : ''}>Slide</label>
          <label><input type="radio" name="compare" value="side" ${state.compare === 'side' ? 'checked' : ''}>Side by side</label>
        </fieldset>
      </div>
    </div>
    <div class="card compare-card">
      <div class="stage" id="stage">${stageHTML(vm, state)}</div>
      <div class="compare-foot" id="foot">${footHTML(vm, state)}</div>
    </div>
    <noscript>
      <div class="card static-comparison">${vm.captures.map((c) => `<section><h3>${c.width} px</h3><div class="static-pair">
        ${[['Original', c.reference], ['Gutenberg copy', c.rebuilt]].map(([label, file]) => `<figure><figcaption><a href="${esc(file)}">Open ${label.toLowerCase()} at ${c.width} px</a></figcaption><img src="${esc(file)}" width="${c.width}" height="${c.height}" alt="${label} at ${c.width} pixels wide"></figure>`).join('')}
      </div></section>`).join('')}</div>
    </noscript>
  </section>`
}

function stageHTML(vm, state) {
  const c = vm.captures.find((x) => device(x.width) === state.view)
  if (!c) return `<div class="empty"><p>${state.view === 'phone' ? 'Phone' : 'Desktop'} capture did not finish.</p></div>`
  const alt = (what) => `${what} at ${c.width} pixels wide`

  if (state.compare === 'slide') {
    return `<div class="viewer" data-view="${state.view}" style="--ar:${c.width}/${c.height};--pos:${state.pos}%" id="viewer">
      <img class="copy" src="${esc(c.rebuilt)}" width="${c.width}" height="${c.height}" alt="${esc(alt('The Gutenberg copy'))}" draggable="false">
      <img class="orig" src="${esc(c.reference)}" width="${c.width}" height="${c.height}" alt="${esc(alt('The original sample'))}" draggable="false">
      <span class="tag l">Original</span><span class="tag r">Gutenberg copy</span>
      <div class="divider"><div class="knob" id="knob" role="slider" tabindex="0" aria-label="Reveal the original on the left and the Gutenberg copy on the right" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.pos)}" aria-valuetext="${Math.round(state.pos)}% original">${ICON.knob}</div></div>
    </div>`
  }
  return `<div class="side" data-view="${state.view}">
    <figure><figcaption>Original</figcaption><div class="viewer" data-view="${state.view}" style="--ar:${c.width}/${c.height}"><img src="${esc(c.reference)}" width="${c.width}" height="${c.height}" alt="${esc(alt('The original sample'))}"></div></figure>
    <figure class="copy-shot"><figcaption>Gutenberg copy</figcaption><div class="viewer" data-view="${state.view}" style="--ar:${c.width}/${c.height}"><img class="copy" src="${esc(c.rebuilt)}" width="${c.width}" height="${c.height}" alt="${esc(alt('The Gutenberg copy'))}"></div></figure>
  </div>`
}

function footHTML(vm, state) {
  const c = vm.captures.find((x) => device(x.width) === state.view)
  if (!c) return `<div class="empty"><p>${state.view === 'phone' ? 'Phone' : 'Desktop'} capture did not finish.</p></div>`
  return `<span><strong class="num">${pct(c.match)}</strong> match at ${c.width} px wide</span>
    <span class="num">${c.changedPixels.toLocaleString('en')} of ${c.pixels.toLocaleString('en')} pixels are different${c.overflow ? ' · page scrolls sideways' : ''}</span>`
}

function missesSection(vm) {
  const n = vm.items.length
  const intro = !n ? 'No missing details were recorded.'
    : vm.visibleCount ? 'Where the copy differs from the original. Things you can see come first.'
      : 'Recorded notes from the rebuild. Their original wording is available below.'
  let body
  if (!n) {
    body = `<div class="card"><div class="empty"><h3>${vm.status === 'fail' ? 'Nothing to report' : 'Nothing was missed'}</h3><p>${vm.rebuilt ? 'No missing details were recorded. Inspect the pictures when available.' : 'The page has not been rebuilt, so there is nothing to compare.'}</p></div></div>`
  } else {
    body = `<div class="card misses" style="padding-inline:0">
      <ol>${vm.items.map((i) => `<li class="miss"><div class="miss-top"><p class="miss-title">${esc(i.title)}</p>
        <span class="pill" data-tone="${i.visible ? 'warn' : 'idle'}">${i.visible ? 'You can see it' : i.kind === 'block-limit' ? 'Not visible' : i.kind === 'semantic' ? 'Heading structure' : 'Noted by the AI'}</span></div>
        ${i.why ? `<p class="miss-why">${esc(i.why)}</p>` : ''}</li>`).join('')}</ol>
      <details class="disclose"><summary>Show the original technical wording</summary>
        <div class="tech">${vm.misses.map((m) => `<code>${esc(m)}</code>`).join('')}</div></details>
    </div>`
  }
  return `<section aria-labelledby="h-misses">
    <div class="section-head"><div><h2 id="h-misses">What it couldn’t copy ${n ? `<span class="count num">${n}</span>` : ''}</h2><p class="muted small">${intro}</p></div></div>
    ${body}</section>`
}

function testerReason(vm, tester, stopped) {
  if (tester.data.reason) return tester.data.reason
  if (vm.report.blocker) return tester.status === 'blocked' ? vm.report.blocker : `Did not run because the test stopped: ${vm.report.blocker}`
  return vm.rebuilt ? stopped : 'This test needs the rebuilt page, so it did not run.'
}

function speedCard(vm) {
  const head = `<div class="tester-head"><div><h3>Page speed</h3><p class="caption">Tested with Query Monitor</p></div>
    <span class="pill" data-tone="${stageTone(vm.qm.status)}">${ICON[stageTone(vm.qm.status)]}${stage(vm.qm.status)}</span></div>`
  if (vm.qm.status !== 'completed') {
    const why = testerReason(vm, vm.qm, 'The page was rebuilt, but the speed check did not finish.')
    return `<div class="card tester">${head}<p class="note note-box">${esc(why)}</p></div>`
  }
  const q = vm.qm.data, o = q.observations, warm = o.filter((x) => x.phase === 'warm'), last = warm[warm.length - 1]
  const max = Math.max(.001, ...o.map((x) => x.time))
  const spread = (q.warmSeconds.max - q.warmSeconds.min) * 1000
  const errs = Object.values(last.errorCounts || {}).reduce((a, b) => a + b, 0)
  return `<div class="card tester">${head}
    <div class="figure-block"><p class="figure num">${ms(q.warmSeconds.median)}</p>
      <p class="small muted">How long WordPress took to build the page. Middle result of ${warm.length} tries.</p></div>
    <div class="runs-wrap"><ul class="runs" role="img" aria-label="Time for each try: ${o.map((x) => ms(x.time)).join(', ')}">
      ${o.map((x, i) => `<li ${x.phase === 'cold' ? 'data-cold' : ''}><span class="col" style="--h:${(x.time / max) * 100}%"></span></li>`).join('')}</ul>
      <div class="labels" aria-hidden="true">${o.map((x) => `<span>${x.phase === 'cold' ? 'first' : ms(x.time).replace(' ms', '')}</span>`).join('')}</div>
      <p class="caption">Steady: every try within ${spread.toFixed(0)} ms. The first, hollow bar is the cold start.</p></div>
    <dl class="facts">
      <div><dt>Database questions</dt><dd>${last.queries} <span>· ${last.slowQueries} slow</span></dd></div>
      <div><dt>Memory used</dt><dd>${mb(last.memory)} <span>of ${mb(last.memoryLimit)}</span></dd></div>
      <div><dt>Errors and warnings</dt><dd>${errs}</dd></div>
    </dl>
    <p class="note">Measured inside the Playground sandbox, so use it to compare pages, not to predict a real server.</p>
  </div>`
}

function pluginCard(vm) {
  const head = `<div class="tester-head"><div><h3>Which plugins take the time</h3><p class="caption">Tested with Code Profiler</p></div>
    <span class="pill" data-tone="${stageTone(vm.cp.status)}">${ICON[stageTone(vm.cp.status)]}${stage(vm.cp.status)}</span></div>`
  if (vm.cp.status !== 'completed') {
    const why = testerReason(vm, vm.cp, 'The page was rebuilt, but the profiler did not finish this time.')
    return `<div class="card tester">${head}<p class="note note-box">${esc(why)}</p></div>`
  }
  const p = vm.cp.data, rows = [...p.attribution].sort((a, b) => b.seconds - a.seconds), top = Math.max(.0001, rows[0]?.seconds || 0)
  const type = { plugin: 'Plugin', 'mu-plugin': 'Always-on plugin' }
  return `<div class="card tester">${head}
    <p class="small muted">Time each plugin spent while WordPress built the page.</p>
    <ul class="plugins">${rows.map((r) => `<li class="plugin"><div class="plugin-top"><span class="plugin-name">${esc(r.name)}</span><span class="plugin-time">${ms(r.seconds)}</span></div>
      <div class="meter" style="--w:${Math.max(2, (r.seconds / top) * 100)}%;--fill:var(--accent)" aria-hidden="true"><i></i></div>
      <span class="plugin-type">${type[r.type] || esc(r.type)}</span></li>`).join('')}</ul>
    <p class="note">Query Monitor is one of the two testers, so its time is mostly the cost of measuring.</p>
    <p class="profile-id">Profile ${esc(p.profileId)} · ${esc(p.tier)} edition</p>
  </div>`
}

const BLOCK_NAMES = { 'core/group': ['Groups', 'wrap other blocks'], 'core/paragraph': ['Paragraphs', 'body text'], 'core/heading': ['Headings', 'titles'], 'core/columns': ['Column sets', 'rows of columns'], 'core/column': ['Columns', 'one cell in a row'] }
const blockTotal = (vm) => (!vm.report.design?.native ? 0 : Object.values(vm.report.design?.native?.inventory || {}).reduce((a, b) => a + b, 0))

/* Big numbers at a glance. Every figure comes from report.json; nothing is invented. */
function statsSection(vm) {
  const r = vm.report, failed = !r.design.native || r.design.native.status !== 'completed'
  const dash = '<span class="muted">—</span>'
  const total = blockTotal(vm), bad = r.design.native?.invalidBlocks
  const px = vm.captures.reduce((a, c) => a + c.pixels, 0), diff = vm.captures.reduce((a, c) => a + c.changedPixels, 0)
  const o = vm.qm.status === 'completed' ? vm.qm.data.observations : []
  const warm = o.filter((x) => x.phase === 'warm'), last = warm[warm.length - 1]
  const queued = Math.max(0, Math.round((new Date(r.startedAt) - new Date(r.job.queuedAt)) / 100) / 10)
  const cnt = (n, tenths) => `<span class="tally${tenths ? ' tenths' : ''}" style="--to:${n}"></span>`
  const u = (x) => `<small>${x}</small>`
  const dotsOf = (n) => `<div class="dots" aria-hidden="true">${Array.from({ length: Math.min(n, 30) }, (_, k) => `<i style="--d:${k}"></i>`).join('')}</div>`
  const matchPct = px ? (1 - diff / px) : 1
  const elapsed = Math.max(0, Math.round((new Date(r.finishedAt) - new Date(r.startedAt)) / 1000))
  const runMin = Math.floor(elapsed / 60), runSec = elapsed % 60
  const t = (hue, vis, sr, label, sub, tone, extra) => `<div class="card stat" data-tone="${tone || ''}" style="--hue:${hue}"><dt>${label}</dt><dd class="stat-num num"><span class="sr">${sr === 'none' ? 'No result' : sr}</span><span aria-hidden="true">${vis}</span></dd>${sub ? `<dd class="stat-sub">${sub}</dd>` : ''}${extra ? `<dd class="stat-art" aria-hidden="true">${extra}</dd>` : ''}</div>`
  const OKTICK = `<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`
  const tiles = [
    failed ? t(190, dash, 'none', 'Blocks built', 'Not rebuilt') : t(190, cnt(total), `${total}`, 'Blocks built', 'in the Gutenberg copy', '', dotsOf(total)),
    failed ? t(150, dash, 'none', 'Broken blocks', '') : t(bad === 0 ? 150 : 60, cnt(bad), `${bad}`, 'Broken blocks', bad === 0 ? 'All valid' : 'Need fixing', bad === 0 ? 'ok' : 'warn', bad === 0 ? OKTICK : ''),
    !vm.captures.length ? t(250, dash, 'none', 'Pixels compared', 'Not captured') : t(250, cnt(Math.round(px / 1e5), true) + u('million'), `${(px / 1e6).toFixed(1)} million`, 'Pixels compared', `${diff.toLocaleString('en')} different`, diff ? 'warn' : '', `<div class="meter" aria-hidden="true"><i style="--p:${matchPct}"></i></div>`),
    last ? t(35, cnt(Math.round(vm.qm.data.warmSeconds.median * 1000)) + u('ms'), `${Math.round(vm.qm.data.warmSeconds.median * 1000)} milliseconds`, 'Page build time', `middle of ${warm.length} tries`) : t(35, dash, 'none', 'Page build time', 'Not tested'),
    last ? t(310, cnt(last.queries), `${last.queries}`, 'Database questions', `${last.slowQueries} slow`, last.slowQueries ? '' : 'ok') : t(310, dash, 'none', 'Database questions', 'Not tested'),
    last ? t(85, cnt(Math.round(last.memory / 1048576)) + u('MB'), `${Math.round(last.memory / 1048576)} megabytes`, 'Memory used', `of ${Math.round(last.memoryLimit / 1048576)} MB allowed`, '', `<div class="meter" aria-hidden="true"><i style="--p:${Math.min(1, last.memory / last.memoryLimit)}"></i></div>`) : t(85, dash, 'none', 'Memory used', 'Not tested'),
    !Number.isFinite(runMin) ? t(20, dash, 'none', 'Total run time', 'Not recorded')
           : t(20, (runMin ? cnt(runMin) + u('min') + ' ' : '') + cnt(runSec) + u('s'), `${runMin ? runMin + ' min ' : ''}${runSec} seconds`, 'Total run time', Number.isFinite(queued) ? `after ${took(r.job.queuedAt, r.startedAt)} in the queue` : 'Queue time not recorded'),
    vm.captures.length ? t(215, cnt(vm.captures.length * 2), `${vm.captures.length * 2}`, 'Pictures taken', vm.captures.map((c) => c.width).join(' and ') + ' px wide', '', dotsOf(vm.captures.length * 2)) : t(215, dash, 'none', 'Pictures taken', 'None'),
  ].map((h, k) => h.replace('style="--hue:', `style="--i:${k};--hue:`))
  return `<section aria-labelledby="h-stats">
    <div class="section-head"><div><h2 id="h-stats">The run in numbers</h2><p class="muted small">The main figures from this test.</p></div></div>
    <dl class="stats">${tiles.join('')}</dl></section>`
}

/* What the copy is built from, as one bar with a plain legend. */
function mixSection(vm) {
  const inv = vm.report.design?.native?.inventory || {}, total = blockTotal(vm)
  if (!total) return ''
  const rows = Object.entries(inv).sort((a, b) => b[1] - a[1])
  const shade = (i) => `color-mix(in oklch, var(--accent) ${100 - i * 17}%, var(--sunk))`
  return `<section aria-labelledby="h-mix">
    <div class="section-head"><div><h2 id="h-mix">What the copy is built from</h2><p class="muted small">WordPress blocks are the building pieces of a page. These are the ones the AI used.</p></div></div>
    <div class="card mix-card">
      <div class="mix-head"><p class="stat-num num" style="font-family:var(--font-display);font-size:var(--fs-figure);line-height:1">${total} <small style="font-size:.45em;color:var(--ink-2);font-family:var(--font-ui)">blocks</small></p>
        <p class="small muted">${vm.report.design.native.invalidBlocks === 0 ? 'All of them are valid, so the editor opens them without warnings.' : `${vm.report.design.native.invalidBlocks} need fixing.`}</p></div>
      <div class="mix-bar" role="img" aria-label="${rows.map(([k, v]) => `${(BLOCK_NAMES[k] || [k])[0]}: ${v}`).join(', ')}">${rows.map(([k, v], i) => `<i style="--n:${v};--c:${shade(i)}"></i>`).join('')}</div>
      <ul class="mix-list">${rows.map(([k, v], i) => `<li><span class="sw" style="--c:${shade(i)}" aria-hidden="true"></span><span>${esc((BLOCK_NAMES[k] || [k])[0])} <span class="caption">· ${esc((BLOCK_NAMES[k] || ['', ''])[1])}</span></span><b>${v}</b><span class="share">${Math.round((v / total) * 100)}%</span></li>`).join('')}</ul>
    </div></section>`
}

function detailsSection(vm) {
  const r = vm.report
  return `<details class="card run-details"><summary>More about this run</summary><div class="run-body">
    <dl class="kv">
      <div><dt>Sample page</dt><dd>${esc(r.design.sample || 'Not recorded')}</dd></div>
      <div><dt>Picture score</dt><dd>Unchanged pixels with 10% RGB channel tolerance. A pixel match is not a verdict on design quality.</dd></div>
      <div><dt>Finished</dt><dd>${esc(when(r.finishedAt))} · took ${took(r.startedAt, r.finishedAt)}</dd></div>
      <div><dt>AI that rebuilt the page</dt><dd>${esc(r.ai.model)}, ${esc(r.ai.route)}</dd></div>
      <div><dt>AI cost</dt><dd>${esc(r.ai.cost || vm.ai.reason || 'Not recorded')}</dd></div>
      <div><dt>WordPress and PHP</dt><dd>${esc(r.boot?.wordpress || 'Not recorded')} · PHP ${esc(r.boot?.php || 'Not recorded')}</dd></div>
      <div><dt>Browser used for the pictures</dt><dd>Chromium ${esc(r.environment?.chromium || 'Not recorded')}</dd></div>
      <div><dt>Testers</dt><dd>Query Monitor ${esc(r.boot?.plugins?.['query-monitor/query-monitor.php'] || 'Not recorded')} · Code Profiler ${esc(r.boot?.plugins?.['code-profiler/index.php'] || 'Not recorded')}</dd></div>
      <div><dt>Cancelled network requests</dt><dd>${r.environment?.failedRequests?.length ?? 'Not recorded'}</dd></div>
      <div><dt>Run ID</dt><dd class="profile-id">${esc(r.job?.id || 'Not recorded')}</dd></div>
    </dl><details class="disclose"><summary>All recorded evidence</summary><pre class="raw">${esc(JSON.stringify(r, null, 2))}</pre></details></div></details>`
}

export function finalizeDesignReport(report) {
  const d = report.design ||= { status: 'not-run' }
  const captures = d.captures || []
  const picturesDiffer = captures.some((c) => c.match < 99 || c.overflow)
  d.missDetails = (d.misses || []).map((raw) => ({ raw, ...plainMiss(raw, picturesDiffer) }))
    .sort((a, b) => Number(b.visible) - Number(a.visible))
  const visible = d.missDetails.filter((miss) => miss.visible).length
  const completed = report.ai?.status === 'completed' && d.status === 'completed'
  const bothSizes = [1440, 390].every((width) => captures.some((c) => c.width === width && Number.isFinite(c.match)))
  report.state = !completed ? 'failed'
    : !bothSizes || picturesDiffer || visible || d.native?.invalidBlocks > 0
      || report.queryMonitor?.status !== 'completed' || report.codeProfiler?.status !== 'completed' ? 'partial' : 'passed'
  const notes = d.missDetails.length
  report.summary = report.state === 'passed' ? {
    tone: 'ok', pill: notes ? `Passed · ${notes} ${notes === 1 ? 'note' : 'notes'}` : 'Passed',
    title: 'The Gutenberg copy matches the original.',
    lead: `WordPress blocks rebuilt your sample page. Its picture match is at least 99% on desktop and on a phone.${notes ? ` ${notes} ${notes === 1 ? 'note is' : 'notes are'} listed below.` : ''}`,
  } : report.state === 'partial' ? {
    tone: 'warn', pill: 'Needs work', title: 'The copy is close, but not the same.',
    lead: visible ? `${visible} ${visible === 1 ? 'difference shows' : 'differences show'} on screen. They are listed first below.`
      : 'The page was rebuilt, but some checks are missing or need attention. See the results below.',
  } : {
    tone: 'bad', pill: report.ai?.status === 'paused' ? 'Paused · AI limit' : 'Stopped',
    title: 'The test stopped before it finished.',
    lead: report.blocker || report.ai?.reason || 'The run did not complete. See the recorded evidence below before starting another attempt.',
  }
  return report
}

function viewModel(input) {
  const report = input.state && input.summary ? input : finalizeDesignReport(structuredClone(input))
  const d = report.design || {}
  // Missing stages must remain empty, including reports saved before this page existed.
  const qm = report.queryMonitor || { status: 'not-run' }
  const cp = report.codeProfiler || { status: 'not-run' }
  const captures = (d.captures || []).filter((c) => Number.isFinite(c.match) && c.width > 0 && c.height > 0)
  return {
    report: { ...report, design: d, ai: report.ai || {}, job: report.job || {} },
    rebuilt: d.status === 'completed' || d.native?.status === 'completed',
    ai: report.ai || {}, status: { passed: 'pass', partial: 'partial', failed: 'fail' }[report.state],
    captures, items: d.missDetails || [], misses: d.misses || [],
    visibleCount: (d.missDetails || []).filter((m) => m.visible).length,
    lowest: captures.length ? Math.min(...captures.map((c) => c.match)) : null,
    qm: { status: qm.status === 'completed' && (!qm.warmSeconds || !qm.observations?.some((o) => o.phase === 'warm')) ? 'not-run' : qm.status, data: qm },
    cp: { status: cp.status === 'completed' && !cp.attribution?.length ? 'not-run' : cp.status, data: cp },
  }
}

function comparisonControls(vm, state, stageHTML, footHTML) {
  const $ = (s) => document.querySelector(s)
  function initSlider() {
    const viewer = $('#viewer'), knob = $('#knob')
    if (!viewer || !knob) return
    const set = (value) => {
      state.pos = Math.max(0, Math.min(100, value))
      viewer.style.setProperty('--pos', state.pos + '%')
      knob.setAttribute('aria-valuenow', Math.round(state.pos))
      knob.setAttribute('aria-valuetext', `${Math.round(state.pos)}% original`)
    }
    const fromPointer = (e) => {
      const box = viewer.getBoundingClientRect()
      set((e.clientX - box.left) / box.width * 100)
    }
    let dragging = false
    viewer.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || (e.pointerType === 'touch' && !knob.contains(e.target))) return
      dragging = true
      viewer.setPointerCapture(e.pointerId)
      knob.focus({ preventScroll: true })
      fromPointer(e)
    })
    viewer.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e) })
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) viewer.addEventListener(event, () => { dragging = false })
    knob.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2
      const next = { ArrowLeft: state.pos - step, ArrowDown: state.pos - step, ArrowRight: state.pos + step, ArrowUp: state.pos + step, Home: 0, End: 100 }[e.key]
      if (next === undefined) return
      e.preventDefault()
      set(next)
    })
  }
  initSlider()
  document.addEventListener('change', (e) => {
    const t = e.target
    if (t.type !== 'radio' || !['view', 'compare'].includes(t.name)) return
    state[t.name] = t.value
    $('#stage').innerHTML = stageHTML(vm, state)
    $('#foot').innerHTML = footHTML(vm, state)
    $('#hint').textContent = state.compare === 'side' ? 'The original and the copy, next to each other.'
      : vm.captures.every((c) => c.match === 100) ? 'Drag the handle to compare. At 100% you won’t see anything change.'
        : 'Drag the handle to reveal the original on the left and the copy on the right.'
    if (state.compare === 'slide') initSlider()
  })
}

const inlineJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function designReportHTML(report) {
  const vm = viewModel(report), r = vm.report, v = r.summary
  const state = { view: device(vm.captures[0]?.width || 1440), compare: 'slide', pos: 50 }
  const controls = vm.captures.length ? `<script type="module">
    const esc = ${esc.toString()}
    const pct = ${pct.toString()}
    const device = ${device.toString()}
    const ICON = ${inlineJSON({ knob: ICON.knob })}
    ;(${comparisonControls.toString()})(${inlineJSON({ captures: vm.captures })}, ${inlineJSON(state)}, ${stageHTML.toString()}, ${footHTML.toString()})
  </script>` : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Design test results · The Long View</title>
<style>${fonts}${styles}</style><noscript><style>.controls, .compare-card, #hint { display: none; }</style></noscript></head><body>
<a class="skip" href="#app">Skip to results</a>
<header class="site"><div class="wrap"><span class="brand">Techies Playground</span>
<nav aria-label="Main"><a href="https://play.techies.tools">Playground</a><a href="#app" aria-current="page">Design runs</a></nav></div></header>
<main class="wrap" id="app">
<section class="verdict" aria-labelledby="h-verdict"><div class="verdict-text">
<span class="pill" data-tone="${v.tone}">${ICON[v.tone]}${esc(v.pill)}</span>
<h1 id="h-verdict">${esc(v.title)}</h1><p class="lead">${esc(v.lead)}</p>
<p class="run-meta">${esc((r.design.sample || 'The Long View / fixed sample v1').replace(' / ', ' · '))} · ${when(r.finishedAt)} · took ${took(r.startedAt, r.finishedAt)}</p>
</div>${scoreCard(vm)}</section>
${statsSection(vm)}${compareSection(vm, state)}${missesSection(vm)}
<section aria-labelledby="h-testers"><div class="section-head"><div><h2 id="h-testers">Speed checks</h2><p class="muted small">Two testers looked at the rebuilt page.</p></div></div>
<div class="testers">${speedCard(vm)}${pluginCard(vm)}</div></section>
${mixSection(vm)}${detailsSection(vm)}
</main>${controls}</body></html>`
}
