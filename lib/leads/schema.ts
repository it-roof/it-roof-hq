import { pgTable, uuid, text, timestamp, varchar, integer, boolean, primaryKey, index, uniqueIndex, date } from 'drizzle-orm/pg-core';

export const lead = pgTable('lead', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  companyName: text('company_name').notNull(),
  domain: text(),
  street: text(),
  city: text(),
  countryCode: text('country_code'),
  phone: text(),
  industry: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
  status: text().notNull(),
  /** Zustellung/Outreach — getrennt von Datenqualität (`status`) */
  outreachStatus: text('outreach_status').notNull().default('open'),
  /** Wann outreach_status zuletzt gesetzt/geprüft wurde */
  outreachStatusAt: timestamp('outreach_status_at', { withTimezone: true, mode: 'string' }),
  searchQueryId: uuid('search_query_id'),
  firmSize: text('firm_size'),
  specialties: text(),
  sourceUrl: text('source_url'),
  fitReason: text('fit_reason'),
  emailOutreachBlocked: boolean('email_outreach_blocked').notNull().default(false),
});

export const leadContact = pgTable('lead_contact', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  leadId: uuid('lead_id').notNull(),
  salutation: varchar({ length: 255 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  position: varchar({ length: 255 }),
  email: varchar({ length: 255 }),
  phone: varchar({ length: 255 }),
  linkedinUrl: text('linkedin_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
}, (table) => [
  index('lead_contact_lead_id_idx').on(table.leadId),
  uniqueIndex('lead_contact_linkedin_url_key').on(table.linkedinUrl),
]);

export const campaign = pgTable('campaign', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  description: text(),
  channel: text().notNull().default('email'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
});

export const campaignStep = pgTable('campaign_step', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  campaignId: uuid('campaign_id').notNull(),
  stepOrder: integer('step_order').notNull(),
  type: text().notNull(),
  delayDays: integer('delay_days').notNull(),
  subjectTemplate: text('subject_template'),
  bodyTemplate: text('body_template'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
});

export const campaignLead = pgTable('campaign_lead', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  campaignId: uuid('campaign_id').notNull(),
  leadId: uuid('lead_id').notNull(),
  currentStepId: uuid('current_step_id'),
  status: text().notNull(),
  lastActionAt: timestamp('last_action_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
});

/** Historie: Step erledigt / übersprungen */
export const campaignLeadAction = pgTable('campaign_lead_action', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  campaignLeadId: uuid('campaign_lead_id').notNull(),
  stepId: uuid('step_id').notNull(),
  action: text().notNull(),
  renderedSubject: text('rendered_subject'),
  renderedBody: text('rendered_body'),
  note: text(),
  actedAt: timestamp('acted_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const campaignContact = pgTable('campaign_contact', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  campaignId: uuid('campaign_id').notNull(),
  leadContactId: uuid('lead_contact_id').notNull(),
  status: text().notNull(),
  statusAt: timestamp('status_at', { withTimezone: true, mode: 'string' }),
  notes: text(),
  nextStep: text('next_step'),
  requestedAt: date('requested_at', { mode: 'string' }),
  acceptedAt: date('accepted_at', { mode: 'string' }),
  writeFrom: date('write_from', { mode: 'string' }),
  writtenAt: date('written_at', { mode: 'string' }),
  repliedAt: date('replied_at', { mode: 'string' }),
  draftSubject: text('draft_subject'),
  draftBody: text('draft_body'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }),
}, (table) => [
  uniqueIndex('campaign_contact_campaign_id_lead_contact_id_key').on(
    table.campaignId,
    table.leadContactId,
  ),
]);

export const searchQuery = pgTable('search_query', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  query: text().notNull(),
  searched: boolean().notNull(),
  searchedAt: timestamp('searched_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
});

export const tag = pgTable('tag', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
});

export const searchQueryTag = pgTable('search_query_tag', {
  searchQueryId: uuid('search_query_id').notNull(),
  tagId: uuid('tag_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.searchQueryId, table.tagId] }),
]);
