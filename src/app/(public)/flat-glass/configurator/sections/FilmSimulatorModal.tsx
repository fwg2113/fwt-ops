'use client'

import { useState } from 'react'
import { FILM_DATA } from '@/app/lib/flat-glass-data'
import type { FilmDataEntry } from '@/app/lib/flat-glass-data'

const PRIVACY_PHOTOS: Record<string, string> = {
  'outside-day': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_OUT_DAY.webp?v=1766429335',
  'outside-night-on': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_OUT_DAY_ON.webp?v=1766429335',
  'outside-night-off': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_OUT_DAY_OFF.webp?v=1766429335',
  'inside-day': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_IN_DAY.webp?v=1766429335',
  'inside-night-on': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_IN_NIGHT_ON.webp?v=1766429335',
  'inside-night-off': 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/Privacy_Pro_Max_IN_NIGHT_OFF.webp?v=1766429335',
}

const CAPTIONS: Record<string, { title: string; desc: string; privacy: string; privacyText: string }> = {
  'outside-day': { title: 'Daytime - Outside Looking In', desc: 'The film creates a mirror effect. People outside see their reflection, not inside.', privacy: 'good', privacyText: 'Strong Privacy' },
  'outside-night-on': { title: 'Nighttime (Lights On) - Outside Looking In', desc: 'With interior lights on, people outside can see in clearly. The effect reverses.', privacy: 'bad', privacyText: 'No Privacy' },
  'outside-night-off': { title: 'Nighttime (Lights Off) - Outside Looking In', desc: "With lights off inside, privacy is restored. Dark inside = can't see in.", privacy: 'good', privacyText: 'Privacy Restored' },
  'inside-day': { title: 'Daytime - Inside Looking Out', desc: 'From inside, you can see out clearly while enjoying privacy from outside.', privacy: 'good', privacyText: 'Clear View Out' },
  'inside-night-on': { title: 'Nighttime (Lights On) - Inside Looking Out', desc: 'At night with lights on, you see your reflection. Outside can see in.', privacy: 'bad', privacyText: 'Reflection Visible' },
  'inside-night-off': { title: 'Nighttime (Lights Off) - Inside Looking Out', desc: 'With lights off, you can see outside and maintain some privacy but you may notice a subtle reflection.', privacy: 'partial', privacyText: 'Can See Out' },
}

const RATING_LABELS: Record<string, string> = {
  heat: 'Heat Rejection',
  glare: 'Glare Reduction',
  privacy: 'Daytime Privacy',
  light: 'Natural Light',
  neutral: 'Neutral Look',
}

interface Props {
  filmId: string
  onSelect: (filmId: string, displayName: string) => void
  onClose: () => void
}

export default function FilmSimulatorModal({ filmId, onSelect, onClose }: Props) {
  const film = FILM_DATA[filmId]
  const [currentView, setCurrentView] = useState<'outside' | 'inside'>('outside')
  const [currentTime, setCurrentTime] = useState<'day' | 'night'>('day')
  const [currentLights, setCurrentLights] = useState<'on' | 'off'>('off')

  if (!film) return null

  // Build caption key
  let captionKey = `${currentView}-${currentTime}`
  if (currentTime === 'night') captionKey += `-${currentLights}`
  const caption = CAPTIONS[captionKey]

  // Build photo key
  let photoKey = `${currentView}-${currentTime}`
  if (currentTime === 'night') photoKey += `-${currentLights}`

  const handleTimeChange = (time: 'day' | 'night') => {
    setCurrentTime(time)
    if (time === 'night' && currentLights === 'off') {
      setCurrentLights('on')
    }
  }

  return (
    <div className="fwt-simulator-modal-overlay" onClick={onClose}>
      <div className="fwt-simulator-modal" onClick={(e) => e.stopPropagation()}>
        <button className="simulator-close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="simulator-header">
          <h2>{film.displayName}</h2>
          <p className="simulator-tagline">{film.shortTagline}</p>
        </div>

        <div className="simulator-content">
          <div className="simulator-photo-section">
            <div className="photo-viewer-header">
              <span className="photo-viewer-title">See It In Action</span>
            </div>

            <div className="view-toggle-section">
              <span className="view-label">Viewing From</span>
              <div className="view-toggle">
                <button className={`view-btn ${currentView === 'outside' ? 'active' : ''}`} onClick={() => setCurrentView('outside')}>Outside Looking In</button>
                <button className={`view-btn ${currentView === 'inside' ? 'active' : ''}`} onClick={() => setCurrentView('inside')}>Inside Looking Out</button>
              </div>
            </div>

            <div className="toggle-controls">
              <div className="toggle-group">
                <span className="toggle-label">Time of Day</span>
                <div className="toggle-buttons">
                  <button className={`toggle-btn day ${currentTime === 'day' ? 'active' : ''}`} onClick={() => handleTimeChange('day')}>Day</button>
                  <button className={`toggle-btn night ${currentTime === 'night' ? 'active' : ''}`} onClick={() => handleTimeChange('night')}>Night</button>
                </div>
              </div>

              <div className={`toggle-group lights-toggle ${currentTime === 'night' ? 'enabled' : ''}`}>
                <span className="toggle-label">Interior Lights</span>
                <div className="toggle-buttons">
                  <button className={`toggle-btn on ${currentLights === 'on' ? 'active' : ''}`} onClick={() => setCurrentLights('on')}>On</button>
                  <button className={`toggle-btn off ${currentLights === 'off' ? 'active' : ''}`} onClick={() => setCurrentLights('off')}>Off</button>
                </div>
              </div>
            </div>

            <div className="photo-container">
              <div className="film-indicator-overlay">
                <div className="pane-label no-film">No Film</div>
                <div className="pane-label has-film">{film.displayName}</div>
                <div className="pane-label no-film">No Film</div>
              </div>
              {Object.entries(PRIVACY_PHOTOS).map(([key, src]) => (
                <img key={key} src={src} alt={key} className={key === photoKey ? 'visible' : ''} />
              ))}
            </div>

            {caption && (
              <div className="photo-caption">
                <div className="caption-title">{caption.title}</div>
                <div className="caption-desc">{caption.desc}</div>
                <div className="privacy-indicator">
                  <div className={`privacy-dot ${caption.privacy === 'good' ? 'good' : caption.privacy === 'partial' ? 'partial' : ''}`} />
                  <span className="privacy-text">{caption.privacyText}</span>
                </div>
              </div>
            )}
          </div>

          <div className="simulator-specs-section">
            <h3>Performance Ratings</h3>
            <div className="film-ratings">
              {(['heat', 'glare', 'privacy', 'light', 'neutral'] as const).map((key) => (
                <div key={key} className="rating-row">
                  <span className="rating-label">{RATING_LABELS[key]}</span>
                  <div className="rating-dots">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className={`rating-dot ${i < film.ratings[key] ? `filled ${key}` : ''}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="simulator-specs">
              <div className="spec-row"><span className="spec-label">Visible Light</span><span className="spec-value">{film.shadeVLT}%</span></div>
              <div className="spec-row"><span className="spec-label">Heat Rejection</span><span className="spec-value">{film.heatReduction}%</span></div>
              <div className="spec-row"><span className="spec-label">Glare Reduction</span><span className="spec-value">{film.glareReduction}%</span></div>
              <div className="spec-row"><span className="spec-label">UV Protection</span><span className="spec-value">{film.uvProtection}%</span></div>
            </div>

            <button className="btn btn-primary btn-select-film" onClick={() => onSelect(filmId, film.displayName)}>
              Select {film.displayName}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
