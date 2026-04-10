'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardCard, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { BUILTIN_SOUNDS, playBuiltinSound, playCustomSound } from '@/app/lib/notificationSounds';

interface NotifSettings {
  sound_enabled: boolean;
  message_sound_key: string;
  email_sound_key: string;
  payment_sound_key: string;
  call_sound_key: string;
  booking_sound_key: string;
  start_hour: number;
  end_hour: number;
  message_repeat_interval: number;
  email_repeat_interval: number;
  email_alerts_enabled: boolean;
  email_alert_address: string;
}

interface CustomSound {
  id: string;
  label: string;
  dataUrl: string;
}

const DEFAULT_SETTINGS: NotifSettings = {
  sound_enabled: true,
  message_sound_key: 'chime',
  email_sound_key: 'bell',
  payment_sound_key: 'cascade',
  call_sound_key: 'doorbell',
  booking_sound_key: 'xylophone',
  start_hour: 9,
  end_hour: 17,
  message_repeat_interval: 60,
  email_repeat_interval: 60,
  email_alerts_enabled: true,
  email_alert_address: '',
};

export default function NotificationSoundsTab() {
  const [settings, setSettings] = useState<NotifSettings>(DEFAULT_SETTINGS);
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [notifRes, soundsRes] = await Promise.all([
      fetch('/api/settings/notifications').then(r => r.json()),
      fetch('/api/settings/notification-sounds').then(r => r.json()),
    ]);
    setSettings({ ...DEFAULT_SETTINGS, ...notifRes });
    setCustomSounds(soundsRes.sounds || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSave() {
    setSaving(true);
    await fetch('/api/settings/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', uploadLabel || file.name.replace(/\.[^.]+$/, ''));
    try {
      const res = await fetch('/api/settings/notification-sounds', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.sound) {
        setCustomSounds(prev => [...prev, data.sound]);
        setUploadLabel('');
        playCustomSound(data.sound.dataUrl);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch { alert('Upload failed'); }
    setUploading(false);
    e.target.value = '';
  }

  async function handleDeleteSound(id: string, label: string) {
    if (!confirm(`Delete "${label}"?`)) return;
    const res = await fetch('/api/settings/notification-sounds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setCustomSounds(prev => prev.filter(s => s.id !== id));
      const customKey = `custom:${id}`;
      const updates: Partial<NotifSettings> = {};
      if (settings.message_sound_key === customKey) updates.message_sound_key = 'chime';
      if (settings.email_sound_key === customKey) updates.email_sound_key = 'bell';
      if (settings.payment_sound_key === customKey) updates.payment_sound_key = 'cascade';
      if (settings.call_sound_key === customKey) updates.call_sound_key = 'doorbell';
      if (settings.booking_sound_key === customKey) updates.booking_sound_key = 'xylophone';
      if (Object.keys(updates).length > 0) setSettings(prev => ({ ...prev, ...updates }));
    }
  }

  function renderSoundGrid(settingKey: keyof NotifSettings, accentColor: string) {
    const currentValue = settings[settingKey] as string;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {BUILTIN_SOUNDS.map(sound => (
            <button key={sound.key} onClick={() => {
              setSettings(prev => ({ ...prev, [settingKey]: sound.key }));
              playBuiltinSound(sound.key);
            }} style={{
              padding: 10, textAlign: 'left', cursor: 'pointer',
              background: currentValue === sound.key ? `${accentColor}20` : COLORS.inputBg,
              border: currentValue === sound.key ? `2px solid ${accentColor}` : `1px solid ${COLORS.borderInput}`,
              borderRadius: RADIUS.md,
            }}>
              <div style={{ color: COLORS.textPrimary, fontSize: FONT.sizeSm, fontWeight: 500, marginBottom: 2 }}>{sound.label}</div>
              <div style={{ color: COLORS.textMuted, fontSize: '0.65rem' }}>{sound.description}</div>
            </button>
          ))}
        </div>
        {customSounds.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
            {customSounds.map(sound => (
              <button key={sound.id} onClick={() => {
                setSettings(prev => ({ ...prev, [settingKey]: `custom:${sound.id}` }));
                playCustomSound(sound.dataUrl);
              }} style={{
                padding: 10, textAlign: 'left', cursor: 'pointer',
                background: currentValue === `custom:${sound.id}` ? `${accentColor}20` : COLORS.inputBg,
                border: currentValue === `custom:${sound.id}` ? `2px solid ${accentColor}` : `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.md,
              }}>
                <div style={{ color: COLORS.textPrimary, fontSize: FONT.sizeSm, fontWeight: 500, marginBottom: 2 }}>{sound.label}</div>
                <div style={{ color: COLORS.textMuted, fontSize: '0.65rem' }}>Custom upload</div>
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  if (loading) return <div style={{ color: COLORS.textMuted, padding: SPACING.xl }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* Audible Alerts */}
      <DashboardCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg }}>
          <div>
            <div style={{ color: COLORS.textPrimary, fontSize: '16px', fontWeight: 700, marginBottom: 4 }}>Audible Alerts</div>
            <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Play separate sounds for calls, messages, and payments</div>
          </div>
          <button onClick={() => setSettings(prev => ({ ...prev, sound_enabled: !prev.sound_enabled }))} style={{
            width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
            background: settings.sound_enabled ? '#22c55e' : COLORS.borderInput,
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: settings.sound_enabled ? 25 : 3, transition: 'left 0.2s' }} />
          </button>
        </div>

        {settings.sound_enabled && (
          <>
            {/* Incoming Call Alert Sound */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#f97316', fontSize: FONT.sizeSm, fontWeight: 700, marginBottom: 4 }}>Incoming Call Alert Sound</div>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, marginBottom: 10 }}>Plays when a new inbound call arrives (before menu selection)</div>
              {renderSoundGrid('call_sound_key', '#f97316')}
            </div>

            {/* Message Alert Sound */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#d71cd1', fontSize: FONT.sizeSm, fontWeight: 700, marginBottom: 4 }}>Message Alert Sound</div>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, marginBottom: 10 }}>Plays when there are unread SMS messages</div>
              {renderSoundGrid('message_sound_key', '#d71cd1')}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, whiteSpace: 'nowrap' }}>Repeat:</span>
                <select value={settings.message_repeat_interval} onChange={e => setSettings(prev => ({ ...prev, message_repeat_interval: parseInt(e.target.value) }))}
                  style={{ padding: '8px 12px', background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 1 minute</option>
                  <option value={120}>Every 2 minutes</option>
                  <option value={300}>Every 5 minutes</option>
                  <option value={600}>Every 10 minutes</option>
                </select>
                <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>while messages remain unread</span>
              </div>
            </div>

            {/* Payment Alert Sound */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#22c55e', fontSize: FONT.sizeSm, fontWeight: 700, marginBottom: 4 }}>Payment Alert Sound</div>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, marginBottom: 10 }}>Plays once when a new payment is received</div>
              {renderSoundGrid('payment_sound_key', '#22c55e')}
            </div>

            {/* New Booking Alert Sound */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#3b82f6', fontSize: FONT.sizeSm, fontWeight: 700, marginBottom: 4 }}>New Booking Alert Sound</div>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, marginBottom: 10 }}>Plays once when a new appointment is booked (online or by team) and the toast appears on the appointments page</div>
              {renderSoundGrid('booking_sound_key', '#3b82f6')}
            </div>

            {/* Custom Sounds */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600, marginBottom: 10 }}>Custom Sounds</div>
              {customSounds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {customSounds.map(sound => (
                    <div key={sound.id} style={{
                      padding: '8px 12px', background: COLORS.inputBg,
                      border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>{sound.label}</span>
                      <button onClick={() => handleDeleteSound(sound.id, sound.label)} style={{
                        background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
                        fontSize: 16, padding: '0 2px', lineHeight: 1,
                      }}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: COLORS.inputBg, borderRadius: RADIUS.md, padding: SPACING.md, border: `1px dashed ${COLORS.borderInput}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeXs, marginBottom: 4 }}>Sound Name</label>
                    <input type="text" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="e.g. Duck Quack"
                      style={{ width: '100%', padding: '8px 12px', background: COLORS.cardBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm }} />
                  </div>
                  <label style={{
                    padding: '8px 16px', background: uploading ? COLORS.borderInput : COLORS.red,
                    border: 'none', borderRadius: RADIUS.sm, color: '#fff', fontSize: FONT.sizeSm,
                    fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {uploading ? 'Uploading...' : 'Upload Sound'}
                    <input type="file" accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,audio/*" style={{ display: 'none' }}
                      disabled={uploading} onChange={handleUpload} />
                  </label>
                </div>
                <p style={{ color: COLORS.textMuted, fontSize: '0.65rem', margin: '8px 0 0 0' }}>Supported formats: MP3, WAV, OGG, M4A, AAC (max 500KB). Short clips (1-5 seconds) work best.</p>
              </div>
            </div>

            {/* Active Hours */}
            <div>
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600, marginBottom: 10 }}>Active Hours</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <select value={settings.start_hour} onChange={e => setSettings(prev => ({ ...prev, start_hour: parseInt(e.target.value) }))}
                  style={{ padding: '10px 14px', background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                  ))}
                </select>
                <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>to</span>
                <select value={settings.end_hour} onChange={e => setSettings(prev => ({ ...prev, end_hour: parseInt(e.target.value) }))}
                  style={{ padding: '10px 14px', background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
                  ))}
                </select>
              </div>
              <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, margin: '8px 0 0 0' }}>All sound alerts only play during these hours (your local time)</p>
            </div>
          </>
        )}
      </DashboardCard>

      {/* Email Alerts */}
      <DashboardCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: settings.email_alerts_enabled ? SPACING.md : 0 }}>
          <div>
            <div style={{ color: COLORS.textPrimary, fontSize: '16px', fontWeight: 700, marginBottom: 4 }}>Email Alerts</div>
            <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Receive email notifications for incoming SMS messages</div>
          </div>
          <button onClick={() => setSettings(prev => ({ ...prev, email_alerts_enabled: !prev.email_alerts_enabled }))} style={{
            width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
            background: settings.email_alerts_enabled ? '#22c55e' : COLORS.borderInput,
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: settings.email_alerts_enabled ? 25 : 3, transition: 'left 0.2s' }} />
          </button>
        </div>
        {settings.email_alerts_enabled && (
          <div>
            <label style={{ display: 'block', color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600, marginBottom: 6 }}>Alert Email Address</label>
            <input type="email" value={settings.email_alert_address}
              onChange={e => setSettings(prev => ({ ...prev, email_alert_address: e.target.value }))}
              style={{ width: '100%', padding: '10px 14px', background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm }} />
            <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs, margin: '8px 0 0 0' }}>An email will be sent to this address for every incoming text message</p>
          </div>
        )}
      </DashboardCard>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        {saved && <span style={{ color: '#22c55e', fontSize: FONT.sizeSm }}>Settings saved!</span>}
        <Button variant="primary" onClick={handleSave} disabled={saving}
          style={saved ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Notification Settings'}
        </Button>
      </div>
    </div>
  );
}
