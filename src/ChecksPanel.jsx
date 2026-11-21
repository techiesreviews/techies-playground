import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { CHECKS, CHECKS_ARTICLE_URL, LIMIT_ROWS, STATUS_LABEL, checksByStatus, checksVerdict, formatSeconds } from './lib/checks'
import { BAR_BUTTON_CLASS, BarTapTarget, Spinner, clockTime } from './UpdatesControl'

export const CHECKS_PANEL_ID = 'checks-panel'
const INFO_ID = 'checks-scores-info'

const STATUS_ICON = { pass: CheckCircleIcon, warn: ExclamationTriangleIcon, fail: XCircleIcon }
const ICON_COLOR = { pass: 'fill-teal-700', warn: 'fill-amber-600', fail: 'fill-red-700' }
const VALUE_COLOR = { pass: 'text-neutral-600', warn: 'text-amber-700', fail: 'text-red-700' }
const BAR_STATUS = { pass: 'text-teal-300', warn: 'text-amber-300', fail: 'text-red-300' }
const toolName = (id) => CHECKS.find((check) => check.id === id)?.name || id

// The bar's Checks button: the result of the last run on the button itself, or what the
// checks wait for.
export function ChecksButton({ siteReady, run, gate, open, onToggle, buttonRef }) {
  const verdict = run.state === 'done' ? checksVerdict(run.report) : null
  const StatusIcon = verdict ? STATUS_ICON[verdict.status] : null
  const running = run.state === 'running'
  const waitsForLicenses = run.state === 'idle' && siteReady && !gate.ready
  const waitingNote = running
    ? 'running…'
    : run.state === 'error'
      ? 'could not run'
      : waitsForLicenses ? 'activate licenses first' : ''
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={CHECKS_PANEL_ID}
      disabled={!siteReady}
      title={!siteReady ? 'Available when setup finishes' : waitsForLicenses ? 'Checks · activate licenses first' : 'Checks'}
      onClick={onToggle}
      className={BAR_BUTTON_CLASS}
    >
      <BarTapTarget />
      {running ? (
        // The chart stays until the spinner shows, so a quick run does not flash it.
        <span className="grid shrink-0 place-items-center *:col-start-1 *:row-start-1">
          <ChartBarIcon className="checks-delay-out size-4 fill-neutral-300" />
          <Spinner className="checks-delay-in text-neutral-300" />
        </span>
      ) : <ChartBarIcon className="size-4 shrink-0 fill-neutral-300" />}
      <span className="max-md:sr-only">Checks</span>
      {waitsForLicenses && <ExclamationTriangleIcon className="size-3.5 shrink-0 fill-amber-300" aria-hidden="true" />}
      {waitingNote && <span className={`font-normal text-neutral-300 max-[1041px]:sr-only ${running ? 'checks-delay-in' : ''}`}>· {waitingNote}</span>}
      {verdict && (
        <span className={`inline-flex items-center gap-1 ${BAR_STATUS[verdict.status]}`}>
          <StatusIcon className="size-3.5 shrink-0 fill-current" />
          {verdict.short.replace(/ .*/, '')}
          <span className="max-md:sr-only">{verdict.short.replace(/^\d+/, '')}</span>
        </span>
      )}
    </button>
  )
}

