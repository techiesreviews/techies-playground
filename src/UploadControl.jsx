import { ArrowUpTrayIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { BAR_BUTTON_CLASS, BarTapTarget } from './UpdatesControl'
import { uploadControlLabel } from './lib/package-upload'

export function UploadControl({ upload, siteReady, onUpload }) {
  const busy = upload.state === 'uploading' || upload.state === 'installing'
  const failed = upload.state === 'failed'
  const label = uploadControlLabel(upload.state)
  const detail = upload.message || 'Add ZIPs, plugins or themes, to this site'
  const Icon = failed ? ExclamationTriangleIcon : upload.state === 'complete' ? CheckIcon : ArrowUpTrayIcon
  return (
    <div className={failed ? 'flex min-w-0 max-w-full flex-wrap items-center gap-1.5 @max-[20rem]:basis-full' : 'contents'}>
    <button
      type="button"
      aria-disabled={!siteReady || busy}
      onClick={() => { if (siteReady && !busy) onUpload() }}
      aria-label={detail}
      title={detail}
      className={`${BAR_BUTTON_CLASS} active:bg-white/15`}
    >
      <BarTapTarget />
      <Icon className={`size-4 shrink-0 ${failed ? 'fill-amber-300' : 'fill-neutral-300'}`} />
      <span className={failed ? '' : 'max-md:sr-only'}>{label}</span>
    </button>
    {failed && <span title={upload.message} className="min-w-0 flex-1 basis-24 truncate text-sm/5 text-amber-200">{upload.message}</span>}
    </div>
  )
}
