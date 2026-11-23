import type { BookmarkLink } from '../types'
import { hostnameOf } from './utils'

const MAX_BOOKMARKS = 5000

/**
 * Parses the Netscape Bookmark HTML format exported by Chrome, Edge, Firefox
 * and most other browsers. Folder names are best-effort because exported files
 * are frequently malformed around their DL/DT tree.
 */
export function parseNetscapeBookmarks(html: string): BookmarkLink[] {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
  const seen = new Set<string>()
  const result: BookmarkLink[] = []
  let folder = '导入的书签'

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  const folderByAnchor = new Map<HTMLAnchorElement, string>()
  let node: Node | null = walker.currentNode
  while (node) {
    if (node instanceof HTMLHeadingElement) {
      const heading = node.textContent?.trim()
      if (heading) folder = heading
    } else if (node instanceof HTMLAnchorElement) {
      folderByAnchor.set(node, folder)
    }
    node = walker.nextNode() ?? null
  }

  for (const anchor of anchors) {
    const rawUrl = anchor.getAttribute('href')?.trim() ?? ''
    if (!/^https?:\/\//i.test(rawUrl)) continue
    if (seen.has(rawUrl)) continue
    let title = anchor.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!title) title = hostnameOf(rawUrl)
    if (title.length > 160) title = `${title.slice(0, 157)}…`
    seen.add(rawUrl)
    result.push({
      title,
      url: rawUrl,
      folder: folderByAnchor.get(anchor) ?? '导入的书签',
    })
    if (result.length >= MAX_BOOKMARKS) break
  }

  return result
}

export function dedupeBookmarks(links: BookmarkLink[]): BookmarkLink[] {
  const seen = new Set<string>()
  const result: BookmarkLink[] = []
  for (const link of links) {
    if (!/^https?:\/\//i.test(link.url) || seen.has(link.url)) continue
    seen.add(link.url)
    result.push(link)
    if (result.length >= MAX_BOOKMARKS) break
  }
  return result
}
