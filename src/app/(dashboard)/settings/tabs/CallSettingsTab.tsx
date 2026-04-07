'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardCard, Button, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface TeamPhone {
  id: string;
  name: string;
  phone: string;
  enabled: boolean;
  ring_order: number;
  sip_uri: string | null;
}

interface GreetingRecording {
  id: string;
  name: string;
  url: string;
  r2_key: string | null;
  is_active: boolean;
  greeting_type: string;
  created_at: string;
}

const IVR_CATEGORIES = [
  { key: 'auto-tint', digit: '1', label: 'Automotive Window Tint' },
  { key: 'flat-glass', digit: '2', label: 'Residential & Commercial' },
  { key: 'ppf', digit: '3', label: 'Paint Protection Film' },
  { key: 'wraps-graphics', digit: '4', label: 'Wraps & Graphics' },
  { key: 'apparel', digit: '5', label: 'Custom Apparel' },
  { key: 'general', digit: '6', label: 'General Inquiry' },
] as const;

export default function CallSettingsTab() {
  const isMobile = useIsMobile();
  const [teamPhones, setTeamPhones] = useState<TeamPhone[]>([]);
  const [recordings, setRecordings] = useState<GreetingRecording[]>([]);
  const [loading, setLoading] = useState(true);

  // Add phone
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSipUri, setNewSipUri] = useState('');
  const [saving, setSaving] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingType, setRecordingType] = useState<string>('main');
  const [greetingName, setGreetingName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [phonesRes, recordingsRes] = await Promise.all([
      fetch('/api/voice/call-settings').then(r => r.json()),
      fetch('/api/voice/greeting/recordings').then(r => r.json()),
    ]);
    setTeamPhones(phonesRes.settings || []);
    setRecordings(recordingsRes.recordings || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // --- Team Phone CRUD ---
  async function handleAddPhone() {
    if (!newName || !newPhone) return;
    setSaving(true);
    const clean = newPhone.replace(/\D/g, '');
    const formatted = clean.length === 10 ? `+1${clean}` : `+${clean}`;
    let sipVal = newSipUri.trim() || null;
    if (sipVal) {
      sipVal = sipVal.replace(/^SIP:\s*/i, '');
      if (!sipVal.startsWith('sip:')) sipVal = 'sip:' + sipVal;
    }
    await fetch('/api/voice/call-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, phone: formatted, sip_uri: sipVal, enabled: true, ring_order: teamPhones.length }),
    });
    setNewName(''); setNewPhone(''); setNewSipUri('');
    setSaving(false);
    fetchAll();
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch('/api/voice/call-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) });
    setTeamPhones(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
  }

  async function deletePhone(id: string) {
    if (!confirm('Remove this team member from the phone system?')) return;
    await fetch('/api/voice/call-settings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setTeamPhones(prev => prev.filter(p => p.id !== id));
  }

  // --- WebM to WAV conversion ---
  async function convertToWav(blob: Blob): Promise<Blob> {
    const audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    audioContext.close();
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // --- Upload greeting (presigned URL -> R2) ---
  async function uploadGreeting(blob: Blob, filename: string, greetingType: string) {
    setUploading(true);
    try {
      // Step 1: presigned URL
      const presignRes = await fetch('/api/voice/greeting/presign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType: blob.type }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.presignedUrl) {
        alert('Upload failed: ' + (presignData.error || 'Could not get upload URL'));
        setUploading(false); return;
      }

      // Step 2: upload to R2
      const uploadRes = await fetch(presignData.presignedUrl, {
        method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/mpeg' }, body: blob,
      });
      if (!uploadRes.ok) { alert('Upload failed'); setUploading(false); return; }

      // Step 3: save metadata
      const catInfo = IVR_CATEGORIES.find(c => c.key === greetingType);
      const res = await fetch('/api/voice/greeting', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: presignData.publicUrl, r2Key: presignData.r2Key,
          name: greetingName.trim() || (greetingType === 'main' ? 'Main Greeting' : `${catInfo?.label || greetingType} Greeting`),
          greeting_type: greetingType,
        }),
      });
      const data = await res.json();
      if (data.recording) {
        setRecordings(prev => [data.recording, ...prev.map(r => r.greeting_type === greetingType ? { ...r, is_active: false } : r)]);
        setGreetingName('');
      }
    } catch { alert('Upload failed'); }
    setUploading(false);
  }

  // --- Record in browser ---
  function startRecording(greetingType: string) {
    setRecordingType(greetingType);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const wavBlob = await convertToWav(webmBlob);
          await uploadGreeting(wavBlob, 'greeting.wav', greetingType);
        } catch {
          await uploadGreeting(webmBlob, 'greeting.webm', greetingType);
        }
        setIsRecording(false);
      };
      mr.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }).catch(() => alert('Microphone access denied.'));
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  // --- File upload ---
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, greetingType: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecordingType(greetingType);
    uploadGreeting(file, file.name, greetingType);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // --- Play/stop ---
  function playRecording(url: string, id: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingId === id) { setPlayingId(null); return; }
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(id);
  }

  // --- Activate / Delete ---
  async function activateRecording(id: string) {
    await fetch('/api/voice/greeting/recordings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: true }),
    });
    fetchAll();
  }

  async function deleteRecording(rec: GreetingRecording) {
    if (!confirm(`Delete "${rec.name}"?`)) return;
    await fetch(`/api/voice/greeting/recordings?id=${rec.id}`, { method: 'DELETE' });
    setRecordings(prev => prev.filter(r => r.id !== rec.id));
  }

  async function deactivateGreeting(greetingType: string) {
    const label = greetingType === 'main' ? 'main' : IVR_CATEGORIES.find(c => c.key === greetingType)?.label || greetingType;
    if (!confirm(`Deactivate ${label} greeting? Callers will hear the default TTS voice.`)) return;
    await fetch(`/api/voice/greeting?type=${greetingType}`, { method: 'DELETE' });
    setRecordings(prev => prev.map(r => r.greeting_type === greetingType ? { ...r, is_active: false } : r));
  }

  // Active greeting per type
  function getActiveGreeting(type: string): GreetingRecording | null {
    return recordings.find(r => r.greeting_type === type && r.is_active) || null;
  }

  // --- Render helpers ---
  function renderRecordUploadButtons(greetingType: string) {
    const isRecordingThis = isRecording && recordingType === greetingType;
    return (
      <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        {isRecordingThis ? (
          <Button variant="primary" onClick={stopRecording} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
            Stop ({recordingTime}s)
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => startRecording(greetingType)} disabled={isRecording || uploading}>
            Record
          </Button>
        )}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: RADIUS.sm, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
          color: COLORS.textMuted, fontSize: FONT.sizeSm, fontWeight: 600,
        }}>
          Upload File
          <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.webm,audio/*" style={{ display: 'none' }}
            onChange={e => handleFileUpload(e, greetingType)} disabled={uploading} />
        </label>
        {uploading && recordingType === greetingType && (
          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Uploading...</span>
        )}
      </div>
    );
  }

  function renderGreetingStatus(greetingType: string) {
    const active = getActiveGreeting(greetingType);
    if (!active) {
      return <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontStyle: 'italic' }}>Using default TTS voice</span>;
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: 600 }}>{active.name}</span>
        <button onClick={() => playRecording(active.url, active.id)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 2,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={playingId === active.id ? COLORS.red : 'currentColor'} stroke="none">
            {playingId === active.id
              ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
              : <polygon points="5 3 19 12 5 21 5 3"/>
            }
          </svg>
        </button>
        <button onClick={() => deactivateGreeting(greetingType)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 2, fontSize: FONT.sizeXs,
        }}>
          Remove
        </button>
      </div>
    );
  }

  if (loading) return <div style={{ color: COLORS.textMuted, padding: SPACING.xl }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* Team Phone Routing */}
      <DashboardCard title="Team Phone Routing">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
          When a customer calls, these phones will ring simultaneously. Toggle to enable/disable.
        </p>

        {teamPhones.map((tp, idx) => (
          <div key={tp.id} style={{
            display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: SPACING.sm, padding: `${SPACING.sm}px 0`,
            borderBottom: idx < teamPhones.length - 1 ? `1px solid ${COLORS.border}` : 'none',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>{tp.name}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>{tp.phone}</div>
              {tp.sip_uri && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{tp.sip_uri}</div>}
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
              <button onClick={() => toggleEnabled(tp.id, !tp.enabled)} style={{
                padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                background: tp.enabled ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${tp.enabled ? '#86efac' : '#fca5a5'}`,
                color: tp.enabled ? '#16a34a' : '#ef4444', fontSize: FONT.sizeXs, fontWeight: 700,
              }}>
                {tp.enabled ? 'Active' : 'Disabled'}
              </button>
              <button onClick={() => deletePhone(tp.id)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: SPACING.lg, padding: SPACING.md,
          background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>Add Team Member</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto', gap: SPACING.sm, alignItems: 'flex-end' }}>
            <FormField label="Name"><TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Danny" /></FormField>
            <FormField label="Phone"><TextInput value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(240) 555-1234" /></FormField>
            <FormField label="SIP URI (optional)"><TextInput value={newSipUri} onChange={e => setNewSipUri(e.target.value)} placeholder="sip:user@domain" /></FormField>
            <Button variant="primary" onClick={handleAddPhone} disabled={saving || !newName || !newPhone}>{saving ? 'Adding...' : 'Add'}</Button>
          </div>
        </div>
      </DashboardCard>

      {/* Main IVR Greeting */}
      <DashboardCard title="Main IVR Greeting">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
          The first thing callers hear. Record or upload a custom greeting, or use the default automated voice.
        </p>
        <div style={{ marginBottom: SPACING.md }}>
          {renderGreetingStatus('main')}
        </div>
        <FormField label="Greeting Name">
          <TextInput value={greetingName} onChange={e => setGreetingName(e.target.value)} placeholder="Main Greeting" style={{ maxWidth: 300 }} />
        </FormField>
        <div style={{ marginTop: SPACING.sm }}>
          {renderRecordUploadButtons('main')}
        </div>
      </DashboardCard>

      {/* Per-Category Greetings */}
      <DashboardCard title="Menu Option Greetings">
        <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
          After a caller selects a menu option, they hear this greeting before the phone rings. Optional -- defaults to ringing immediately.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
          {IVR_CATEGORIES.map(cat => (
            <div key={cat.key} style={{
              padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: COLORS.red, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: FONT.sizeXs, flexShrink: 0,
                }}>
                  {cat.digit}
                </span>
                <span style={{ fontWeight: 700, fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{cat.label}</span>
              </div>
              <div style={{ marginBottom: SPACING.sm }}>
                {renderGreetingStatus(cat.key)}
              </div>
              {renderRecordUploadButtons(cat.key)}
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* Recording Library */}
      {recordings.length > 0 && (
        <DashboardCard title="Recording Library">
          <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, margin: `0 0 ${SPACING.md}px 0` }}>
            All uploaded and recorded greetings. Activate a recording to use it.
          </p>
          {recordings.map(rec => {
            const typeLabel = rec.greeting_type === 'main' ? 'Main' : (IVR_CATEGORIES.find(c => c.key === rec.greeting_type)?.label || rec.greeting_type);
            return (
              <div key={rec.id} style={{
                display: 'flex', alignItems: 'center', gap: SPACING.sm,
                padding: `${SPACING.xs}px 0`,
                borderBottom: `1px solid ${COLORS.border}`,
              }}>
                <button onClick={() => playRecording(rec.url, rec.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={playingId === rec.id ? COLORS.red : 'currentColor'} stroke="none">
                    {playingId === rec.id
                      ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                      : <polygon points="5 3 19 12 5 21 5 3"/>
                    }
                  </svg>
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textPrimary }}>{rec.name}</div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {typeLabel} {rec.is_active && <span style={{ color: '#22c55e', fontWeight: 700 }}>-- Active</span>}
                  </div>
                </div>
                {!rec.is_active && (
                  <button onClick={() => activateRecording(rec.id)} style={{
                    padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                    background: 'rgba(22,163,74,0.1)', border: '1px solid #86efac',
                    color: '#16a34a', fontSize: FONT.sizeXs, fontWeight: 700,
                  }}>
                    Activate
                  </button>
                )}
                <button onClick={() => deleteRecording(rec)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </DashboardCard>
      )}

      {/* How It Works */}
      <DashboardCard title="How Call Forwarding Works">
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
          <p style={{ margin: 0 }}>1. Customer calls your business number</p>
          <p style={{ margin: 0 }}>2. They hear the main greeting and press a menu option</p>
          <p style={{ margin: 0 }}>3. If a category greeting is set, they hear it</p>
          <p style={{ margin: 0 }}>4. All enabled team phones ring simultaneously + the dashboard browser phone</p>
          <p style={{ margin: 0 }}>5. First person to answer gets the call</p>
          <p style={{ margin: 0 }}>6. If nobody answers, the caller leaves a voicemail</p>
          <p style={{ margin: 0 }}>7. Warm transfers are available from the dashboard phone widget</p>
        </div>
      </DashboardCard>
    </div>
  );
}
