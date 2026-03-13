// tools/web-download.js — Download files from the web
const { registerTool } = require('./registry');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Map content-type to extension
const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
  'audio/aac': '.aac', 'audio/flac': '.flac', 'audio/mp4': '.m4a',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'application/pdf': '.pdf', 'application/zip': '.zip',
  'application/gzip': '.gz', 'application/x-tar': '.tar',
};

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.(\w{2,5})$/);
    return m ? `.${m[1].toLowerCase()}` : '';
  } catch { return ''; }
}

function extFromContentType(ct) {
  if (!ct) return '';
  const mime = ct.split(';')[0].trim().toLowerCase();
  return MIME_EXT[mime] || '';
}

function filenameFromHeaders(response, url) {
  // Try Content-Disposition header
  const cd = response.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (m) return decodeURIComponent(m[1].trim());

  // Try URL path
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.includes('.')) return decodeURIComponent(last);
  } catch {}

  return '';
}

registerTool({
  name: 'web_download',
  description: 'Download a file from the web (images, audio, video, PDFs, etc.) and save it locally. Returns the saved file path. Use markdown in your reply to display the result: ![caption](path) for images, [name](path) for audio/video/files.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to download'
      },
      filename: {
        type: 'string',
        description: 'Optional filename to save as (e.g. "photo.jpg"). Auto-detected if omitted.'
      }
    },
    required: ['url']
  },
  handler: async (args, context) => {
    const { url, filename: userFilename } = args;
    const { clawDir } = context;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(60000),
        redirect: 'follow'
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') || '';

      // Determine filename
      let name = userFilename;
      if (!name) {
        name = filenameFromHeaders(response, url);
      }
      if (!name) {
        // Generate a short name from URL hash + extension
        const ext = extFromUrl(url) || extFromContentType(contentType) || '.bin';
        const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
        name = `download-${hash}${ext}`;
      }
      // Ensure the filename has an extension
      if (!name.includes('.')) {
        const ext = extFromContentType(contentType) || extFromUrl(url) || '.bin';
        name += ext;
      }

      // Save to downloads/ directory inside workspace
      const downloadsDir = path.join(clawDir, 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      const savePath = path.join(downloadsDir, name);

      // Stream to file
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(savePath, buffer);

      const sizeKB = (buffer.length / 1024).toFixed(1);
      const relPath = `downloads/${name}`;

      return `Downloaded: ${relPath} (${sizeKB} KB)\nUse in reply: ![${name}](${relPath}) or [${name}](${relPath})`;
    } catch (error) {
      return `Error downloading ${url}: ${error.message}`;
    }
  }
});
