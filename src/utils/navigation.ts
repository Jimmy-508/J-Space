export const getSafeExternalUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

export const openExternalLink = (url: string, mode: 'new-tab' | 'same-tab' = 'new-tab') => {
  const safeUrl = getSafeExternalUrl(url)
  if (!safeUrl) return false
  if (mode === 'same-tab') {
    window.location.assign(safeUrl)
    return true
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer')
  return true
}
