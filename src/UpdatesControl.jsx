import { useEffect, useId, useRef } from 'react'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { updatesLabel } from './lib/plugin-updates'

export const BAR_BUTTON_CLASS = 'relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1 pr-2.5 pl-1 text-sm/5 font-medium text-white tabular-nums ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white max-md:px-2.5 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:bg-white/15'

export function BarTapTarget() {
  return <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 max-sm:h-14 max-sm:w-[calc(100%+0.625rem)]" aria-hidden="true" />
}

export function Spinner({ className = '' }) {
  return <span className={`m-px size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-[spin_2.4s_linear_infinite] ${className}`} aria-hidden="true" />
}

// From 1041 px, where the note shows a name, Updates may shrink unlike the other bar
// buttons: on a full bar its name is cut before Close is pushed off the edge.
const SHRINK_WITH_NAME = 'min-[1041px]:shrink min-[1041px]:min-w-0'
const UPDATES_BUTTON_CLASS = `${BAR_BUTTON_CLASS} ${SHRINK_WITH_NAME}`

export const clockTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// The bar's Updates control: what the start-up update changed, as old → new version. It
// opens a note with every change, what failed, and what was already current.
export function UpdatesControl({ updates, open, onOpenChange, buttonRef }) {
  const wrapRef = useRef(null)
  const noteRef = useRef(null)
  const titleId = useId()
  const { label, note, noteEnd, count, failed, ready } = updatesLabel(updates)

  // The note takes focus when it opens, so arrow keys scroll a long list; Escape (App.jsx)
  // closes it and returns focus to Updates.
  useEffect(() => {
    if (open) noteRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const close = () => onOpenChange(false)
    function handleOutsidePointer(event) {
      if (!wrapRef.current?.contains(event.target)) close()
    }
    // A click inside the WordPress frame never reaches this document, but it moves focus
    // into the frame, which blurs this window.
    window.addEventListener('blur', close)
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => {
      window.removeEventListener('blur', close)
      document.removeEventListener('pointerdown', handleOutsidePointer)
    }
  }, [open, onOpenChange])

  const result = updates.state === 'done' ? updates.result : null

  return (
    <span ref={wrapRef} className={`relative flex shrink-0 ${SHRINK_WITH_NAME}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!ready}
        title={ready ? 'Updated at start' : 'Available when setup finishes'}
        onClick={() => onOpenChange(!open)}
        className={UPDATES_BUTTON_CLASS}
      >
        <BarTapTarget />
        {updates.state === 'running' ? <Spinner className="text-neutral-300" /> : <ArrowPathIcon className="size-4 shrink-0 fill-neutral-300" />}
        {/* Up to 767 px the bar buttons show their icons only, so Close stays on a full bar. */}
        <span className="shrink-0 whitespace-nowrap max-md:sr-only">{label}</span>
        {/* Up to 1040 px a change list shortens to its count. Wider, a long name is cut short,
            down to nothing on a full bar, before its versions and +N; only very long
            versions are clipped as a last resort. */}
        {(note || noteEnd) && (
          <span className={`flex min-w-0 overflow-hidden font-normal whitespace-pre text-neutral-300 ${count ? 'max-[1040px]:hidden' : 'max-md:sr-only'}`}>
            {count ? (note ? ': ' : ':') : '· '}
            <span className="min-w-0 max-w-48 truncate" title={note}>{note}</span>
            {noteEnd}
          </span>
        )}
        {count && (
          <span className="font-normal whitespace-nowrap text-neutral-300 min-[1041px]:hidden">
            <span className="max-md:sr-only">· </span>{count}
          </span>
        )}
        {failed && (
          <span className="inline-flex items-center gap-1 font-normal whitespace-nowrap text-amber-300">
            <ExclamationTriangleIcon className="size-3.5 shrink-0 fill-amber-300" aria-hidden="true" />
            <span className="sr-only">, </span>
            <span className="max-md:sr-only">{failed} failed</span>
          </span>
        )}
      </button>
      {open && (
        <div
          ref={noteRef}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={0}
          className="license-popover-enter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 absolute top-full right-0 z-60 mt-2 max-h-[calc(100dvh-4rem)] w-[min(21rem,calc(100vw-2.5rem))] overflow-y-auto overscroll-contain rounded-[min(2vw,var(--radius-xl))] bg-white px-3.5 pt-3 pb-3.5 text-base/7 text-neutral-950 shadow-2xl ring-1 ring-neutral-950/10 max-sm:fixed max-sm:top-10 max-sm:right-2 sm:text-sm/6"
        >
          <h3 id={titleId} className="flex justify-between gap-3 font-semibold">
            {result ? 'Updated at start' : 'Updates at start'}
            {updates.time && <span className="font-normal text-neutral-500 tabular-nums">{clockTime(updates.time)}</span>}
          </h3>
          {updates.state === 'skipped' && <p className="mt-2 text-pretty text-neutral-600">Updates need outbound networking. This setup blocks it.</p>}
          {updates.state === 'error' && <p className="mt-2 text-pretty text-red-700">{updates.message}</p>}
          {result && (
            <>
              {result.updated.length > 0 && (
                <ul role="list" className="mt-2">
                  {result.updated.map((entry, index) => (
                    <li key={index} className="flex justify-between gap-3 border-t border-neutral-950/10 py-1.5">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{entry.name}</span>
                      <span className="whitespace-nowrap text-neutral-600 tabular-nums">{entry.from} → <b className="font-semibold text-teal-800">{entry.to}</b></span>
                    </li>
                  ))}
                </ul>
              )}
              {result.failed.length > 0 && (
                <ul role="list" className="mt-2">
                  {result.failed.map((entry, index) => (
                    <li key={index} className="border-t border-neutral-950/10 py-1.5 [overflow-wrap:anywhere]">
                      <span className="font-medium">{entry.name}</span>
                      <span className="block text-red-700">Not updated: {entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!result.updated.length && !result.failed.length && <p className="mt-2 text-neutral-600">No plugin or theme had an update.</p>}
              {result.current.length > 0 && (
                <p className="mt-2 border-t border-neutral-950/10 pt-2 text-sm/5 text-neutral-500 tabular-nums [overflow-wrap:anywhere]">
                  Already current: {result.current.map((entry) => `${entry.name} ${entry.version}`).join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </span>
  )
}
