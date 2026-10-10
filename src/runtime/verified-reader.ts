import lock from './model-lock.json';
import { RuntimeError, type RuntimeEvent } from './protocol';
export const CACHE_NAME = `kev-dpc-rca-v2-q8-${lock.bundleCommit}`;
export const MODEL_LOCK = lock;
export async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyFile(path: string, data: Uint8Array): Promise<void> {
  const expected = (lock.files as Record<string, {bytes: number; sha256: string}>)[path];
  if (!expected) throw new RuntimeError('integrity_failed', 'The runtime requested a file outside the pinned text-q8 allowlist.');
  if (data.byteLength !== expected.bytes || await sha256(data) !== expected.sha256)
    throw new RuntimeError('integrity_failed', `Integrity check failed for ${path}. Clear this app’s model cache and retry.`);
}
export function createVerifiedReader(signal: AbortSignal, emit: (e: RuntimeEvent) => void) {
  const progress = new Map<string, number>();
  let quotaWarned = false;
  const report = (path: string, loaded: number, total: number, cached: boolean) => {
    progress.set(path, loaded);
    emit({ type: 'progress', file: path, loaded, total, aggregateLoaded: [...progress.values()].reduce((a, b) => a + b, 0), aggregateTotal: lock.totalBytes, cached });
  };
  return async (path: string): Promise<Uint8Array> => {
    signal.throwIfAborted();
    const expected = (lock.files as Record<string, {bytes: number; sha256: string}>)[path];
    if (!expected) throw new RuntimeError('integrity_failed', 'Only the pinned Kev-0.8B text-q8 files may be loaded.');
    const url = `${lock.baseUrl}/${path}`;
    let cache: Cache | undefined;
    try { cache = await caches.open(CACHE_NAME); } catch { emit({type:'warning',code:'cache_unavailable',message:'Persistent model cache is unavailable; loading remains possible but a later visit may download again.'}); }
    const hit = await cache?.match(url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      try { await verifyFile(path, bytes); signal.throwIfAborted(); report(path, bytes.length, expected.bytes, true); return bytes; }
      catch (error) { await cache?.delete(url); if (signal.aborted) throw error; throw new RuntimeError('integrity_failed', `Cached file ${path} failed its pinned digest. It has been removed; retry loading.`); }
    }
    let response: Response;
    try { response = await fetch(url, { signal, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' }); }
    catch (error) { if (signal.aborted) throw error; throw new RuntimeError('download_failed', `Could not fetch ${path}. Check network access and CORS; no evidence is sent with model downloads.`); }
    if (!response.ok) throw new RuntimeError('model_unavailable', `Pinned model file ${path} returned HTTP ${response.status}.`);
    // One preallocated file buffer avoids chunks plus a second complete concatenation buffer.
    const bytes = new Uint8Array(expected.bytes);
    const reader = response.body?.getReader();
    let offset = 0;
    try {
      if (!reader) {
        const got = new Uint8Array(await response.arrayBuffer());
        if (got.length !== bytes.length) throw new RuntimeError('integrity_failed', `Wrong byte length for ${path}.`);
        bytes.set(got); offset = got.length;
      } else {
        for (;;) {
          signal.throwIfAborted();
          const {done, value} = await reader.read();
          if (done) break;
          if (offset + value.length > bytes.length) throw new RuntimeError('integrity_failed', `Unexpected extra bytes in ${path}.`);
          bytes.set(value, offset); offset += value.length;
          report(path, offset, expected.bytes, false);
        }
      }
      if (offset !== expected.bytes) throw new RuntimeError('integrity_failed', `Incomplete download of ${path}; nothing was cached.`);
      await verifyFile(path, bytes); signal.throwIfAborted();
      if (cache) {
        try { await cache.put(url, new Response(bytes as BodyInit, {headers:{'Content-Type':'application/octet-stream'}})); }
        catch { if (!quotaWarned) { quotaWarned = true; emit({type:'warning',code:'cache_quota',message:'Model cache quota was exceeded. Verified files can still run in memory; future loading may download again.'}); } }
      }
      report(path, bytes.length, expected.bytes, false);
      return bytes;
    } catch (error) { await reader?.cancel().catch(() => {}); throw error; }
    finally { reader?.releaseLock(); }
  };
}
export async function clearModelCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  // Never touch another site's/app's or upstream demo's buckets.
  for (const name of await caches.keys()) if (name.startsWith('kev-dpc-rca-v2-q8-')) await caches.delete(name);
}
