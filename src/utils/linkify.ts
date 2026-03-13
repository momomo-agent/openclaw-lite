/** Convert file paths in HTML to clickable file cards — avoids linkifying inside HTML tags */

const FILE_EXT_RE = /\.(\w{1,6})$/

function fileNameFromPath(p: string): string {
  const segments = p.replace(/\/$/, '').split('/')
  return segments[segments.length - 1] || p
}

export function linkifyPaths(html: string): string {
  // Split by HTML tags to avoid matching inside tag attributes
  return html.replace(
    /(<[^>]+>)|(?<!")((?:\/[\w.-]+){2,}(?:\/[\w.-]+)*|~\/[\w./-]+)/g,
    (match, tag, path) => {
      if (tag) return tag // Don't modify HTML tags
      if (path) {
        const name = fileNameFromPath(path)
        const extMatch = name.match(FILE_EXT_RE)
        const ext = extMatch ? extMatch[1].toUpperCase() : 'FILE'
        return `<a class="md-file-card" data-path="${path}" href="#">` +
          `<span class="md-file-icon">${ext}</span>` +
          `<span class="md-file-name">${name}</span>` +
          `<span class="md-file-open">↗</span></a>`
      }
      return match
    }
  )
}
