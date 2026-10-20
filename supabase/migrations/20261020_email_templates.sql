-- ─────────────────────────────────────────────────────────────
-- Email templates + send log
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text,
  subject     text NOT NULL,
  html_body   text NOT NULL,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read email_templates"  ON email_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert email_templates"             ON email_templates FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update email_templates"             ON email_templates FOR UPDATE USING    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete email_templates"             ON email_templates FOR DELETE USING    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS email_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  template_name    text NOT NULL,
  subject          text NOT NULL,
  recipient_count  int  NOT NULL,
  sent_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at          timestamptz DEFAULT now()
);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read email_sends"  ON email_sends FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert email_sends" ON email_sends FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
