export function faviconUrlFor(target: string): string | null {
  try {
    const url = new URL(target)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}/favicon.ico`
  } catch {
    return null
  }
}