// One row of the overview. Without a result (while the checks run) it shows a dot and a dash.
function CheckRow({ id, name, check, onOpen }) {
  const Icon = check ? STATUS_ICON[check.status] : null
  return (
    <li className="border-neutral-950/10 not-first:border-t">
      <button
        type="button"
        data-check={id}
        onClick={(event) => onOpen(id, event)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600 active:bg-neutral-100 any-pointer-coarse:min-h-12"
      >
        {check
          ? <Icon className={`size-4 shrink-0 ${ICON_COLOR[check.status]}`} aria-hidden="true" />
          : <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true"><span className="size-1.5 rounded-full bg-neutral-300" /></span>}
        {check && <span className="sr-only">{STATUS_LABEL[check.status]}:</span>}
        <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{name}</span>
        <span className={`shrink-0 whitespace-nowrap tabular-nums ${check ? VALUE_COLOR[check.status] : 'text-neutral-400'}`}>
          {check ? <Figure value={check.value} /> : <><span aria-hidden="true">–</span><span className="sr-only">running</span></>}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 fill-neutral-400" aria-hidden="true" />
      </button>
    </li>
  )
}

// A number that can roll: each digit is a window on a strip of 0 to 9 (see playFigures). The
// value is there as text for screen readers.
const STRIP = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9'
function Figure({ value }) {
  const text = String(value)
  return (
    <span className="relative inline-flex" data-figure>
      <span className="sr-only">{text}</span>
      <span className="inline-flex select-none" aria-hidden="true">
        {text.split(/(\d)/).filter(Boolean).map((part, index) => (/^\d$/.test(part)
          ? <span key={index} className="checks-digit"><span className="checks-strip" data-digit={part} style={{ transform: `translateY(-${part}0%)` }}>{STRIP}</span></span>
          : <span key={index} className="whitespace-pre">{part}</span>))}
      </span>
    </span>
  )
}

// Rolls each number that just appeared in the view from 0 to its value, row by row and digit by
// digit. A number already on screen rolls from its old value by the strip's own transition, so
// a digit that did not change stays still. Only for new results, and never with reduced motion.
function playFigures(root) {
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const figures = [...root.querySelectorAll('[data-figure]:not([data-rolled])')]
  for (const figure of figures) {
    figure.dataset.rolled = ''
    figure.dataset.still = ''
    for (const strip of figure.querySelectorAll('[data-digit]')) strip.style.transform = 'translateY(0)'
  }
  root.getBoundingClientRect()
  figures.forEach((figure, row) => {
    delete figure.dataset.still
    figure.querySelectorAll('[data-digit]').forEach((strip, column) => {
      strip.style.setProperty('--checks-roll-delay', `${row * 25 + column * 45}ms`)
      strip.style.transform = `translateY(-${strip.dataset.digit}0%)`
    })
  })
}

// The i: Good, Medium and Bad for every check, and the article that explains them.
function ScoresInfo({ open, rows }) {
  const cell = (text) => (text
    ? <td className="px-1 py-1.75 align-top text-neutral-600">{text}</td>
    : <td className="px-1 py-1.75 align-top text-neutral-400"><span aria-hidden="true">–</span><span className="sr-only">never</span></td>)
  const head = (status, word) => {
    const Icon = STATUS_ICON[status]
    return (
      <th scope="col" className="px-1 pt-1 pb-1.75 text-left text-xs font-semibold text-neutral-600">
        <span className="inline-flex flex-wrap items-center gap-1"><Icon className={`size-3.5 shrink-0 ${ICON_COLOR[status]}`} aria-hidden="true" />{word}</span>
      </th>
    )
  }
  return (
    <div
      id={INFO_ID}
      role="dialog"
      aria-label="What the scores mean"
      inert={!open}
      data-open={open ? '' : undefined}
      className="checks-info absolute inset-x-0 top-[calc(100%+0.375rem)] z-20 rounded-xl bg-white px-3 pt-3 text-neutral-950 shadow-[0_0_0_1px_rgb(10_10_10/0.1),0_2px_4px_rgb(0_0_0/0.06),0_12px_32px_rgb(0_0_0/0.16)]"
    >
      <h4 className="px-1 pb-1.5 text-sm/5 font-semibold">What the scores mean</h4>
      {/* Words break anywhere, so 200% text at 320 px stays inside the panel. */}
      <table className="w-full table-fixed border-collapse text-[0.8125rem]/[1.125rem] tabular-nums [overflow-wrap:anywhere]">
        <colgroup><col className="w-[34%]" /><col /><col /><col /></colgroup>
        <thead>
          <tr>
            <th scope="col" className="px-1 pt-1 pb-1.75 text-left text-xs font-semibold text-neutral-600">Check</th>
            {head('pass', 'Good')}
            {head('warn', 'Medium')}
            {head('fail', 'Bad')}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-neutral-950/10">
              <th scope="row" className="px-1 py-1.75 text-left align-top font-medium [overflow-wrap:anywhere]">
                {row.name}
                {row.note && <small className="block text-xs/4 font-normal text-neutral-500">{row.note}</small>}
              </th>
              {cell(row.good)}
              {cell(row.medium)}
              {cell(row.bad)}
            </tr>
          ))}
        </tbody>
      </table>
      <a
        href={CHECKS_ARTICLE_URL}
        target="_blank"
        rel="noreferrer"
        className="-mx-3 flex min-h-11 items-center gap-1.5 rounded-b-xl border-t border-neutral-950/10 px-4 text-sm/5 font-medium text-teal-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
      >
        More information
        <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 fill-current" aria-hidden="true" />
      </a>
    </div>
  )
}

