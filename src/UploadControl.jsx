import { ArrowUpTrayIcon, CheckIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { BAR_BUTTON_CLASS, BarTapTarget, Spinner } from './UpdatesControl'
import { uploadControlLabel } from './lib/package-upload'

export function UploadControl({ upload, siteReady, onUpload }) {
  const busy = upload.state === 'uploading' || upload.state === 'installing'
  const attention = upload.state === 'failed' || upload.state === 'partial'
  const label = uploadControlLabel(upload.state)
  const detail = upload.message
    ? upload.message.startsWith(label) ? upload.message : `${label}: ${upload.message}`
    : 'Add ZIPs: plugins or themes'
  const Icon = attention ? ExclamationTriangleIcon : upload.state === 'complete' ? CheckIcon : upload.state === 'saved' ? ClockIcon : ArrowUpTrayIcon
  return (
    <div className={attention ? 'flex min-w-0 max-w-full flex-wrap items-center gap-1.5 @max-[20rem]:basis-full' : 'contents'}>
    <button
      type="button"
      aria-disabled={!siteReady || busy}
      aria-busy={busy}
      onClick={() => { if (siteReady && !busy) onUpload() }}
      aria-label={detail}
      title={siteReady || upload.state !== 'idle' ? detail : 'Available when setup finishes'}
      className={`${BAR_BUTTON_CLASS} active:bg-white/15 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-white/5 aria-disabled:active:bg-white/5`}
    >
      <BarTapTarget />
      {busy ? <Spinner className="text-neutral-300" /> : <Icon className={`size-4 shrink-0 ${attention ? 'fill-amber-300' : 'fill-neutral-300'}`} />}
      <span className={attention ? '' : upload.state === 'saved' ? 'max-[1041px]:sr-only' : 'max-md:sr-only'}>{label}</span>
    </button>
    {attention && <span title={upload.message} className="min-w-0 flex-1 basis-24 truncate text-sm/5 text-amber-200">{upload.message}</span>}
    </div>
  )
}
