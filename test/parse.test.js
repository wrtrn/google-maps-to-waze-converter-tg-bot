const test = require('node:test');
const assert = require('node:assert/strict');
const { extractMapsLinks, extractCoordsFromText, parseMapsUrl } = require('../lib/parse');

// Real expanded URLs of maps.app.goo.gl links shared from the Google Maps mobile app
const EKO_URL = 'https://www.google.com/maps/place/EKO,+Nicosia,+Old+Road,+Limasol/data=!4m2!3m1!1s0x14de1732da53b7e1:0x22a9a9794aa169c5!18m1!1e1?utm_source=mstt_1&entry=gps&coh=192189';
const DOBROTA_URL = 'https://www.google.com/maps/place/CQX9%2BFG6+Dobrota+Apartments,+Dobrota,+%D0%A7%D0%B5%D1%80%D0%BD%D0%BE%D0%B3%D0%BE%D1%80%D0%B8%D1%8F/data=!4m2!3m1!1s0x134c33bd336d4735:0xd6c1b53c0cb6d635!18m1!1e1?utm_source=mstt_1&entry=gps';
const DROPPED_PIN_URL = 'https://maps.google.com/?q=44.818399,20.419373&entry=gps&skid=90a05998&shorturl=1';
const DESKTOP_URL = 'https://www.google.com/maps/place/Parking+Vidin+kapija/@44.8270146,20.4490000,17z/data=!3m1!4b1!4m6!3m5!1s0x475a65a40e59570b:0x4e5547e80e9e9e10!8m2!3d44.8273335!4d20.4520154!16s%2Fg%2F11';

test('extracts all supported Google Maps link formats', () => {
    const text = 'EKO https://maps.app.goo.gl/Ew6e5qtadEcmD8Hj6, pin https://goo.gl/maps/dv1BDAUTUPFWV9RL7 and ' +
        'https://maps.app.goo.gl/Ew6e5qtadEcmD8Hj6 again, not maps https://goo.gl/abc https://example.com/maps';
    assert.deepEqual(extractMapsLinks(text), [
        'https://maps.app.goo.gl/Ew6e5qtadEcmD8Hj6',
        'https://goo.gl/maps/dv1BDAUTUPFWV9RL7'
    ]);
    assert.deepEqual(extractMapsLinks('https://www.google.com/maps/place/X/data=!4m2 https://maps.google.rs/?q=1,2'), [
        'https://www.google.com/maps/place/X/data=!4m2',
        'https://maps.google.rs/?q=1,2'
    ]);
});

test('extracts links hidden behind text and scheme-less links from entities', () => {
    const text = 'Lidl here, also maps.app.goo.gl/Fia2rmjnyJPy4vkt9';
    const entities = [
        { type: 'text_link', offset: 0, length: 4, url: 'https://maps.app.goo.gl/9M2nzdPjkMCyi2Gq7' },
        { type: 'url', offset: 16, length: 33 }
    ];
    assert.deepEqual(extractMapsLinks(text, entities), [
        'https://maps.app.goo.gl/9M2nzdPjkMCyi2Gq7',
        'https://maps.app.goo.gl/Fia2rmjnyJPy4vkt9'
    ]);
});

test('reads coordinates written in the message text', () => {
    assert.deepEqual(extractCoordsFromText(`44°49'06.2"N 20°25'09.7"E\nhttps://goo.gl/maps/dv1BDAUTUPFWV9RL7`), { lat: 44.8183889, lon: 20.4193611 });
    assert.deepEqual(extractCoordsFromText(`33°51'54.5"S 151°12'55.2"E`), { lat: -33.8651389, lon: 151.2153333 });
    assert.deepEqual(extractCoordsFromText('44.827331831810724, 20.45201561350213'), { lat: 44.8273318, lon: 20.4520156 });
    assert.deepEqual(extractCoordsFromText('44.8184° N, 20.4194° E'), { lat: 44.8184, lon: 20.4194 });
    assert.equal(extractCoordsFromText('Price 12.50, version 1.2.3'), null);
    assert.equal(extractCoordsFromText('https://www.google.com/maps/@44.8270146,20.4517613,17z'), null);
});

test('mobile share link: place ID and name, no coordinates', () => {
    assert.deepEqual(parseMapsUrl(EKO_URL), {
        pin: null,
        fid: '0x14de1732da53b7e1:0x22a9a9794aa169c5',
        query: 'EKO, Nicosia, Old Road, Limasol',
        center: null
    });
    assert.equal(parseMapsUrl(DOBROTA_URL).query, 'CQX9+FG6 Dobrota Apartments, Dobrota, Черногория');
});

test('dropped pin link: exact coordinates from ?q=', () => {
    assert.deepEqual(parseMapsUrl(DROPPED_PIN_URL).pin, { lat: 44.818399, lon: 20.419373 });
});

test('desktop link: marker wins over the map center', () => {
    const parsed = parseMapsUrl(DESKTOP_URL);
    assert.deepEqual(parsed.pin, { lat: 44.8273335, lon: 20.4520154 });
    assert.deepEqual(parsed.center, { lat: 44.8270146, lon: 20.449 });
});

test('other URL shapes', () => {
    assert.deepEqual(parseMapsUrl('https://www.google.com/maps/search/44.818399,+20.419373?entry=tts').pin, { lat: 44.818399, lon: 20.419373 });
    assert.deepEqual(parseMapsUrl(`https://www.google.com/maps/place/44%C2%B049'06.2%22N+20%C2%B025'09.7%22E/@44.81,20.41,17z`).pin, { lat: 44.8183889, lon: 20.4193611 });
    assert.equal(parseMapsUrl('https://maps.google.com/?cid=5644496769982045712').fid, '0x0:0x4e5547e80e9e9e10');
    assert.equal(parseMapsUrl('https://www.google.com/maps/place/data=!4m2!3m1!1s0x1:0x2').query, null);

    const search = parseMapsUrl('https://www.google.com/maps/search/Lidl+Beograd/@44.81,20.43,14z');
    assert.equal(search.query, 'Lidl Beograd');
    assert.equal(search.pin, null);
    assert.deepEqual(search.center, { lat: 44.81, lon: 20.43 });

    const directions = parseMapsUrl('https://www.google.com/maps/dir/Home/Lidl/@44.8,20.4,13z/data=!4m14!4m13!1m5!1m1!1s0x1:0x2!2m2!1d20.40!2d44.80!1m5!1m1!1s0x3:0x4!2m2!1d20.4315793!2d44.8093291!3e0');
    assert.deepEqual(directions.pin, { lat: 44.8093291, lon: 20.4315793 });
});
