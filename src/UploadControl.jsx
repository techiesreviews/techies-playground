import { ArrowUpTrayIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { BAR_BUTTON_CLASS, BarTapTarget } from './UpdatesControl'
import { uploadControlLabel } from './lib/package-upload'

export function UploadControl({ upload, siteReady, onUpload }) {
  const busy = upload.state === 'uploading' || upload.state === 'installing'
  const failed = upload.state === 'failed'
  const label = uploadControlLabel(upload.state)
  const detail = upload.message ? `${label}: ${upload.message}` : 'Add plugin ZIPs to this site'
  const Icon = failed ? ExclamationTriangleIcon : upload.state === 'complete' ? CheckIcon : ArrowUpTrayIcon
  return (
    <button
      type="button"
      disabled={!siteReady || busy}
      onClick={onUpload}
      aria-label={detail}
      title={detail}
      className={`${BAR_BUTTON_CLASS} active:bg-white/15`}
    >
      <BarTapTarget />
      <Icon className={`size-4 shrink-0 ${failed ? 'fill-amber-300' : 'fill-neutral-300'}`} />
      <span className={busy || failed ? '' : 'max-md:sr-only'}>{label}</span>
    </button>
  )
}
