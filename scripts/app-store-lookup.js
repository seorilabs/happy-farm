'use strict';

function normalizeVersion(value) {
  if (typeof value !== 'string') return null;
  const version = value.replace(/^v/, '');
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ? version : null;
}

function appStoreLookupUrl(bundleId) {
  return `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=kr`;
}

function normalizeAppStoreResponse(bundleId, payload) {
  if (payload?.resultCount !== 1 || !Array.isArray(payload.results) || payload.results.length !== 1) return null;
  const result = payload.results[0];
  if (result?.bundleId !== bundleId) return null;
  const version = normalizeVersion(result.version);
  const releasedAt = result.currentVersionReleaseDate;
  if (!version || typeof releasedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(releasedAt)) return null;
  const date = new Date(releasedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== releasedAt.slice(0, 19)) return null;
  return { version, releasedAt };
}

/**
 * App Store 공개 Lookup에서 버전과 공개일을 조회한다.
 * @param {string} bundleId
 * @param {{fetchImpl?: (url: string, options: {signal: AbortSignal}) => Promise<{ok: boolean, json: () => Promise<unknown>}>}} [options]
 * @returns {Promise<{version: string, releasedAt: string}|null>}
 */
async function lookupAppStoreVersion(bundleId, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof bundleId !== 'string' || !bundleId.trim()) return null;
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(appStoreLookupUrl(bundleId), { signal: controller.signal });
        if (!response.ok) return null;
        return normalizeAppStoreResponse(bundleId, await response.json());
      })(),
      new Promise((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, 10_000);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 태그 목록에 없는 공개 버전의 사유 표시용이다. 판정 임계값은 기존 tagGap을 사용한다.
function isVersionAhead(version, latestTag) {
  const latest = normalizeVersion(latestTag);
  if (!latest) return false;
  const actualParts = version.split('.');
  const latestParts = latest.split('.');
  for (let i = 0; i < 3; i += 1) {
    if (actualParts[i] === latestParts[i]) continue;
    return actualParts[i].length !== latestParts[i].length
      ? actualParts[i].length > latestParts[i].length : actualParts[i] > latestParts[i];
  }
  return false;
}

module.exports = { normalizeVersion, appStoreLookupUrl, normalizeAppStoreResponse, lookupAppStoreVersion, isVersionAhead };
