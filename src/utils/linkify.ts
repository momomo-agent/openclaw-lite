/** Convert file paths in HTML to clickable links — avoids linkifying inside HTML tags */
export function linkifyPaths(html: string): string {
  // Split by HTML tags to avoid matching inside tag attributes
  return html.replace(
    /(<[^>]+>)|(?<!")((?:\/[\w.-]+){2,}(?:\/[\w.-]+)*|~\/[\w./-]+)/g,
    (match, tag, path) => {
      if (tag) return tag // Don't modify HTML tags
      if (path) return `<a class="file-link" data-path="${path}" href="#">${path}</a>`
      return match
    }
  )
}
