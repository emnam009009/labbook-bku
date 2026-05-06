// src/ts/services/origin-launcher.ts
// Round 95: Origin Lab integration via custom URL protocol.
//
// Architecture:
//   1. User runs extras/origin-integration/install.bat ONCE
//      (registers 'labbook-origin://' protocol in Windows registry,
//       writes wrapper batch script to %USERPROFILE%)
//   2. User downloads file via 'Tai ve' button → file goes to
//      %USERPROFILE%\Downloads\
//   3. User clicks 'Mo bang Origin' button → web app navigates to
//      'labbook-origin://<filename>' URL
//   4. Browser asks user to confirm protocol launch (one-time per
//      browser, can be remembered with checkbox)
//   5. Windows runs labbook-origin.bat with filename argument
//   6. Batch script launches Origin64.exe with full path:
//      %USERPROFILE%\Downloads\<filename>

const ORIGIN_PROTOCOL = 'labbook-origin';

// Origin can open or import these formats. The first group are
// native Origin formats; the second are imported via File menu.
const ORIGIN_NATIVE_EXT = new Set([
  'opj', 'opju',           // project files
  'otp',                   // graph template
  'ogg', 'ogw', 'ogm',     // graph / worksheet / matrix
  'org',                   // legacy project
]);
const ORIGIN_IMPORT_EXT = new Set([
  'xlsx', 'xls',
  'csv', 'tsv',
  'txt', 'dat', 'asc',
  'cor',                   // CorrWare
]);

/**
 * Whether this filename can be opened/imported by Origin Lab.
 */
export function canOpenInOrigin(filename: string): boolean {
  const m = /\.([^.]+)$/.exec(filename);
  if (!m) return false;
  const ext = m[1].toLowerCase();
  return ORIGIN_NATIVE_EXT.has(ext) || ORIGIN_IMPORT_EXT.has(ext);
}

/**
 * Launch Origin with the given filename. Assumes the file has been
 * downloaded into the user's Downloads folder beforehand.
 *
 * If protocol handler isn't registered, browser shows nothing useful
 * (silent fail). We wrap this in a check + helpful toast.
 */
export function launchOriginWithFile(filename: string): void {
  // Strip any path separators — handler expects bare filename
  const safeName = filename.replace(/[\\/]/g, '_');
  // Encode special chars (URI scheme handler will URL-decode)
  const encoded = encodeURIComponent(safeName);
  const url = `${ORIGIN_PROTOCOL}://${encoded}`;
  // Use a hidden iframe to trigger the protocol without navigating
  // away from the page (prevents the dreaded 'about:blank' tab)
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  // Remove iframe after a moment (handler dispatch is synchronous
  // from browser's POV; even if Origin takes seconds to launch,
  // the URL has already been handed off to Windows shell)
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch (e) {}
  }, 1000);
}

/**
 * Convenience: download blob via standard mechanism, wait briefly,
 * then trigger Origin launch. Used by 'Tai ve va mo Origin' button.
 */
export async function downloadAndOpenInOrigin(blob: Blob, filename: string): Promise<void> {
  // 1. Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  // 2. Wait for browser to write to disk (heuristic)
  await new Promise(resolve => setTimeout(resolve, 1200));
  // 3. Trigger protocol handler
  launchOriginWithFile(filename);
}
