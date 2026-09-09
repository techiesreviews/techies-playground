export const PREVIEW_PREFIX = '#preview='
const PLAYGROUND_ORIGIN = 'https://playground.wordpress.net'

export function parsePreviewUrl(hash) {
  if (!hash.startsWith(PREVIEW_PREFIX)) return null
  try {
    const url = new URL(decodeURIComponent(hash.slice(PREVIEW_PREFIX.length)))
    if (url.origin !== PLAYGROUND_ORIGIN || url.username || url.password) return null
    const scope = url.pathname.match(/^\/scope:(launcher-[a-z0-9-]+)\//)?.[1]
    return scope ? { url: url.href, scope } : null
  } catch {
    return null
  }
}

export function hostPreviewSession(scope) {
  const channel = new BroadcastChannel(`techies-preview:${scope}`)
  channel.onmessage = ({ data }) => {
    if (data?.type === 'ping') channel.postMessage({ type: 'alive' })
  }
  return () => {
    channel.postMessage({ type: 'closed' })
    channel.close()
  }
}

// Serialized into a WordPress mu-plugin so it runs inside the cross-origin frame.
export function installPreviewLinks(previewBase, scope, win = window) {
  const originalOpen = win.open.bind(win)
  const scopedPath = `/scope:${scope}/`
  function previewUrl(value) {
    try {
      const url = new URL(value, win.location.href)
      if (url.origin !== win.location.origin || !url.pathname.startsWith(scopedPath)) return null
      return previewBase + encodeURIComponent(url.href)
    } catch {
      return null
    }
  }
  win.open = (url, target, features) => originalOpen(
    !['_self', '_parent', '_top'].includes(target) && url ? previewUrl(url) || url : url,
    target,
    features,
  )
  function openLink(event) {
    if (event.defaultPrevented || event.altKey) return
    const link = event.target?.closest?.('a[href]')
    if (!link || link.hasAttribute('download')) return
    const newTab = event.type === 'auxclick' ? event.button === 1
      : event.button === 0 && (event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank')
    const url = newTab && previewUrl(link.href)
    if (!url) return
    event.preventDefault()
    originalOpen(url, '_blank', 'noopener')
  }
  win.document.addEventListener('click', openLink)
  win.document.addEventListener('auxclick', openLink)
}

export function buildPreviewPlugin(launcherUrl, scope) {
  const url = new URL(launcherUrl)
  url.search = ''
  url.hash = ''
  const script = `(${installPreviewLinks.toString()})(${JSON.stringify(url.href + PREVIEW_PREFIX)},${JSON.stringify(scope)});`
  // Encode '<' even in configuration so it cannot terminate the inline script.
  const safeScript = script.replaceAll('<', '\\u003c')
  return `<?php
/* Plugin Name: Techies Playground preview tabs */
function techies_playground_preview_links() {
?>
<script>${safeScript}</script>
<?php
}
add_action('admin_head', 'techies_playground_preview_links');
add_action('wp_head', 'techies_playground_preview_links');
`
}
