import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import { assertZipFile } from './vault.js'

// Only inspect installable root files, never bundled dependencies or nested ZIPs.
export async function detectPackageType(file) {
  await assertZipFile(file)
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    const entries = (await reader.getEntries()).filter((entry) =>
      !entry.directory && !entry.filename.startsWith('__MACOSX/') && !entry.filename.split('/').some((part) => part.startsWith('.')),
    )
    const types = new Set()
    for (const entry of entries) {
      if (!/^(?:[^/]+\/)?(?:style\.css|[^/]+\.php)$/i.test(entry.filename)) continue
      if (entry.uncompressedSize > 2 * 1024 * 1024) continue
      const header = (await entry.getData(new TextWriter())).slice(0, 8192)
      if (/(?:^|\/)style\.css$/i.test(entry.filename) && /^[ \t/*#@]*Theme Name\s*:\s*\S/im.test(header)) types.add('theme')
      if (/\.php$/i.test(entry.filename) && /^[ \t/*#@]*Plugin Name\s*:\s*\S/im.test(header)) types.add('plugin')
    }
    if (types.size !== 1) throw new Error('Use a ZIP containing one installable WordPress plugin or theme.')
    return [...types][0]
  } finally {
    await reader.close()
  }
}

export function registerPackageDrop(target, { onActive, onFiles }) {
  let depth = 0
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
  const reset = () => { depth = 0; onActive(false) }
  const enter = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth += 1
    onActive(true)
  }
  const over = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    onActive(true)
  }
  const leave = (event) => {
    if (!hasFiles(event)) return
    depth = Math.max(0, depth - 1)
    if (!depth || !event.relatedTarget) reset()
  }
  const drop = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    reset()
    if (files.length) onFiles(files)
  }
  const escape = (event) => { if (event.key === 'Escape') reset() }
  const handlers = { dragenter: enter, dragover: over, dragleave: leave, drop, dragend: reset, blur: reset, keydown: escape }
  for (const [name, handler] of Object.entries(handlers)) target.addEventListener(name, handler, { capture: true })
  return () => {
    for (const [name, handler] of Object.entries(handlers)) target.removeEventListener(name, handler, { capture: true })
  }
}
