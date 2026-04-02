'use client';

import { useState } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function NotificationsTab({ data, onSave, onRefresh }: Props) {
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Appointment Reminders
  const [reminder24hr, setReminder24hr] = useState(config.reminder_24hr_enabled !== false);
  const [reminder1hr, setReminder1hr] = useState(config.reminder_1hr_enabled !== false);
  const [reminder24hrTemplate, setReminder24hrTemplate] = useState(
    String(config.reminder_24hr_template || 'Hi {customer_first_name}, this is a reminder that your appointment at {shop_name} is tomorrow, {appointment_date}. {vehicle_year} {vehicle_make} {vehicle_model}. See you then!')
  );
  const [reminder1hrTemplate, setReminder1hrTemplate] = useState(
    String(config.reminder_1hr_template || 'Hi {customer_first_name}, just a reminder your appointment at {shop_name} is in about 1 hour. We look forward to seeing your {vehicle_year} {vehicle_make} {vehicle_model}!')
  );

  // Review Requests
  const [reviewEnabled, setReviewEnabled] = useState(Boolean(config.review_request_enabled));
  const [reviewDelay, setReviewDelay] = useState(String(config.review_request_delay_hours || '2'));
  const [reviewTemplate, setReviewTemplate] = useState(
    String(config.review_request_template || 'Hi {customer_first_name}, thank you for choosing {shop_name}! If you had a great experience, we would really appreciate a review: {review_link}')
  );
  const [reviewLink, setReviewLink] = useState(String(config.review_link || ''));

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      reminder_24hr_enabled: reminder24hr,
      reminder_1hr_enabled: reminder1hr,
      reminder_24hr_template: reminder24hrTemplate,
      reminder_1hr_template: reminder1hrTemplate,
      review_request_enabled: reviewEnabled,
      review_request_delay_hours: parseInt(reviewDelay) || 2,
      review_request_template: reviewTemplate,
      review_link: reviewLink || null,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Appointment Reminders */}
      <DashboardCard title="Appointment Reminders">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
          <div>
            <Toggle label="24-Hour Reminder (day before)" checked={reminder24hr} onChange={setReminder24hr} />
            {reminder24hr && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="24-Hour Template" hint="Variables: {customer_first_name}, {appointment_date}, {vehicle_year}, {vehicle_make}, {vehicle_model}, {shop_name}">
                  <textarea
                    value={reminder24hrTemplate}
                    onChange={e => setReminder24hrTemplate(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                      color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                      borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                      resize: 'vertical', outline: 'none',
                    }}
                  />
                </FormField>
              </div>
            )}
          </div>
          <div>
            <Toggle label="1-Hour Reminder (same day)" checked={reminder1hr} onChange={setReminder1hr} />
            {reminder1hr && (
              <div style={{ marginTop: SPACING.sm }}>
                <FormField label="1-Hour Template" hint="Same variables as above">
                  <textarea
                    value={reminder1hrTemplate}
                    onChange={e => setReminder1hrTemplate(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                      color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                      borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                      resize: 'vertical', outline: 'none',
                    }}
                  />
                </FormField>
              </div>
            )}
          </div>
        </div>
      </DashboardCard>

      {/* Review Requests */}
      <DashboardCard title="Review Requests">
        <Toggle label="Send review request after completed jobs" checked={reviewEnabled} onChange={setReviewEnabled} />
        {reviewEnabled && (
          <div style={{ marginTop: SPACING.md }}>
            <FormField label="Google Review Link" hint="Paste your Google Business review URL here">
              <TextInput value={reviewLink} onChange={e => setReviewLink(e.target.value)} placeholder="https://g.page/your-business/review" />
            </FormField>
            <FormField label="Delay (hours after job completion)">
              <SelectInput value={reviewDelay} onChange={e => setReviewDelay(e.target.value)}>
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="3">3 hours</option>
                <option value="4">4 hours</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours (next day)</option>
              </SelectInput>
            </FormField>
            <FormField label="Review Request Template" hint="Variables: {customer_first_name}, {customer_name}, {shop_name}, {review_link}, {vehicle_year}, {vehicle_make}, {vehicle_model}">
              <textarea
                value={reviewTemplate}
                onChange={e => setReviewTemplate(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: SPACING.md, background: COLORS.inputBg,
                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none',
                }}
              />
            </FormField>
          </div>
        )}
      </DashboardCard>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
        background: checked ? COLORS.red : COLORS.borderInput,
        position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: FONT.sizeSm, color: checked ? COLORS.textPrimary : COLORS.textMuted }}>
        {label}
      </span>
    </label>
  );
}
