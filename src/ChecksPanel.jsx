import { useEffect, useId, useRef, useState } from 'react'
import { ChartBarIcon, CheckCircleIcon, ChevronRightIcon, ExclamationTriangleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { CHECKS, checksVerdict } from './lib/checks'
import { BAR_BUTTON_CLASS, BarTapTarget, Spinner, clockTime } from './UpdatesControl'

export const CHECKS_PANEL_ID = 'checks-panel'

const STATUS_ICON = {
  pass: { Icon: CheckCircleIcon, className: 'fill-teal-700', label: 'Passed' },
  warn: { Icon: ExclamationTriangleIcon, className: 'fill-amber-600', label: 'Warning' },
  fail: { Icon: XCircleIcon, className: 'fill-red-700', label: 'Failed' },
}
const BAR_STATUS = { pass: ['text-teal-300', CheckCircleIcon], warn: ['text-amber-300', ExclamationTriangleIcon], fail: ['text-red-300', XCircleIcon] }
const ERROR_KIND = { error: 'Error', warning: 'Warning', notice: 'Notice', deprecated: 'Deprecated' }
const toolName = (id) => CHECKS.find((check) => check.id === id)?.name || id

// The bar's Checks button: the result of the last run on the button itself, or what the
// checks wait for.
export function ChecksButton({ siteReady, run, gate, open, onToggle, buttonRef }) {
  const verdict = run.state === 'done' ? checksVerdict(run.report) : null
  const [statusColor, StatusIcon] = verdict ? BAR_STATUS[verdict.status] : []
  const waitingNote = run.state === 'running'
    ? 'running…'
    : run.state === 'error'
      ? 'could not run'
      : run.state === 'idle' && siteReady && !gate.ready ? 'activate licenses first' : ''
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={CHECKS_PANEL_ID}
      disabled={!siteReady}
      title={siteReady ? 'Checks' : 'Available when setup finishes'}
      onClick={onToggle}
      className={BAR_BUTTON_CLASS}
    >
      <BarTapTarget />
      {run.state === 'running' ? <Spinner className="text-neutral-300" /> : <ChartBarIcon className="size-4 shrink-0 fill-neutral-300" />}
      <span className="max-sm:sr-only">Checks</span>
      {waitingNote && <span className="font-normal text-neutral-300 max-[1040px]:sr-only">· {waitingNote}</span>}
      {verdict && (
        <span className={`inline-flex items-center gap-1 ${statusColor}`}>
          <StatusIcon className="size-3.5 shrink-0 fill-current" />
          {verdict.short.replace(/ .*/, '')}
          <span className="max-sm:sr-only">{verdict.short.replace(/^\d+/, '')}</span>
        </span>
      )}
    </button>
  )
}

function CheckRow({ check, onOpenCheck }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const { Icon, className, label } = STATUS_ICON[check.status]
  const valueColor = { fail: 'text-red-700', warn: 'text-amber-700', pass: 'text-neutral-600' }[check.status]
  return (
    <li className="border-neutral-950/10 not-first:border-t">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen(!open)}
        className="group flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
      >
        <Icon className={`size-4 shrink-0 ${className}`} aria-hidden="true" />
        <span className="sr-only">{label}:</span>
        <span className="shrink-0 font-medium">{check.name}</span>
        <span className={`min-w-0 flex-1 truncate text-right tabular-nums ${valueColor}`}>{check.value}</span>
        <ChevronRightIcon className="size-4 shrink-0 fill-neutral-400 transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </button>
      <div id={detailsId} hidden={!open} className="pr-2 pb-3.5 pl-8.5 text-sm/5 text-neutral-600">
        <p className="max-w-[46ch] text-pretty">{check.details}</p>
        {(check.errors || []).map((entry, index) => (
          <p key={index} className="mt-2 rounded-md bg-neutral-50 px-2.5 py-1.5 font-mono text-xs/5 text-neutral-950 ring-1 ring-neutral-950/10 [overflow-wrap:anywhere]">
            {ERROR_KIND[entry.kind] || 'Error'}: {entry.message}
            {entry.file && <span className="block text-neutral-500">{entry.file}, line {entry.line}</span>}
          </p>
        ))}
        <button
          type="button"
          onClick={() => onOpenCheck(check.tool)}
          className="relative mt-2.5 inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm/5 font-medium text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-1/2" aria-hidden="true" />
          Open in {toolName(check.tool)}
        </button>
      </div>
    </li>
  )
}

