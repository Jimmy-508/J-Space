export const getSafeExternalUrl = (url: string) => {
  try {
    const parsed = new URL(url, document.baseURI)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

export const openExternalLink = (url: string, onBlocked?: (url: string) => void) => {
  const safeUrl = getSafeExternalUrl(url)
  if (!safeUrl) return false
  const opened = window.open(safeUrl, '_blank', 'noopener,noreferrer')
  if (opened) return true
  onBlocked?.(safeUrl)
  return false
}
