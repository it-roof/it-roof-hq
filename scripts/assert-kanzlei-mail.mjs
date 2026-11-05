#!/usr/bin/env node
/** Node-Assertions für Kanzlei-Mail (nur Fantasiewerte). */
import { createHash } from 'node:crypto';
import { tokenMatches } from '../lib/auth/require-bearer-token.ts';
import { requireKanzleiMailToken } from '../lib/auth/require-kanzlei-mail-token.ts';
import { requireScoutToken } from '../lib/auth/require-scout-token.ts';
import { hasBearerToken, isKanzleiMailApiPath, isScoutApiPath } from '../lib/auth/scout-path.ts';
import { botCatchResponse, pgErrorCode } from '../lib/leads/bot-error.ts';
import {
  assertStatusMatchesChannel,
  campaignSlugScope,
  isCampaignContactStatus,
  isCampaignInScope,
  parseCampaignContactStatus,
} from '../lib/leads/campaign-channel.ts';
import {
  contactEmailConflict,
  domainTakenConflict,
  emailOutreachBlockedConflict,
  hasLeadLocator,
  lookupContactFlags,
  personNameFromBody,
  pickLeadMatch,
  splitPersonName,
} from '../lib/leads/kanzlei-mail.ts';
import { parseLinkedInStatus } from '../lib/leads/linkedin-status.ts';
import { EMAIL_CAMPAIGN_NAME, EMAIL_CAMPAIGN_SLUG, isMailStatus, parseMailStatus, usesCampaignLead } from '../lib/leads/mail-status.ts';
import {
  campaignContactFieldsFromBody,
  fillContactNulls,
  fillLeadNulls,
  leadFieldsFromBody,
} from '../lib/leads/scout-queries.ts';
import { normalizeDomain } from '../lib/leads/normalize.ts';
import { normalizeEmail } from '../lib/leads/email-check.ts';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  }
}

const scoutToken = 'scout-test-token';
const mailToken = 'kanzlei-mail-test-token';
const scoutHex = createHash('sha256').update(scoutToken, 'utf8').digest('hex');
const mailHex = createHash('sha256').update(mailToken, 'utf8').digest('hex');

assert(tokenMatches(scoutToken, scoutHex), 'scout token matches own hash');
assert(tokenMatches(mailToken, mailHex), 'mail token matches own hash');
assert(!tokenMatches(scoutToken, mailHex), 'scout token does not match mail hash');
assert(!tokenMatches(mailToken, scoutHex), 'mail token does not match scout hash');
assert(!tokenMatches('', mailHex), 'empty token rejected');
assert(!tokenMatches(mailToken, 'not-a-hash'), 'invalid hex rejected');

process.env.SCOUT_API_TOKEN_SHA256 = scoutHex;
process.env.KANZLEI_MAIL_API_TOKEN_SHA256 = mailHex;

