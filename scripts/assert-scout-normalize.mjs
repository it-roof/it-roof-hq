#!/usr/bin/env node
/** Node-Assertions für Scout-Normalisierung und Notion-Mapping. */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  applyCompanyAlias,
  companyAliasFamily,
  companyNameKey,
  isGenericCompanyName,
  normalizeCompanyName,
  normalizeDomain,
  normalizeLinkedInUrl,
  parseCompanyName,
  personalFirmName,
} from '../lib/leads/normalize.ts';
import {
  LINKEDIN_CAMPAIGN_NAME,
  LINKEDIN_CAMPAIGN_SLUG,
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
assert(companyNameKey('  F.E.L.S.   PartG  ') === 'fels', 'key strips dots and partg');
assert(companyNameKey('Steinbock & Partner') === 'steinbock und partner', 'ampersand to und, keep partner');
assert(companyNameKey('Rödl & Partner') === 'rödl und partner', 'roedl partner kept');
assert(companyNameKey('Foo GmbH') === 'foo', 'gmbh stripped');
assert(companyNameKey('Foo PartG mbB') === 'foo', 'partg mbb stripped');
assert(companyNameKey('Foo Rechtsanwaltsgesellschaft') === 'foo', 'rag stripped');
assert(
  companyNameKey('Braun Venten Rechtsanwälte Fachanwälte PartmbB (Inhaberin)')
    === 'braun venten rechtsanwälte fachanwälte',
  'parens then partmbb',
);
assert(companyNameKey('und partner') === 'und partner', 'und partner not a legal form');
assert(isGenericCompanyName('Notar') === true, 'generic notar');
assert(isGenericCompanyName('Rechtsanwältin') === true, 'generic rAin');
assert(isGenericCompanyName('eigene kanzlei') === true, 'generic eigene');
assert(isGenericCompanyName('selbstständig (ex Rödl & Partner)') === true, 'generic selbstständig ex rödl');
assert(isGenericCompanyName('Unbekannt') === true, 'generic unbekannt');
assert(isGenericCompanyName('Kanzlei') === true, 'generic kanzlei');
assert(isGenericCompanyName('Steuer') === true, 'generic steuer');
assert(isGenericCompanyName('Steuerkanzlei') === true, 'generic steuerkanzlei');
assert(companyNameKey('selbstständig (ex Rödl)') === null, 'prefix+paren → generic');
assert(companyAliasFamily('F.E.L.S.') === 'fels', 'fels family short');
assert(companyAliasFamily('F.E.L.S Rechtsanwälte PartGmbB') === 'fels', 'fels family long');
assert(companyAliasFamily('F.E.L.S Rechtsanwälte Bayreuth GbR (Steuerberater)') === 'fels', 'fels bayreuth');
assert(companyAliasFamily('Rödl') === 'roedl', 'roedl short');
assert(companyAliasFamily('Rödl & Partner') === 'roedl', 'roedl partner');
assert(companyAliasFamily('selbstständig (ex Rödl)') === null, 'ex rödl not family');
assert(applyCompanyAlias('f.e.l.s.') === 'F.E.L.S Rechtsanwälte', 'fels alias display');
assert(applyCompanyAlias('Rödl') === 'Rödl & Partner', 'roedl alias display');
assert(parseCompanyName('F.E.L.S.').key === 'fels rechtsanwälte', 'fels parsed key from alias display');
assert(parseCompanyName('Notar').generic === true, 'parse generic');
assert(personalFirmName('Ada', 'Beispiel', 'Bamberg') === 'Ada Beispiel (Kanzlei, Bamberg)', 'personal city');
assert(personalFirmName('Ada', 'Beispiel', null) === 'Ada Beispiel (Kanzlei)', 'personal no city');
assert(LINKEDIN_CAMPAIGN_NAME === 'LinkedIn KI-Schulung Kanzleien', 'campaign name');
assert(LINKEDIN_CAMPAIGN_SLUG === 'linkedin-ki-schulung', 'campaign slug');

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
