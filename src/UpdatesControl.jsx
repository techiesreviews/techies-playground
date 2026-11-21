import { useEffect, useRef } from 'react'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { updatesLabel } from './lib/plugin-updates'

export const BAR_BUTTON_CLASS = 'relative inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 py-1 pr-2.5 pl-1 text-sm/5 font-medium text-white tabular-nums ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white max-sm:px-2.5 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:bg-white/15'

export function BarTapTarget() {
  return <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 max-sm:h-14 max-sm:w-[calc(100%+0.625rem)]" aria-hidden="true" />
}

export function Spinner({ className = '' }) {
  return <span className={`m-px size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-[spin_2.4s_linear_infinite] ${className}`} aria-hidden="true" />
}

export const clockTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// The bar's Updates control: what the start-up update changed, as old → new version. It
// opens a note with every change, what failed, and what was already current.
export function UpdatesControl({ updates, open, onOpenChange, buttonRef }) {
  const wrapRef = useRef(null)
  const { label, note, count, failed, ready } = updatesLabel(updates)

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
    <span ref={wrapRef} className="relative flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!ready}
        title={ready ? 'Updated at start' : 'Available when setup finishes'}
        onClick={() => onOpenChange(!open)}
        className={BAR_BUTTON_CLASS}
      >
        <BarTapTarget />
        {updates.state === 'running' ? <Spinner className="text-neutral-300" /> : <ArrowPathIcon className="size-4 shrink-0 fill-neutral-300" />}
        <span className="max-sm:sr-only">{label}</span>
        {/* Where the bar runs out of room, a change list shortens to its count. */}
        {note && <span className={`max-w-64 truncate font-normal text-neutral-300 ${count ? 'max-[1040px]:hidden' : 'max-sm:sr-only'}`}>{count ? ': ' : ' · '}{note}</span>}
        {count && (
          <span className="font-normal text-neutral-300 min-[1041px]:hidden">
            <span className="max-sm:sr-only">· </span>{count}
          </span>
        )}
        {failed && (
          <span className="inline-flex items-center gap-1 font-normal text-amber-300">
            <ExclamationTriangleIcon className="size-3.5 shrink-0 fill-amber-300" aria-hidden="true" />
            <span className="max-sm:sr-only">{failed} failed</span>
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Updated at start"
          className="license-popover-enter absolute top-full right-0 z-60 mt-2 max-h-[calc(100dvh-4rem)] w-[min(21rem,calc(100vw-2.5rem))] overflow-y-auto overscroll-contain rounded-[min(2vw,var(--radius-xl))] bg-white px-3.5 pt-3 pb-3.5 text-base/7 text-neutral-950 shadow-2xl ring-1 ring-neutral-950/10 max-sm:fixed max-sm:top-10 max-sm:right-2 sm:text-sm/6"
        >
          <h3 className="flex justify-between gap-3 font-semibold">
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
                <p className="mt-2 border-t border-neutral-950/10 pt-2 text-sm/5 text-neutral-500 tabular-nums">
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
