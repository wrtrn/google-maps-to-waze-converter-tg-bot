// Pure helpers (no network) for finding Google Maps links and coordinates in messages and URLs.

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

// Google Maps place ID ("feature ID"), e.g. 0x475a65a40e59570b:0x4e5547e80e9e9e10
const FID_REGEX = /0x[0-9a-f]+:0x[0-9a-f]+/i;

// 44°49'06.2"N 20°25'09.7"E (Google Maps "dropped pin" format)
const DMS_REGEX = /(\d{1,2})°\s*(\d{1,2})['′’]\s*(\d{1,2}(?:[.,]\d+)?)(?:["″”]|'')?\s*([NS])[\s,;]*(\d{1,3})°\s*(\d{1,2})['′’]\s*(\d{1,2}(?:[.,]\d+)?)(?:["″”]|'')?\s*([EW])/i;

// 44.8184° N, 20.4194° E
const DEG_HEMISPHERE_REGEX = /(\d{1,2}(?:\.\d+)?)°?\s*([NS])[\s,;]+(\d{1,3}(?:\.\d+)?)°?\s*([EW])\b/i;

// 44.818399, 20.419373 (at least 3 decimals so we don't match prices, versions, etc.)
const DECIMAL_PAIR_REGEX = /(?<![\d.])(-?\d{1,2}\.\d{3,})(?:\s*,\s*|\s+)(-?\d{1,3}\.\d{3,})(?![\d.])/;

function makeCoords(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
    // 7 decimals is ~1 cm, more is float noise (e.g. 44.827333499999995)
    return { lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)) };
}

function dmsToDecimal(deg, min, sec, hemisphere) {
    const value = Number(deg) + Number(min) / 60 + Number(String(sec).replace(',', '.')) / 3600;
    return /[SW]/i.test(hemisphere) ? -value : value;
}

// Finds a coordinate pair written as plain text (decimal or degrees/minutes/seconds).
function extractCoordsFromText(text) {
    if (!text) return null;
    const withoutUrls = text.replace(URL_REGEX, ' ');

    const dms = withoutUrls.match(DMS_REGEX);
    if (dms) {
        return makeCoords(dmsToDecimal(dms[1], dms[2], dms[3], dms[4]), dmsToDecimal(dms[5], dms[6], dms[7], dms[8]));
    }

    const deg = withoutUrls.match(DEG_HEMISPHERE_REGEX);
    if (deg) {
        return makeCoords(dmsToDecimal(deg[1], 0, 0, deg[2]), dmsToDecimal(deg[3], 0, 0, deg[4]));
    }

    const decimal = withoutUrls.match(DECIMAL_PAIR_REGEX);
    if (decimal) {
        return makeCoords(decimal[1], decimal[2]);
    }

    return null;
}

// "44.818399,20.419373", "loc:44.8,20.4", "44.8, 20.4 (Label)"
function parseCoordsValue(value) {
    if (!value) return null;
    const match = value.match(/^\s*(?:loc:)?\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (match) return makeCoords(match[1], match[2]);
    return extractCoordsFromText(value);
}

function isMapsLink(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl') return url.pathname.startsWith('/maps');
    return isGoogleMapsPage(rawUrl);
}

// A full (already expanded) Google Maps URL, e.g. https://www.google.com/maps/place/...
function isGoogleMapsPage(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    const host = url.hostname.toLowerCase();
    if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
    return /^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps');
}

function trimTrailingPunctuation(url) {
    return url.replace(/[).,!?;:'"»]+$/, '');
}

// Collects unique Google Maps links from the message text and its entities
// (hidden "text_link" hyperlinks and scheme-less URLs that Telegram detected).
function extractMapsLinks(text = '', entities = []) {
    const candidates = text.match(URL_REGEX) || [];
    for (const entity of entities) {
        if (entity.type === 'text_link' && entity.url) {
            candidates.push(entity.url);
        } else if (entity.type === 'url') {
            const value = text.slice(entity.offset, entity.offset + entity.length);
            candidates.push(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        }
    }
    const links = candidates.map(trimTrailingPunctuation).filter(isMapsLink);
    return [...new Set(links)];
}

function safeDecode(value) {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value.replace(/\+/g, ' ');
    }
}

function cidToFid(cid) {
    try {
        return `0x0:0x${BigInt(cid).toString(16)}`;
    } catch {
        return null;
    }
}

/**
 * Extracts everything useful from an expanded Google Maps URL:
 *  - pin:    exact marker coordinates (place marker, dropped pin, ?q=lat,lon, directions destination)
 *  - fid:    Google place ID that can be looked up for exact coordinates
 *  - query:  place name / search text (for a name search fallback)
 *  - center: map viewport center (@lat,lon), which is NOT necessarily where the place is
 */
function parseMapsUrl(rawUrl) {
    const result = { pin: null, fid: null, query: null, center: null };
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return result;
    }

    const href = url.href;
    const path = url.pathname;
    const params = url.searchParams;
    const isDirections = path.includes('/dir/');

    if (isDirections) {
        // The destination is the last waypoint: !1d<lon>!2d<lat>
        const waypoints = [...href.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
        const last = waypoints[waypoints.length - 1];
        if (last) result.pin = makeCoords(last[2], last[1]);

        const segments = path.split('/dir/')[1].split('/').filter(s => s && !s.startsWith('@') && !s.startsWith('data='));
        const destination = segments.length ? safeDecode(segments[segments.length - 1]) : null;
        if (!result.pin && destination) result.pin = parseCoordsValue(destination);
        if (!result.pin && destination) result.query = destination;
    } else {
        // Place marker inside the data= blob: !3d<lat>!4d<lon>
        const marker = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (marker) result.pin = makeCoords(marker[1], marker[2]);

        const fid = href.match(new RegExp(`!1s(${FID_REGEX.source})`, 'i'));
        if (fid) result.fid = fid[1].toLowerCase();
    }

    for (const key of ['q', 'query', 'daddr', 'destination', 'll']) {
        const value = params.get(key);
        if (!value) continue;
        const coords = parseCoordsValue(value);
        if (coords && !result.pin) result.pin = coords;
        if (!coords && !result.query && key !== 'll') result.query = value.trim();
    }

    if (!result.fid && params.get('ftid') && FID_REGEX.test(params.get('ftid'))) {
        result.fid = params.get('ftid').toLowerCase();
    }
    if (!result.fid && /^\d+$/.test(params.get('cid') || '')) {
        result.fid = cidToFid(params.get('cid'));
    }

    const named = path.match(/\/(?:place|search)\/([^/@][^/]*)/);
    if (named && !isDirections && !named[1].startsWith('data=')) {
        const name = safeDecode(named[1]);
        const coords = parseCoordsValue(name);
        if (coords && !result.pin) result.pin = coords;
        if (!coords && !result.query) result.query = name;
    }

    const center = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (center) result.center = makeCoords(center[1], center[2]);

    return result;
}

module.exports = {
    extractMapsLinks,
    extractCoordsFromText,
    parseMapsUrl,
    isMapsLink,
    isGoogleMapsPage,
    makeCoords,
    FID_REGEX,
};
