/** Convert file paths in HTML to clickable inline chips — avoids linkifying inside HTML tags */

export function linkifyPaths(html: string): string {
  // Match absolute paths and ~/paths — supports unicode filenames (中文 etc.)
  // Negative lookbehind avoids matching inside HTML attribute values
  return html.replace(
    /(<[^>]+>)|(?<!")((?:\/[\w.\u4e00-\u9fff\u3400-\u4dbf\uF900-\uFAFF -]+){2,}|~\/[\w.\u4e00-\u9fff\u3400-\u4dbf\uF900-\uFAFF/ -]+)/g,
    (match, tag, path) => {
      if (tag) return tag // Don't modify HTML tags
      if (path) {
        return `<a class="path-chip" data-path="${path}" href="#">${path}</a>`
      }
      return match
    }
  )
}
