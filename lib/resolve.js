// Network part: turns a Google Maps link into coordinates, telling whether they are exact or approximate.
const axios = require('axios');
const { parseMapsUrl, isGoogleMapsPage, makeCoords, FID_REGEX } = require('./parse');

// TelegramBot User-Agent so Google doesn't block or geo-default requests from datacenter IPs.
const http = axios.create({
    timeout: 6000,
    headers: {
        'User-Agent': 'TelegramBot (like TwitterBot)',
        'Accept-Language': 'en-US,en;q=0.9'
    }
});

// Follows short-link redirects one hop at a time and stops at the first full Google Maps URL,
// so we never have to download the (heavy, sometimes consent-walled) Maps page itself.
async function expandLink(link) {
    let url = link;
    for (let hop = 0; hop < 6; hop++) {
        if (isGoogleMapsPage(url)) return url;

        const response = await http.get(url, {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400,
            responseType: 'text'
        });
        const location = response.headers.location;
        if (!location) return url;

        url = new URL(location, url).toString();
        const next = new URL(url);
        if (next.hostname.startsWith('consent.') && next.searchParams.get('continue')) {
            url = next.searchParams.get('continue');
        }
    }
    return url;
}

// Looks up a place by its Google Maps place ID. This is the same internal endpoint the Maps
// web app uses, so it returns exactly the point Google Maps shows for the place.
async function fetchPlaceByFid(fid) {
    const response = await http.get(`https://www.google.com/maps/preview/place?authuser=0&hl=en&pb=!1m1!1s${fid}`, {
        responseType: 'text',
        transformResponse: body => body
    });
    const body = String(response.data);
    const cid = fid.split(':')[1];

    try {
        // Response is JSON prefixed with an anti-XSSI line: )]}'
        const place = JSON.parse(body.slice(body.indexOf('\n') + 1))[6];
        const coords = Array.isArray(place) && Array.isArray(place[9]) && makeCoords(place[9][2], place[9][3]);
        if (coords && typeof place[10] === 'string' && place[10].toLowerCase().endsWith(`:${cid}`)) {
            const address = typeof place[39] === 'string' ? place[39] : (Array.isArray(place[2]) ? place[2].join(', ') : null);
            return { ...coords, name: typeof place[11] === 'string' ? place[11] : null, address };
        }
    } catch (error) {
        console.error('Unexpected place response structure:', error.message);
    }

    // Fallback in case Google reshuffles the array: coordinates are stored right before the place ID
    const match = body.match(new RegExp(`\\[null,null,(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)\\],"(${FID_REGEX.source})"`, 'i'));
    if (match && match[3].toLowerCase().endsWith(`:${cid}`)) {
        return makeCoords(match[1], match[2]);
    }
    return null;
}

// Some Maps pages (places without photos) embed a static map with the exact marker as og:image.
async function fetchMarkerFromPreviewImage(url) {
    const response = await http.get(url, { responseType: 'text' });
    const html = typeof response.data === 'string' ? response.data : '';
    const match = html.match(/content="[^"]*?markers=(-?\d+\.\d+)%2C(-?\d+\.\d+)[^"]*?"/);
    return match ? makeCoords(match[1], match[2]) : null;
}

// Google Places text search. Only finds a place with a similar name, which may be another
// branch of a chain, so the result is always reported as approximate.
async function searchPlace(query, near) {
    const params = { query, key: process.env.GOOGLE_PLACES_API_KEY };
    if (near) {
        params.location = `${near.lat},${near.lon}`;
        params.radius = 5000;
    }
    const response = await http.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params });
    const { status, results } = response.data;
    if (status !== 'OK' || !results.length) {
        console.error('Places API found no results or returned status:', status);
        return null;
    }
    const best = results[0];
    const coords = makeCoords(best.geometry.location.lat, best.geometry.location.lng);
    return coords && { ...coords, name: best.name, address: best.formatted_address };
}

/**
 * Resolves a Google Maps link to { lat, lon, exact, source, name?, address?, query? }.
 * If no coordinates could be found, lat/lon are missing and only the place query (if any) is returned.
 */
async function resolveMapsLink(link) {
    const longUrl = await expandLink(link);
    const parsed = parseMapsUrl(longUrl);
    const query = parsed.query;

    // 1. Exact pin right in the URL (dropped pins, desktop links, ?q=lat,lon)
    if (parsed.pin) {
        return { ...parsed.pin, exact: true, source: 'coordinates from the link', query };
    }

    // 2. Exact place coordinates by place ID (mobile app share links)
    if (parsed.fid) {
        try {
            const place = await fetchPlaceByFid(parsed.fid);
            if (place) return { ...place, exact: true, source: 'Google Maps place location', query };
            console.error('Place lookup returned no coordinates for', parsed.fid);
        } catch (error) {
            console.error('Place lookup failed for', parsed.fid, error.message);
        }

        // 3. Exact marker from the page preview image of this place
        try {
            const marker = await fetchMarkerFromPreviewImage(longUrl);
            if (marker) return { ...marker, exact: true, source: 'Google Maps marker', query };
        } catch (error) {
            console.error('Preview image lookup failed:', error.message);
        }
    }

    // 4. Approximate: search by name
    if (query && process.env.GOOGLE_PLACES_API_KEY) {
        try {
            const found = await searchPlace(query, parsed.center);
            if (found) return { ...found, exact: false, source: 'name search', query };
        } catch (error) {
            console.error('Google Places API error:', error.message);
        }
    } else if (query) {
        console.error('WARNING: GOOGLE_PLACES_API_KEY is not set.');
    }

    // 5. Approximate: for a search link (no specific place) the preview marker is just Google's top result
    if (!parsed.fid && query) {
        try {
            const marker = await fetchMarkerFromPreviewImage(longUrl);
            if (marker) return { ...marker, exact: false, source: 'top Google Maps search result', query };
        } catch (error) {
            console.error('Preview image lookup failed:', error.message);
        }
    }

    // 6. Approximate: map center from the link
    if (parsed.center) {
        return { ...parsed.center, exact: false, source: 'map center of the link', query };
    }

    return { query };
}

module.exports = { resolveMapsLink, expandLink, fetchPlaceByFid };
