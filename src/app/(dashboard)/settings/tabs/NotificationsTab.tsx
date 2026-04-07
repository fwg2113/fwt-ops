'use client';

import { useState, useEffect } from 'react';
import { DashboardCard, Button, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function NotificationsTab({ data, onSave, onRefresh }: Props) {
  const isMobile = useIsMobile();
  const config = data.shopConfig as Record<string, unknown> || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Team Notifications
  const [notificationPhone, setNotificationPhone] = useState(String(config.notification_phone || config.shop_phone || ''));
  const [notificationEmail, setNotificationEmail] = useState(String(config.notification_email || ''));
  const [notifyNewBooking, setNotifyNewBooking] = useState(config.notify_team_new_booking !== false);
  const [notifyQuoteApproved, setNotifyQuoteApproved] = useState(config.notify_team_quote_approved !== false);
  const [notifyPaymentReceived, setNotifyPaymentReceived] = useState(config.notify_team_payment_received !== false);

  // Customer Notifications
  const [notifyCustomerBooking, setNotifyCustomerBooking] = useState(config.notify_customer_booking_confirmed !== false);
  const [customerConfirmationTemplate, setCustomerConfirmationTemplate] = useState(
    String(config.customer_booking_confirmation_template || 'Hi {customer_first_name}, your appointment at {shop_name} has been confirmed for {appointment_date} at {appointment_time}. {vehicle_year} {vehicle_make} {vehicle_model}. We look forward to seeing you!')
  );

  // Appointment Reminders
  const [reminder24hr, setReminder24hr] = useState(config.reminder_24hr_enabled !== false);
  const [reminder1hr, setReminder1hr] = useState(config.reminder_1hr_enabled !== false);
  const [reminder24hrTemplate, setReminder24hrTemplate] = useState(
    String(config.reminder_24hr_template || 'Hi {customer_first_name}, this is a reminder that your appointment at {shop_name} is tomorrow, {appointment_date}. {vehicle_year} {vehicle_make} {vehicle_model}. See you then!')
  );
  const [reminder1hrTemplate, setReminder1hrTemplate] = useState(
    String(config.reminder_1hr_template || 'Hi {customer_first_name}, just a reminder your appointment at {shop_name} is in about 1 hour. We look forward to seeing your {vehicle_year} {vehicle_make} {vehicle_model}!')
  );

  // Default Send Methods
  const [defaultSendSms, setDefaultSendSms] = useState(config.default_send_sms !== false);
  const [defaultSendEmail, setDefaultSendEmail] = useState(config.default_send_email !== false);

  // Lead Follow-Up: off / manual / automatic
  function deriveFollowupMode(): 'off' | 'manual' | 'automatic' {
    if (config.followup_enabled === false) return 'off';
    if (config.followup_auto_enabled) return 'automatic';
    return 'manual';
  }
  const [followupMode, setFollowupMode] = useState<'off' | 'manual' | 'automatic'>(deriveFollowupMode());
  const [followupDefaultDiscountType, setFollowupDefaultDiscountType] = useState(String(config.followup_default_discount_type || 'dollar'));
  const [followupDefaultDiscountAmount, setFollowupDefaultDiscountAmount] = useState(String(config.followup_default_discount_amount || '0'));
  const [followupAutoDays, setFollowupAutoDays] = useState(String(config.followup_auto_days || '3'));
  const [followupAutoSendHour, setFollowupAutoSendHour] = useState(String(config.followup_auto_send_hour ?? '9'));
  const [followupExpiryDays, setFollowupExpiryDays] = useState(String(config.followup_expiry_days || '30'));

  // Review Requests
  const [reviewEnabled, setReviewEnabled] = useState(Boolean(config.review_request_enabled));
  const [reviewDelay, setReviewDelay] = useState(String(config.review_request_delay_hours || '2'));
  const [reviewTemplate, setReviewTemplate] = useState(
    String(config.review_request_template || 'Hi {customer_first_name}, thank you for choosing {shop_name}! If you had a great experience, we would really appreciate a review: {review_link}')
  );
  const [reviewLink, setReviewLink] = useState(String(config.review_link || ''));

  // Sync state from props when data refreshes after save
  useEffect(() => {
    setNotificationPhone(String(config.notification_phone || config.shop_phone || ''));
    setNotificationEmail(String(config.notification_email || ''));
    setNotifyNewBooking(config.notify_team_new_booking !== false);
    setNotifyQuoteApproved(config.notify_team_quote_approved !== false);
    setNotifyPaymentReceived(config.notify_team_payment_received !== false);
    setNotifyCustomerBooking(config.notify_customer_booking_confirmed !== false);
    setCustomerConfirmationTemplate(String(config.customer_booking_confirmation_template || 'Hi {customer_first_name}, your appointment at {shop_name} has been confirmed for {appointment_date} at {appointment_time}. {vehicle_year} {vehicle_make} {vehicle_model}. We look forward to seeing you!'));
    setReminder24hr(config.reminder_24hr_enabled !== false);
    setReminder1hr(config.reminder_1hr_enabled !== false);
    setDefaultSendSms(config.default_send_sms !== false);
    setDefaultSendEmail(config.default_send_email !== false);
    setFollowupMode(config.followup_enabled === false ? 'off' : config.followup_auto_enabled ? 'automatic' : 'manual');
    setFollowupDefaultDiscountType(String(config.followup_default_discount_type || 'dollar'));
    setFollowupDefaultDiscountAmount(String(config.followup_default_discount_amount || '0'));
    setFollowupAutoDays(String(config.followup_auto_days || '3'));
    setFollowupAutoSendHour(String(config.followup_auto_send_hour ?? '9'));
    setFollowupExpiryDays(String(config.followup_expiry_days || '30'));
    setReviewEnabled(Boolean(config.review_request_enabled));
    setReviewDelay(String(config.review_request_delay_hours || '2'));
    setReviewLink(String(config.review_link || ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function handleSave() {
    setSaving(true);
    const success = await onSave('shop_config', null, {
      notification_phone: notificationPhone || null,
      notification_email: notificationEmail || null,
      notify_team_new_booking: notifyNewBooking,
      notify_team_quote_approved: notifyQuoteApproved,
      notify_team_payment_received: notifyPaymentReceived,
      notify_customer_booking_confirmed: notifyCustomerBooking,
      customer_booking_confirmation_template: customerConfirmationTemplate,
      reminder_24hr_enabled: reminder24hr,
      reminder_1hr_enabled: reminder1hr,
      reminder_24hr_template: reminder24hrTemplate,
      reminder_1hr_template: reminder1hrTemplate,
      default_send_sms: defaultSendSms,
      default_send_email: defaultSendEmail,
      review_request_enabled: reviewEnabled,
      review_request_delay_hours: parseInt(reviewDelay) || 2,
      review_request_template: reviewTemplate,
      review_link: reviewLink || null,
      followup_enabled: followupMode !== 'off',
      followup_auto_enabled: followupMode === 'automatic',
      followup_default_discount_type: followupDefaultDiscountType,
      followup_default_discount_amount: parseFloat(followupDefaultDiscountAmount) || 0,
      followup_auto_days: parseInt(followupAutoDays) || 3,
      followup_auto_send_hour: parseInt(followupAutoSendHour) || 9,
      followup_expiry_days: parseInt(followupExpiryDays) || 30,
    });
    setSaving(false);
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 2000); onRefresh(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Team Alerts */}
      <DashboardCard title="Team Alerts">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
          Automated SMS and email alerts sent to the team when key events happen.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
          <FormField label="Team Notification Phone" hint="Phone number that receives team alerts">
            <TextInput value={notificationPhone} onChange={e => setNotificationPhone(e.target.value)} placeholder="(240) 663-8186" />
          </FormField>
          <FormField label="Team Notification Email" hint="Email that receives team alerts (optional)">
            <TextInput value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} placeholder="team@yourshop.com" />
          </FormField>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
          <Toggle label="New online booking confirmed" checked={notifyNewBooking} onChange={setNotifyNewBooking} />
          <Toggle label="Quote approved by customer" checked={notifyQuoteApproved} onChange={setNotifyQuoteApproved} />
          <Toggle label="Payment received" checked={notifyPaymentReceived} onChange={setNotifyPaymentReceived} />
        </div>
      </DashboardCard>

      {/* Customer Booking Confirmation */}
      <DashboardCard title="Customer Booking Confirmation">
        <Toggle label="Send confirmation SMS + email when a customer books online" checked={notifyCustomerBooking} onChange={setNotifyCustomerBooking} />
        {notifyCustomerBooking && (
          <div style={{ marginTop: SPACING.md }}>
            <FormField label="Confirmation SMS Template" hint="Variables: {customer_first_name}, {customer_name}, {appointment_date}, {appointment_time}, {vehicle_year}, {vehicle_make}, {vehicle_model}, {shop_name}, {shop_phone}">
              <textarea
                value={customerConfirmationTemplate}
                onChange={e => setCustomerConfirmationTemplate(e.target.value)}
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

      {/* Default Send Methods */}
      <DashboardCard title="Default Send Methods">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
          When sending quotes or invoices, which methods should be checked by default?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
          <Toggle label="SMS (text message)" checked={defaultSendSms} onChange={setDefaultSendSms} />
          <Toggle label="Email" checked={defaultSendEmail} onChange={setDefaultSendEmail} />
        </div>
      </DashboardCard>

      {/* Appointment Reminders */}
      <DashboardCard title="Appointment Reminders">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
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

      {/* Lead Follow-Up System */}
      <DashboardCard title="Lead Follow-Up System">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.lg}px 0` }}>
          Follow up on sent quotes that have not been booked. Choose how your shop handles follow-ups.
        </p>

        {/* Mode selector: Off / Manual / Automatic */}
        <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg }}>
          {([
            { key: 'off', label: 'Off', desc: 'No follow-ups' },
            { key: 'manual', label: 'Manual', desc: 'You send follow-ups from the pipeline' },
            { key: 'automatic', label: 'Automatic', desc: 'System sends follow-ups for you' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setFollowupMode(opt.key)}
              style={{
                flex: 1, padding: `${SPACING.md}px`, borderRadius: RADIUS.md, cursor: 'pointer',
                background: followupMode === opt.key ? COLORS.activeBg : 'transparent',
                border: `2px solid ${followupMode === opt.key ? COLORS.red : COLORS.borderInput}`,
                textAlign: 'center', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: FONT.sizeSm, color: followupMode === opt.key ? COLORS.red : COLORS.textPrimary, marginBottom: 2 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {followupMode !== 'off' && (
          <>
            {/* Default Incentive -- applies to both manual and automatic */}
            <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>Default Incentive</div>
            <p style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, margin: `0 0 ${SPACING.sm}px 0` }}>
              {followupMode === 'manual'
                ? 'Pre-fills the incentive when you send a follow-up. Can be overridden per lead. Set to 0 for no default.'
                : 'Applied automatically when the system sends a follow-up. Set to 0 for no incentive.'}
            </p>
            <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', marginBottom: SPACING.lg }}>
              <FormField label="Discount Type">
                <SelectInput value={followupDefaultDiscountType} onChange={e => setFollowupDefaultDiscountType(e.target.value)}>
                  <option value="dollar">$ Dollar Off</option>
                  <option value="percent">% Percent Off</option>
                </SelectInput>
              </FormField>
              <FormField label="Amount">
                <TextInput type="number" value={followupDefaultDiscountAmount} onChange={e => setFollowupDefaultDiscountAmount(e.target.value)} style={{ width: 100 }} />
              </FormField>
            </div>

            {/* Lead Expiry -- applies to both modes */}
            <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>Lead Expiry</div>
            <div style={{ marginBottom: SPACING.lg }}>
              <FormField label="" hint="Auto-expire leads after this many days with no booking">
                <SelectInput value={followupExpiryDays} onChange={e => setFollowupExpiryDays(e.target.value)}>
                  <option value="3">3 days</option>
                  <option value="5">5 days</option>
                  <option value="7">7 days</option>
                  <option value="10">10 days</option>
                  <option value="14">14 days</option>
                  <option value="21">21 days</option>
                  <option value="30">30 days</option>
                  <option value="45">45 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                </SelectInput>
              </FormField>
            </div>

            {/* Automatic-only settings */}
            {followupMode === 'automatic' && (
              <>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: SPACING.sm }}>Automation Timing</div>
                <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
                  <FormField label="Send follow-up after" hint="Days after quote sent with no response">
                    <SelectInput value={followupAutoDays} onChange={e => setFollowupAutoDays(e.target.value)}>
                      <option value="1">1 day</option>
                      <option value="2">2 days</option>
                      <option value="3">3 days</option>
                      <option value="5">5 days</option>
                      <option value="7">7 days</option>
                    </SelectInput>
                  </FormField>
                  <FormField label="Send time" hint="Time of day follow-ups go out">
                    <SelectInput value={followupAutoSendHour} onChange={e => setFollowupAutoSendHour(e.target.value)}>
                      <option value="7">7:00 AM</option>
                      <option value="8">8:00 AM</option>
                      <option value="9">9:00 AM</option>
                      <option value="10">10:00 AM</option>
                      <option value="11">11:00 AM</option>
                      <option value="12">12:00 PM</option>
                      <option value="13">1:00 PM</option>
                      <option value="14">2:00 PM</option>
                      <option value="15">3:00 PM</option>
                      <option value="16">4:00 PM</option>
                      <option value="17">5:00 PM</option>
                      <option value="18">6:00 PM</option>
                      <option value="19">7:00 PM</option>
                      <option value="20">8:00 PM</option>
                    </SelectInput>
                  </FormField>
                </div>
              </>
            )}
          </>
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
