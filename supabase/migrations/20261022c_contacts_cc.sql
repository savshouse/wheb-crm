-- Add CC-contact flag to contacts (used for bulk email CC suggestions)
alter table contacts add column if not exists is_cc_contact boolean default false;
