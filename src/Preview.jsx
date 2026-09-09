import { useEffect, useState } from 'react'
import { parsePreviewUrl } from './lib/playground-preview'

export default function Preview() {
  const [preview] = useState(() => parsePreviewUrl(window.location.hash))
  const [state, setState] = useState('connecting')
  useEffect(() => {
    if (!preview) return
    const channel = new BroadcastChannel(`techies-preview:${preview.scope}`)
    let lastReply = Date.now()
    let closed = false
    channel.onmessage = ({ data }) => {
      if (closed) return
      if (data?.type === 'alive') {
        lastReply = Date.now()
        setState('ready')
      } else if (data?.type === 'closed') {
        closed = true
        setState('closed')
      }
    }
    function ping() {
      if (closed) return
      if (Date.now() - lastReply > 15000) setState('closed')
      channel.postMessage({ type: 'ping' })
    }
    ping()
    const timer = setInterval(ping, 3000)
    return () => { clearInterval(timer); channel.close() }
  }, [preview])

  return <main className="flex h-dvh flex-col bg-white text-slate-900">
    <div className="border-b border-slate-200 px-4 py-1 text-sm">
      <strong>WordPress preview</strong> · Keep the original Playground tab open while using this preview.
    </div>
    {!preview ? <p className="p-6">This preview link is invalid. Open a new preview from your running Playground.</p>
      : state === 'connecting' ? <p className="p-6" role="status">Connecting to your running Playground…</p>
        : state === 'closed' ? <p className="p-6" role="status">The original Playground is unavailable. Return to its tab and open a new preview once it is running.</p>
          : <iframe title="WordPress preview" src={preview.url} className="min-h-0 w-full flex-1 border-0" />}
  </main>
}
