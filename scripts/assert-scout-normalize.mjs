#!/usr/bin/env node
/** Node-Assertions für Scout-Normalisierung und Notion-Mapping. */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  companyNameKey,
  normalizeCompanyName,
  normalizeDomain,
  normalizeLinkedInUrl,
} from '../lib/leads/normalize.ts';
import {
  mapRegionToQuery,
  mapZielgruppeToIndustry,
  notionStatusToLinkedIn,
} from '../lib/leads/linkedin-status.ts';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  }
}

assert(normalizeDomain('https://WWW.Example.DE/path?x=1') === 'example.de', 'domain https www path');
assert(normalizeDomain('example.de.') === 'example.de', 'domain trailing dot');
assert(normalizeDomain('') === null, 'empty domain');
assert(
  normalizeLinkedInUrl('https://www.linkedin.com/in/Michael-Assel-72140062/?trk=x')
    === 'https://linkedin.com/in/michael-assel-72140062',
  'linkedin www query case slash',
);
assert(
  normalizeLinkedInUrl('de.linkedin.com/in/Foo/') === 'https://linkedin.com/in/foo',
  'linkedin country subdomain',
);
assert(normalizeLinkedInUrl('') === null, 'empty linkedin');

assert(normalizeCompanyName('  F.E.L.S.   PartG  ') === 'F.E.L.S. PartG', 'company collapse spaces');
assert(companyNameKey('  F.E.L.S.   PartG  ') === 'f.e.l.s. partg', 'company key');
assert(companyNameKey('f.e.l.s.') !== companyNameKey('f.e.l.s rechtsanwälte partgmbb'), 'no fuzzy merge');

assert(notionStatusToLinkedIn('Anfrage offen') === 'li_anfrage_gesendet', 'status anfrage');
assert(notionStatusToLinkedIn('Angenommen') === 'li_vernetzt', 'status angenommen');
assert(notionStatusToLinkedIn('Angeschrieben') === 'li_nachricht_gesendet', 'status angeschrieben');
assert(notionStatusToLinkedIn('Nachfass geplant') === 'li_nachfass', 'status nachfass');
assert(notionStatusToLinkedIn('Zurückgestellt') === 'li_zurueckgestellt', 'status zurück');
assert(notionStatusToLinkedIn('Absage') === 'li_absage', 'status absage');
assert(notionStatusToLinkedIn('Shortlist') === 'li_shortlist', 'status shortlist');
assert(notionStatusToLinkedIn('Antwort') === 'li_geantwortet', 'status antwort');
assert(notionStatusToLinkedIn('unbekannt') === null, 'status unknown');

assert(mapZielgruppeToIndustry('Recht') === 'Rechtsanwaltskanzlei', 'zg recht');
assert(mapZielgruppeToIndustry('Notar') === 'Notariat', 'zg notar');
assert(mapZielgruppeToIndustry('Steuer') === 'Steuerberater', 'zg steuer');
assert(mapZielgruppeToIndustry('WP/StB') === 'Wirtschaftsprüfer/Steuerberater', 'zg wp');
assert(mapZielgruppeToIndustry('sonstig') === null, 'zg sonstig');
assert(mapZielgruppeToIndustry('') === null, 'zg empty');

assert(mapRegionToQuery('Oberfranken') === 'KI-Schulung Kanzleien+Oberfranken', 'region of');
assert(mapRegionToQuery('mittelfranken') === 'KI-Schulung Kanzleien+Mittelfranken', 'region mf');
assert(mapRegionToQuery('sonstig') === null, 'region sonstig');

const token = 'scout-test-token';
const hex = createHash('sha256').update(token, 'utf8').digest('hex');
const actual = createHash('sha256').update(token, 'utf8').digest();
const expected = Buffer.from(hex, 'hex');
assert(timingSafeEqual(actual, expected), 'sha256 timing-safe match');
assert(!timingSafeEqual(actual, createHash('sha256').update('other', 'utf8').digest()), 'sha256 mismatch');

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('assert-scout-normalize: ok');