const VERDICT_BOX = { pass: 'bg-teal-50 text-teal-800', warn: 'bg-amber-50 text-amber-800', fail: 'bg-red-50 text-red-700', wait: 'bg-neutral-100 text-neutral-950' }

// One check: its number, where that sits against the limits, what was found, and where the
// number came from.
function CheckDetail({ limit, check, running, onOpenCheck }) {
  const steps = [['pass', limit.good], ['warn', limit.medium], ['fail', limit.bad]].filter(([, text]) => text)
  const Icon = check ? STATUS_ICON[check.status] : null
  return (
    <>
      <h4 className="text-base/6 font-semibold">{limit.name}</h4>
      <div className="flex flex-wrap items-baseline gap-x-3">
        {running || !check ? (
          <>
            <p className="text-[2rem]/11 font-semibold tracking-[-0.02em] text-neutral-300" aria-hidden="true">–</p>
            <p className="inline-flex items-center gap-1.5 self-center text-sm/5 font-medium text-neutral-600">
              <Spinner className="checks-delay-in" />
              Running checks…
            </p>
          </>
        ) : (
          <>
            <p className="text-[2rem]/11 font-semibold tracking-[-0.02em] tabular-nums"><Figure value={check.value} /></p>
            <p className={`inline-flex items-center gap-1.5 self-center text-sm/5 font-semibold ${VALUE_COLOR[check.status]}`}>
              <Icon className="size-4 shrink-0 fill-current" aria-hidden="true" />
              {STATUS_LABEL[check.status]}
            </p>
          </>
        )}
      </div>
      <ul
        role="list"
        aria-label={`Limits for ${limit.name}`}
        className="mt-2 grid auto-cols-fr grid-flow-col overflow-hidden rounded-lg text-[0.8125rem]/[1.125rem] tabular-nums ring-1 ring-neutral-950/10 @max-[15rem]:grid-flow-row"
      >
        {steps.map(([status, text]) => {
          const here = !running && check?.status === status
          const StepIcon = STATUS_ICON[status]
          return (
            <li
              key={status}
              aria-current={here ? 'true' : undefined}
              className={`border-neutral-950/10 px-2.5 pt-1.75 pb-2 not-first:border-l @max-[15rem]:not-first:border-t @max-[15rem]:not-first:border-l-0 ${here ? VERDICT_BOX[status] : 'text-neutral-600'}`}
            >
              <p className="flex items-center gap-1 text-xs/[1.125rem] font-semibold">
                {here && <StepIcon className="size-3 shrink-0 fill-current" aria-hidden="true" />}
                {STATUS_LABEL[status]}
              </p>
              <p>{text}</p>
            </li>
          )
        })}
      </ul>
      {!running && check && (
        <>
          <p className="mt-3 max-w-[46ch] text-sm/5 text-pretty text-neutral-600">{check.details}</p>
          <p className="mt-1 max-w-[46ch] text-xs/5 text-pretty text-neutral-500">{check.source}</p>
          <Found found={check.found} />
          <p className="mt-4.5">
            <button
              type="button"
              onClick={() => onOpenCheck(check.tool)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 any-pointer-coarse:min-h-11"
            >
              Open in {toolName(check.tool)}
              <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 fill-current" aria-hidden="true" />
            </button>
          </p>
        </>
      )}
    </>
  )
}

// What the check found on the page: errors, failed calls and repeated queries as a list, plugin
// load times as a table.
function Found({ found }) {
  if (!found) return null
  if (found.type === 'table') {
    return (
      <>
        <h5 className="mt-4.5 text-sm/5 font-semibold">{found.title}</h5>
        <ul role="list" className="mt-1.5 text-sm/5">
          {found.rows.map((row, index) => (
            <li key={index} className="flex min-h-9 items-center gap-2 border-neutral-950/10 not-first:border-t">
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {row.status === 'warn' && (
                <>
                  <ExclamationTriangleIcon className="size-3.5 shrink-0 fill-amber-600" aria-hidden="true" />
                  <span className="sr-only">{STATUS_LABEL.warn}:</span>
                </>
              )}
              <span className={`shrink-0 tabular-nums ${row.status === 'warn' ? 'font-medium text-amber-700' : 'text-neutral-600'}`}>{row.value}</span>
            </li>
          ))}
        </ul>
      </>
    )
  }
  return (
    <>
      <h5 className="mt-4.5 text-sm/5 font-semibold tabular-nums">
        {found.title}{found.total !== undefined && <> <span className="font-normal text-neutral-500">{found.total}</span></>}
      </h5>
      <ul role="list" className="mt-1.5 grid gap-1.5 text-sm/5">
        {found.entries.map((entry, index) => {
          const Icon = STATUS_ICON[entry.status]
          return (
            <li key={index} className="flex gap-2 rounded-lg bg-neutral-100 px-2.5 py-2">
              <Icon className={`mt-0.5 size-4 shrink-0 ${ICON_COLOR[entry.status]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="sr-only">{STATUS_LABEL[entry.status]}:</span>
                {entry.kind && <p className="text-[0.8125rem] font-semibold">{entry.kind}</p>}
                <p className="font-mono text-xs/[1.125rem] text-neutral-950 [overflow-wrap:anywhere]">{entry.message}</p>
                {entry.where && <p className="text-xs/[1.125rem] text-neutral-500 [overflow-wrap:anywhere]">{entry.where}</p>}
              </div>
              {entry.count && <span className="shrink-0 text-neutral-600 tabular-nums">{entry.count}</span>}
            </li>
          )
        })}
      </ul>
    </>
  )
}

// The Checks panel beside the WordPress frame: the score of the page that was checked, one row
// per check with what needs fixing first, and one check at a time. It never opens by itself.
// escapeRef lets the app's Escape close the i, then the open check, before the panel.
export function ChecksPanel({ checks, run, gate, onRun, onClose, onOpenCheck, escapeRef }) {
  const panelRef = useRef(null)
  const viewsRef = useRef(null)
  const listRef = useRef(null)
  const detailRef = useRef(null)
  const infoButtonRef = useRef(null)
  const backRef = useRef(null)
  const focusAfterViewRef = useRef(null)
  const shownTimeRef = useRef(run.time)
  const [openId, setOpenId] = useState(null)
  const [info, setInfo] = useState(false)
  const running = run.state === 'running'
  const report = run.state === 'done' ? run.report : null
  const verdict = report ? checksVerdict(report) : null
  const rows = LIMIT_ROWS.filter((row) => checks.some((check) => check.id === row.tool))
  const openLimit = rows.find((row) => row.id === openId)
  const openCheck = report?.checks.find((check) => check.id === openId)
  // A check stays open across runs; the overview shows only when the check has nothing to show.
  const view = openLimit && (running || openCheck) ? 'detail' : 'list'

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // The view changed: scroll the check to its top, end an instant change once the browser has
  // the new place, and focus the way back or the row that was open.
  useLayoutEffect(() => {
    const views = viewsRef.current
    if (view === 'detail') detailRef.current.scrollTop = 0
    if (views.dataset.instant !== undefined) {
      views.getBoundingClientRect()
      delete views.dataset.instant
    }
    const target = focusAfterViewRef.current
    focusAfterViewRef.current = null
    if (target === 'back') backRef.current?.focus({ preventScroll: true })
    else if (target) listRef.current?.querySelector(`[data-check="${target}"]`)?.focus({ preventScroll: true })
  }, [view])

  // New results roll their numbers in the view that shows; reopening the panel does not.
  useLayoutEffect(() => {
    if (run.time === shownTimeRef.current) return
    shownTimeRef.current = run.time
    if (report) playFigures(view === 'detail' ? detailRef.current : listRef.current)
  }, [run.time, report, view])

  // A click outside the i closes it, and so does a click inside WordPress: the frame sends no
  // pointerdown to this page, but the window loses focus.
  useEffect(() => {
    if (!info) return undefined
    function handlePointerDown(event) {
      if (!event.target.closest(`#${INFO_ID}`) && !infoButtonRef.current?.contains(event.target)) setInfo(false)
    }
    const close = () => setInfo(false)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('blur', close)
    }
  }, [info])

  // A failed run has nothing to show in a check, so the overview takes over and stays.
  useEffect(() => {
    if (run.state !== 'error' || !openId) return
    if (detailRef.current?.contains(document.activeElement)) focusAfterViewRef.current = openId
    setOpenId(null)
  }, [run.state, openId])

  function showView(id, instant) {
    if (instant) viewsRef.current.dataset.instant = ''
    focusAfterViewRef.current = id ? 'back' : openId
    setInfo(false)
    setOpenId(id)
  }

  useEffect(() => {
    if (!escapeRef) return undefined
    escapeRef.current = () => {
      if (info) {
        setInfo(false)
        infoButtonRef.current?.focus()
        return true
      }
      if (view === 'detail') {
        showView(null, true)
        return true
      }
      return false
    }
    return () => { escapeRef.current = null }
  })

  // A click from the keyboard has no pointer: the view then changes at once.
  const byKeyboard = (event) => event.detail === 0

  let pageLine = null
  if (running) pageLine = { label: 'Checking this page…' }
  else if (report) pageLine = { label: `Page checked · ${clockTime(run.time)} · took ${formatSeconds(run.took)}`, title: run.title }
  else if (run.state === 'error') pageLine = { label: 'Could not check this page' }

  let verdictBox
  let verdictIcon
  let headline
  let subline
  if (running) {
    verdictBox = VERDICT_BOX.wait
    verdictIcon = <Spinner className="checks-delay-in" />
    headline = 'Running checks…'
    subline = <p className="mt-0.5 text-sm/5 text-neutral-600">{checks.map((check) => check.name).join(', then ')}</p>
  } else if (verdict) {
    const Icon = STATUS_ICON[verdict.status]
    verdictBox = VERDICT_BOX[verdict.status]
    verdictIcon = <Icon className="size-5 shrink-0 fill-current" aria-hidden="true" />
    headline = verdict.headline
    const count = (status, amount) => {
      const CountIcon = STATUS_ICON[status]
      return (
        <li className="inline-flex items-center gap-1.25 whitespace-nowrap">
          <CountIcon className={`size-3.5 shrink-0 ${amount ? ICON_COLOR[status] : 'fill-neutral-400'}`} aria-hidden="true" />
          <b className="font-semibold text-neutral-950"><Figure value={amount} /></b>
          {STATUS_LABEL[status]}
        </li>
      )
    }
    subline = (
      <ul role="list" className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-sm/5 text-neutral-600 tabular-nums">
        {count('pass', report.passed)}
        {count('warn', report.warnings)}
        {count('fail', report.failed)}
      </ul>
    )
  } else if (run.state === 'error') {
    verdictBox = VERDICT_BOX.fail
    verdictIcon = <XCircleIcon className="size-5 shrink-0 fill-current" aria-hidden="true" />
    headline = 'The checks could not run'
    subline = <p className="mt-0.5 text-sm/5 text-pretty text-neutral-600">{run.message}</p>
  } else {
    verdictBox = VERDICT_BOX.wait
    verdictIcon = <ExclamationTriangleIcon className="size-5 shrink-0 fill-amber-600" aria-hidden="true" />
    headline = gate.ready ? 'Not run yet' : 'Activate licenses first'
    subline = (
      <p className="mt-0.5 text-sm/5 text-pretty text-neutral-600 tabular-nums">
        {gate.ready ? 'Checks the page open in WordPress.' : `${gate.active} of ${gate.total} active. Activate them in WordPress, then the checks run.`}
      </p>
    )
  }

  const viewClass = 'checks-view absolute inset-0 overflow-auto overscroll-contain bg-white px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'

  return (
    <aside
      ref={panelRef}
      id={CHECKS_PANEL_ID}
      aria-label="Checks"
      tabIndex={-1}
      className="checks-panel-enter @container absolute inset-y-0 right-0 z-10 flex w-[min(25rem,100%)] flex-col bg-white text-base/7 text-neutral-950 shadow-[-1px_0_0_rgb(10_10_10/0.1),-12px_0_32px_rgb(0_0_0/0.08)] outline-none max-sm:shadow-none sm:text-sm/6"
    >
      <header className="border-b border-neutral-950/10 pt-2.5 pr-2.5 pb-3 pl-4">
        {/* With large text the title takes its own line above Run again and Close. */}
        <div data-checks-head className="flex flex-wrap items-center gap-2">
          <div data-checks-title className="flex min-w-0 flex-auto">
            {view === 'detail' ? (
              <button
                ref={backRef}
                type="button"
                onClick={(event) => showView(null, byKeyboard(event))}
                className="-ml-2 inline-flex min-h-9 items-center gap-0.5 rounded-lg pr-3 pl-1 text-[0.9375rem]/5 font-semibold whitespace-nowrap text-teal-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 any-pointer-coarse:min-h-11"
              >
                <ChevronLeftIcon className="size-4 shrink-0 fill-current" aria-hidden="true" />
                All checks
              </button>
            ) : <h3 className="text-[0.9375rem]/9 font-semibold">Checks</h3>}
          </div>
          <div data-checks-actions className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              aria-disabled={running}
              onClick={() => { if (!running) onRun() }}
              className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 py-1.5 text-sm/5 font-medium whitespace-nowrap text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 aria-disabled:cursor-default aria-disabled:text-neutral-500 aria-disabled:hover:bg-white any-pointer-coarse:min-h-11"
            >
              {running ? 'Running…' : report || run.state === 'error' ? 'Run again' : 'Run checks'}
            </button>
            <button
              type="button"
              aria-label="Close Checks"
              onClick={onClose}
              className="relative grid size-8 shrink-0 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              <span className="absolute -inset-1.5" aria-hidden="true" />
              <XMarkIcon className="size-4 fill-current" />
            </button>
          </div>
        </div>
        {pageLine && (
          <div className="pt-1.5 pr-0.5">
            <p className="text-xs/5 text-neutral-500 tabular-nums">{pageLine.label}</p>
            {run.path && (
              <p className="flex min-w-0 items-baseline gap-2 text-sm/5">
                {pageLine.title && <b className="max-w-3/5 shrink-0 truncate font-semibold" title={pageLine.title}>{pageLine.title}</b>}
                <span className="min-w-0 truncate font-mono text-xs text-neutral-600" title={run.path}>{run.path}</span>
              </p>
            )}
          </div>
        )}
      </header>
      <div ref={viewsRef} data-view={view} className="checks-views relative min-h-0 flex-1 overflow-clip">
        <div ref={listRef} data-checks-view="list" inert={view !== 'list'} className={viewClass}>
          <div className="relative">
            <div className={`flex items-start gap-2.5 rounded-[0.625rem] p-3 ${verdictBox}`}>
              <span className="grid h-6 w-5 shrink-0 place-items-center">{verdictIcon}</span>
              <div className="min-w-0 flex-1">
                {/* When the panel is narrow for its text (320 px at 200%), the i gets its own line. */}
                <div className="flex items-center gap-0.5 @max-[15rem]:flex-wrap">
                  <p className="min-w-0 flex-1 text-base/6 font-semibold @max-[15rem]:basis-full">{headline}</p>
                  <button
                    ref={infoButtonRef}
                    type="button"
                    aria-label="What the scores mean"
                    aria-expanded={info}
                    aria-controls={INFO_ID}
                    onClick={() => setInfo(!info)}
                    className="relative -my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-neutral-950/6 @max-[15rem]:ml-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 aria-expanded:bg-neutral-950/8 any-pointer-coarse:before:absolute any-pointer-coarse:before:-inset-1.5"
                  >
                    <InformationCircleIcon className="size-4 fill-current" aria-hidden="true" />
                  </button>
                </div>
                {subline}
              </div>
            </div>
            <ScoresInfo open={info} rows={rows} />
          </div>
          <ul role="list" className="mt-2.5">
            {report
              ? checksByStatus(report.checks).map((check) => <CheckRow key={check.id} id={check.id} name={check.name} check={check} onOpen={(id, event) => showView(id, byKeyboard(event))} />)
              : running && rows.map((row) => <CheckRow key={row.id} id={row.id} name={row.name} onOpen={(id, event) => showView(id, byKeyboard(event))} />)}
          </ul>
        </div>
        <div ref={detailRef} data-checks-view="detail" inert={view !== 'detail'} className={`${viewClass} z-1 shadow-[-1px_0_0_rgb(10_10_10/0.1)]`}>
          {openLimit && <CheckDetail limit={openLimit} check={openCheck} running={running} onOpenCheck={onOpenCheck} />}
        </div>
      </div>
    </aside>
  )
}
