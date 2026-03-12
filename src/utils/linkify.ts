/** Convert file paths in HTML to clickable links */
export function linkifyPaths(html: string): string {
  // Match absolute paths like /Users/... or ~/...
  return html.replace(
    /(?<!")((?:\/[\w.-]+){2,}(?:\/[\w.-]+)*|~\/[\w./-]+)/g,
    '<a class="file-link" data-path="$1" href="#">$1</a>'
  )
}