function reqWithBearer(token) {
  return new Request('http://hq.example/api/dummy', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

assert(requireScoutToken(reqWithBearer(scoutToken)).ok === true, 'scout token accepted on scout');
assert(requireKanzleiMailToken(reqWithBearer(mailToken)).ok === true, 'mail token accepted on mail');
assert(requireScoutToken(reqWithBearer(mailToken)).ok === false, 'mail token rejected on scout');
assert(requireKanzleiMailToken(reqWithBearer(scoutToken)).ok === false, 'scout token rejected on mail');
assert(requireKanzleiMailToken(reqWithBearer('')).ok === false, 'missing token 401');
assert(requireKanzleiMailToken(reqWithBearer('falsch-token')).ok === false, 'wrong token 401');
assert(requireScoutToken(reqWithBearer(mailToken)).response?.status === 401, 'cross token scout status 401');
assert(requireKanzleiMailToken(reqWithBearer(scoutToken)).response?.status === 401, 'cross token mail status 401');

assert(isScoutApiPath('/api/scout/leads') === true, 'scout path');
assert(isScoutApiPath('/api/kanzlei-mail/leads') === false, 'mail path is not scout');
assert(isKanzleiMailApiPath('/api/kanzlei-mail/leads') === true, 'mail path');
assert(isKanzleiMailApiPath('/api/kanzlei-mail/leads/lookup') === true, 'mail lookup path');
assert(isKanzleiMailApiPath('/api/scout/leads') === false, 'scout path is not mail');
assert(isKanzleiMailApiPath('/api/mail/send-html') === false, 'smtp mail path is not bot');
assert(hasBearerToken('Bearer x') === true, 'bearer present');
assert(hasBearerToken(null) === false, 'bearer missing');

assert(normalizeDomain('https://WWW.Nordlicht.example/kanzlei') === 'nordlicht.example', 'website to domain');
assert(normalizeEmail('Ada.Beispiel@Nordlicht.example') === 'ada.beispiel@nordlicht.example', 'email lower');

const current = {
  id: '11111111-1111-4111-8111-111111111111',
  companyName: 'Nordlicht Kanzlei',
  domain: 'nordlicht.example',
  street: 'Musterweg 1',
  city: 'Bamberg',
  countryCode: 'DE',
  phone: null,
  industry: 'Rechtsanwaltskanzlei',
  createdAt: null,
  status: 'raw',
  outreachStatus: 'open',
  outreachStatusAt: null,
  searchQueryId: null,
  firmSize: null,
  specialties: null,
  sourceUrl: null,
  fitReason: null,
  source: null,
  notes: null,
  emailOutreachBlocked: false,
};

const incoming = leadFieldsFromBody({
  company_name: 'Andere Kanzlei GmbH',
  website: 'https://www.nordlicht.example/team',
  ort: 'Nürnberg',
  specialties: 'Arbeitsrecht',
  source: 'apify_google_maps',
  notes: 'Maps-Treffer (Testdaten)',
  phone: '0951 0000',
});
const filled = fillLeadNulls(current, incoming);
assert(filled.companyName === undefined, 'null-only keeps company_name');
assert(filled.city === undefined, 'null-only keeps city');
assert(filled.phone === '0951 0000', 'null-only fills phone');
assert(filled.specialties === 'Arbeitsrecht', 'null-only fills specialties');
assert(filled.source === 'apify_google_maps', 'null-only fills source');
assert(filled.notes === 'Maps-Treffer (Testdaten)', 'null-only fills notes');
assert(filled.domain === undefined, 'null-only keeps domain');
assert(!('emailOutreachBlocked' in filled), 'upsert does not set email_outreach_blocked');

const byDomain = { id: 'domain-lead' };
const byCompany = { id: 'company-lead' };
assert(pickLeadMatch(byDomain, byCompany).id === 'domain-lead', 'domain match wins');
assert(pickLeadMatch(null, byCompany).id === 'company-lead', 'company fallback');
assert(pickLeadMatch(null, null) === null, 'no match');
assert(domainTakenConflict('a', 'b')?.status === 409, 'domain taken 409');
assert(domainTakenConflict('a', 'a') === null, 'same lead domain ok');

assert(contactEmailConflict('lead-b', 'lead-a')?.status === 409, 'email other lead 409');
assert(contactEmailConflict('lead-a', 'lead-a') === null, 'email same lead ok');
assert(contactEmailConflict(null, 'lead-a') === null, 'new email ok');

assert(emailOutreachBlockedConflict(true)?.status === 409, 'blocked 409');
assert(
  emailOutreachBlockedConflict(true)?.error.includes('email_outreach_blocked') === true,
  'blocked message names field',
);
assert(emailOutreachBlockedConflict(false) === null, 'not blocked ok');

assert(splitPersonName('Ada Beispiel').firstName === 'Ada', 'split first');
assert(splitPersonName('Ada Beispiel').lastName === 'Beispiel', 'split last');
assert(personNameFromBody({ name: 'Ada Beispiel' }).lastName === 'Beispiel', 'name field');
assert(personNameFromBody({ first_name: 'Ada', last_name: 'Beispiel' }).firstName === 'Ada', 'first last win');
assert(hasLeadLocator({ name: 'Ada Beispiel', email: 'ada@nordlicht.example' }) === false, 'contacts without lead ref');
assert(hasLeadLocator({ company_name: 'Nordlicht Kanzlei' }) === true, 'contacts with company');
assert(hasLeadLocator({ domain: 'nordlicht.example' }) === true, 'contacts with domain');
assert(hasLeadLocator({ lead_id: '11111111-1111-4111-8111-111111111111' }) === true, 'contacts with lead_id');

assert(isMailStatus('mail_neu') === true, 'mail_neu');
assert(isMailStatus('li_shortlist') === false, 'li not mail');
assert(isCampaignContactStatus('mail_entwurf') === true, 'mail status allowed in check');
assert(isCampaignContactStatus('li_vernetzt') === true, 'li status still allowed');
assert(isCampaignContactStatus('sent') === false, 'unknown status rejected');
assert(parseMailStatus('mail_gesendet') === 'mail_gesendet', 'parse mail');
assert(parseCampaignContactStatus('mail_nachfass') === 'mail_nachfass', 'parse union mail');

let threw = false;
try {
  assertStatusMatchesChannel('li_shortlist', 'email');
} catch {
  threw = true;
}
assert(threw, 'li_* on email campaign rejected');
threw = false;
try {
  assertStatusMatchesChannel('mail_neu', 'linkedin');
} catch {
  threw = true;
}
assert(threw, 'mail_* on linkedin campaign rejected');
assertStatusMatchesChannel('mail_neu', 'email');
assertStatusMatchesChannel('li_shortlist', 'linkedin');

assert(campaignSlugScope('linkedin-ki-schulung') === 'linkedin', 'linkedin slug scope');
assert(campaignSlugScope('email-ki-schulung-kanzleien') === 'email', 'email slug scope');
assert(campaignSlugScope('11111111-1111-4111-8111-111111111111') === 'uuid', 'uuid scope');
assert(isCampaignInScope({ channel: 'linkedin' }, 'linkedin') === true, 'linkedin in scout scope');
assert(isCampaignInScope({ channel: 'email' }, 'linkedin') === false, 'email out of scout scope');
assert(isCampaignInScope({ channel: 'email' }, 'email') === true, 'email in mail scope');
assert(isCampaignInScope({ channel: 'linkedin' }, 'email') === false, 'linkedin out of mail scope');

threw = false;
try {
  parseLinkedInStatus('mail_entwurf');
} catch {
  threw = true;
}
assert(threw, 'scout status parser rejects mail_*');
threw = false;
try {
  parseMailStatus('li_shortlist');
} catch {
  threw = true;
}
assert(threw, 'mail status parser rejects li_*');
threw = false;
try {
  campaignContactFieldsFromBody({ status: 'mail_entwurf' }, parseLinkedInStatus);
} catch {
  threw = true;
}
assert(threw, 'scout campaign body rejects mail_*');
threw = false;
try {
  campaignContactFieldsFromBody({ status: 'li_vernetzt' }, parseMailStatus);
} catch {
  threw = true;
}
assert(threw, 'mail campaign body rejects li_*');
assert(
  campaignContactFieldsFromBody({ status: 'li_shortlist' }, parseLinkedInStatus).status === 'li_shortlist',
  'scout body accepts li_*',
);
assert(
  campaignContactFieldsFromBody({ status: 'mail_entwurf' }, parseMailStatus).status === 'mail_entwurf',
  'mail body accepts mail_*',
);

const contactCurrent = {
  id: '22222222-2222-4222-8222-222222222222',
  leadId: '11111111-1111-4111-8111-111111111111',
  salutation: null,
  firstName: 'Ada',
  lastName: 'Beispiel',
  position: 'Partnerin',
  email: 'ada@nordlicht.example',
  phone: null,
  linkedinUrl: 'https://linkedin.com/in/ada-beispiel',
  createdAt: null,
  updatedAt: null,
};
const contactFilled = fillContactNulls(contactCurrent, {
  firstName: 'Andere',
  lastName: 'Person',
  position: 'Associate',
  email: 'neu@nordlicht.example',
  phone: '0951 0000',
  linkedinUrl: 'https://linkedin.com/in/andere',
});
assert(contactFilled.firstName === undefined, 'contact null-only keeps first name');
assert(contactFilled.lastName === undefined, 'contact null-only keeps last name');
assert(contactFilled.position === undefined, 'contact null-only keeps position');
assert(contactFilled.email === undefined, 'contact never replaces email');
assert(contactFilled.linkedinUrl === undefined, 'contact null-only keeps linkedin');
assert(contactFilled.phone === '0951 0000', 'contact null-only fills phone');

const nameless = { ...contactCurrent, email: null, phone: '', firstName: 'Ada' };
const nameMatchFill = fillContactNulls(nameless, { email: 'ada@nordlicht.example', firstName: 'Andere' });
assert(nameMatchFill.email === 'ada@nordlicht.example', 'contact fills empty email');
assert(nameMatchFill.firstName === undefined, 'name match keeps first name');

assert(pgErrorCode({ code: '23505' }) === '23505', 'pg unique code');
assert(pgErrorCode({ cause: { code: 'P0001' } }) === 'P0001', 'pg trigger code');
const uniqueRes = botCatchResponse(Object.assign(new Error('duplicate key value (ada@x)'), { code: '23505' }), 'test');
assert(uniqueRes.status === 409, 'unique maps 409');
const uniqueBody = await uniqueRes.json();
assert(uniqueBody.error === 'Konflikt', 'unique generic message');
assert(!String(uniqueBody.error).includes('ada@'), 'no raw db text');
const triggerRes = botCatchResponse(Object.assign(new Error('linkedin-Kampagne erlaubt nur li_* Status'), { code: 'P0001' }), 'test');
assert(triggerRes.status === 400, 'trigger maps 400');
assert((await triggerRes.json()).error === 'Ungültige Daten', 'trigger generic message');
const validationRes = botCatchResponse(new Error('status erforderlich'), 'test');
assert(validationRes.status === 400, 'validation stays 400');
assert((await validationRes.json()).error === 'status erforderlich', 'validation message kept');

assert(EMAIL_CAMPAIGN_NAME === 'E-Mail KI-Schulung Kanzleien', 'campaign name');
assert(EMAIL_CAMPAIGN_SLUG === 'email-ki-schulung-kanzleien', 'campaign slug');
assert(usesCampaignLead({ channel: 'email', name: 'KI-Schulung Bestand' }) === true, 'legacy email uses campaign_lead');
assert(usesCampaignLead({ channel: 'email', name: EMAIL_CAMPAIGN_NAME }) === false, 'new email uses campaign_contact');
assert(usesCampaignLead({ channel: 'linkedin', name: 'LinkedIn KI-Schulung Kanzleien' }) === false, 'linkedin uses campaign_contact');

const flags = lookupContactFlags([
  { linkedin_url: 'https://linkedin.com/in/ada-beispiel', campaign_contacts: [] },
  { linkedin_url: null, campaign_contacts: [{ status: 'mail_neu' }] },
]);
assert(flags.has_scout_contacts === true, 'scout contact via linkedin_url');
assert(flags.has_linkedin_contacts === true, 'linkedin contact via url');
assert(lookupContactFlags([{ linkedin_url: null, campaign_contacts: [{ status: 'mail_neu' }] }]).has_scout_contacts === false, 'mail-only is not scout');
assert(lookupContactFlags([{ linkedin_url: null, campaign_contacts: [{ status: 'li_vernetzt' }] }]).has_linkedin_contacts === true, 'li campaign counts');

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('assert-kanzlei-mail: ok');