function CheckGroup({ title, checks, onOpenCheck }) {
  if (!checks.length) return null
  return (
    <>
      <h4 className="mt-3 flex min-h-9 items-center gap-1.5 px-2 text-sm/5 font-semibold text-neutral-600 tabular-nums">
        {title} <span className="font-normal text-neutral-500">{checks.length}</span>
      </h4>
      <ul role="list">{checks.map((check) => <CheckRow key={check.id} check={check} onOpenCheck={onOpenCheck} />)}</ul>
    </>
  )
}

function PassedGroup({ checks, onOpenCheck }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (!checks.length) return null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="group mt-3 flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm/5 font-semibold text-neutral-600 tabular-nums hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
      >
        <ChevronRightIcon className="size-4 shrink-0 fill-neutral-400 transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        Passed <span className="font-normal text-neutral-500">{checks.length}</span>
      </button>
      <ul role="list" id={listId} hidden={!open}>{checks.map((check) => <CheckRow key={check.id} check={check} onOpenCheck={onOpenCheck} />)}</ul>
    </>
  )
}

const VERDICT_BOX = { pass: 'bg-teal-50 text-teal-800', warn: 'bg-amber-50 text-amber-800', fail: 'bg-red-50 text-red-700', wait: 'bg-neutral-100 text-neutral-950' }
const TILE_LABELS = ['Page time', 'Memory', 'Queries', 'PHP errors']

