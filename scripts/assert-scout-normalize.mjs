#!/usr/bin/env node
/** Node-Assertions für Scout-Normalisierung und Notion-Mapping. */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  applyCompanyAlias,
  companyAliasFamily,
  companyNameKey,
  displayCompanyName,
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
  normalizeLinkedInUrl('https://www.linkedin.com/in/Ada-Beispiel-aa11bb22/?trk=x')
    === 'https://linkedin.com/in/ada-beispiel-aa11bb22',
  'linkedin www query case slash',
);
assert(
  normalizeLinkedInUrl('de.linkedin.com/in/AdaBeispiel/') === 'https://linkedin.com/in/adabeispiel',
  'linkedin country subdomain',
);
assert(normalizeLinkedInUrl('') === null, 'empty linkedin');

assert(normalizeCompanyName('  F.E.L.S.   PartG  ') === 'F.E.L.S. PartG', 'company collapse spaces');
assert(companyNameKey('  F.E.L.S.   PartG  ') === 'fels', 'key strips dots and partg');
assert(companyNameKey('Nordlicht & Partner') === 'nordlicht und partner', 'ampersand to und, keep partner');
assert(companyNameKey('Rödl & Partner') === 'rödl und partner', 'roedl partner kept');
assert(companyNameKey('Foo GmbH') === 'foo', 'gmbh stripped');
assert(companyNameKey('Foo PartG mbB') === 'foo', 'partg mbb stripped');
assert(companyNameKey('Foo Rechtsanwaltsgesellschaft') === 'foo', 'rag stripped');
assert(companyNameKey('Foo StBG mbH') === 'foo', 'stbg mbh stripped');
assert(companyNameKey('Foo StB GmbH') === 'foo', 'stb gmbh stripped');
assert(companyNameKey('Foo WPG') === 'foo', 'wpg stripped');
assert(companyNameKey('Foo StBG') === 'foo', 'stbg stripped');
assert(
  companyNameKey('Nordlicht Quellberg Rechtsanwälte Fachanwälte PartmbB (Inhaberin)')
    === 'nordlicht quellberg rechtsanwälte fachanwälte',
  'parens then partmbb',
);
assert(displayCompanyName('Maxfeld.legal (Partner)') === 'Maxfeld.legal', 'display strips role parens');
assert(displayCompanyName('Nordlicht Kanzlei (Inhaberin, RA)') === 'Nordlicht Kanzlei', 'display strips role list');
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
assert(companyAliasFamily('F.E.L.S Rechtsanwälte Musterstadt GbR (Steuerberater)') === 'fels', 'fels city');
assert(companyAliasFamily('Rödl') === 'roedl', 'roedl short');
assert(companyAliasFamily('Rödl & Partner') === 'roedl', 'roedl partner');
assert(companyAliasFamily('selbstständig (ex Rödl)') === null, 'ex rödl not family');
assert(applyCompanyAlias('f.e.l.s.') === 'F.E.L.S Rechtsanwälte', 'fels alias display');
assert(applyCompanyAlias('Rödl') === 'Rödl & Partner', 'roedl alias display');
assert(parseCompanyName('F.E.L.S.').key === 'fels rechtsanwälte', 'fels parsed key from alias display');
assert(parseCompanyName('Notar').generic === true, 'parse generic');
assert(personalFirmName('Ada', 'Beispiel', 'Musterstadt') === 'Ada Beispiel (Kanzlei, Musterstadt)', 'personal city');
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
