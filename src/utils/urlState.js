import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

// Encode scenario state into the URL hash.
// Only documents, filingStatus, and overrides are persisted — computed is derived.
export function encodeStateToHash(documents, filingStatus, overrides) {
  const payload = JSON.stringify({ documents, filingStatus, overrides });
  const compressed = compressToEncodedURIComponent(payload);
  history.replaceState(null, '', '#' + compressed);
}

// Decode scenario state from the current URL hash.
// Returns { documents, filingStatus, overrides } or null if hash is absent/invalid.
export function decodeStateFromHash() {
  const hash = window.location.hash.slice(1); // strip leading '#'
  if (!hash) return null;
  try {
    const json = decompressFromEncodedURIComponent(hash);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!parsed.documents || !parsed.filingStatus) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