// The Checks panel beside the WordPress frame: one verdict, four numbers, then each check,
// failures first. It never opens by itself.
export function ChecksPanel({ checks, run, gate, onRun, onClose, onOpenCheck }) {
  const panelRef = useRef(null)
  const running = run.state === 'running'
  const report = run.state === 'done' ? run.report : null
  const verdict = report ? checksVerdict(report) : null

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const tileClass = (status) => (status === 'fail' ? 'ring-red-700/30' : 'ring-neutral-950/10')
  const tileValueClass = (status) => (status === 'fail' ? 'text-red-700' : status === 'warn' ? 'text-amber-700' : 'text-neutral-950')
  const meta = running ? 'Measuring this page…' : report ? `${run.title || 'This page'} · ${clockTime(run.time)}` : checks.map((check) => check.name).join(' + ')

  let verdictBody
  if (running) {
    verdictBody = (
      <>
        <Spinner className="mt-1" />
        <div>
          <p className="text-base/6 font-semibold">Running checks…</p>
          <p className="text-sm/5 text-neutral-600">{checks.map((check) => check.name).join(', then ')}</p>
        </div>
      </>
    )
  } else if (verdict) {
    const VerdictIcon = STATUS_ICON[verdict.status].Icon
    verdictBody = (
      <>
        <VerdictIcon className="mt-0.5 size-5 shrink-0 fill-current" aria-hidden="true" />
        <div>
          <p className="text-base/6 font-semibold">{verdict.headline}</p>
          <p className="text-sm/5 text-neutral-600 tabular-nums">
            <b className="font-semibold text-neutral-950">{report.passed}</b> passed · <b className={`font-semibold ${report.warnings ? 'text-amber-700' : 'text-neutral-950'}`}>{report.warnings}</b> {report.warnings === 1 ? 'warning' : 'warnings'} · <b className={`font-semibold ${report.failed ? 'text-red-700' : 'text-neutral-950'}`}>{report.failed}</b> failed · took {Math.max(1, Math.round(run.took))} s
          </p>
        </div>
      </>
    )
  } else if (run.state === 'error') {
    verdictBody = (
      <>
        <XCircleIcon className="mt-0.5 size-5 shrink-0 fill-red-700" aria-hidden="true" />
        <div>
          <p className="text-base/6 font-semibold">The checks could not run</p>
          <p className="text-sm/5 text-pretty text-neutral-600">{run.message}</p>
        </div>
      </>
    )
  } else {
    verdictBody = (
      <>
        <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 fill-amber-600" aria-hidden="true" />
        <div>
          <p className="text-base/6 font-semibold">{gate.ready ? 'Not run yet' : 'Activate licenses first'}</p>
          <p className="text-sm/5 text-neutral-600 tabular-nums">{gate.ready ? 'Measures the page open in WordPress.' : `${gate.active} of ${gate.total} active. Checks start by themselves when every license is active.`}</p>
        </div>
      </>
    )
  }

  return (
    <aside
      ref={panelRef}
      id={CHECKS_PANEL_ID}
      aria-label="Checks"
      tabIndex={-1}
      className="checks-panel-enter absolute inset-y-0 right-0 z-10 flex w-[min(25rem,100%)] flex-col bg-white text-base/7 text-neutral-950 shadow-[-1px_0_0_rgb(10_10_10/0.1),-12px_0_32px_rgb(0_0_0/0.08)] outline-none max-sm:shadow-none sm:text-sm/6"
    >
      <div className="flex items-center gap-2 border-b border-neutral-950/10 py-2.5 pr-2.5 pl-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem]/6 font-semibold">Checks</h3>
          <p className="truncate text-xs/5 text-neutral-500 tabular-nums">{meta}</p>
        </div>
        <button
          type="button"
          aria-disabled={running}
          onClick={() => { if (!running) onRun() }}
          className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 py-1.5 text-sm/5 font-medium whitespace-nowrap text-neutral-800 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 aria-disabled:cursor-default aria-disabled:text-neutral-500 aria-disabled:hover:bg-white pointer-coarse:min-h-11"
        >
          {running ? 'Running…' : report || run.state === 'error' ? 'Run again' : 'Run checks'}
        </button>
        <button
          type="button"
          aria-label="Close Checks"
          onClick={onClose}
          className="relative grid size-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <span className="absolute -inset-1.5" aria-hidden="true" />
          <XMarkIcon className="size-4 fill-current" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div aria-live="polite" className={`flex items-start gap-2.5 rounded-[0.625rem] p-3 ${VERDICT_BOX[running || !verdict ? (run.state === 'error' ? 'fail' : 'wait') : verdict.status]}`}>
          {verdictBody}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 max-[350px]:grid-cols-2">
          {(report ? report.tiles : TILE_LABELS.map((label) => ({ id: label, label, value: '–', status: 'wait' }))).map((tile) => (
            <div key={tile.id} className={`min-w-0 rounded-lg px-2.5 py-2 ring-1 ${tileClass(tile.status)}`}>
              <p className="truncate text-xs/5 text-neutral-500">{tile.label}</p>
              <p className={`text-lg/6 font-semibold whitespace-nowrap tabular-nums ${tile.status === 'wait' ? 'text-neutral-300' : tileValueClass(tile.status)}`}>{tile.value}</p>
            </div>
          ))}
        </div>
        {report && (
          <>
            <CheckGroup title="Failed" checks={report.checks.filter((check) => check.status === 'fail')} onOpenCheck={onOpenCheck} />
            <CheckGroup title="Warnings" checks={report.checks.filter((check) => check.status === 'warn')} onOpenCheck={onOpenCheck} />
            <PassedGroup checks={report.checks.filter((check) => check.status === 'pass')} onOpenCheck={onOpenCheck} />
          </>
        )}
      </div>
    </aside>
  )
}
