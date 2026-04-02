'use client'

import { useState } from 'react'
import { QUESTIONS, QUESTION_ORDER, FILM_DATA } from '@/app/lib/flat-glass-data'
import type { Recommendation } from '@/app/lib/flat-glass-data'
import type { Answers } from '@/app/lib/flat-glass-state'

// SVG icons for problem questions
const QUESTION_ICONS: Record<string, React.ReactNode> = {
  heat: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <rect x="10" y="4" width="4" height="16" rx="1" fill="white" />
      <rect x="9" y="14" width="6" height="4" rx="1" fill="white" />
    </svg>
  ),
  glare: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M7 8c2-2 4-3 5-3s3 1 5 3M7 12c2-2 4-3 5-3s3 1 5 3M7 16c2-2 4-3 5-3s3 1 5 3" stroke="white" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="2" />
      <line x1="4" y1="4" x2="20" y2="20" stroke="white" strokeWidth="2" />
    </svg>
  ),
  uv_fading: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v4M12 14v4M8 10h8" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  decorative: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
      <rect x="7" y="7" width="4" height="4" fill="white" />
      <rect x="13" y="7" width="4" height="4" fill="white" />
      <rect x="7" y="13" width="4" height="4" fill="white" />
      <rect x="13" y="13" width="4" height="4" fill="white" />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="white" />
    </svg>
  ),
}

interface Props {
  answers: Answers
  recommendations: Recommendation[]
  onUpdateAnswers: (updates: Partial<Answers>) => void
  onSelectRecommendation: (filmId: string, displayName: string) => void
  onBack: () => void
  privacyModalShown: boolean
  onPrivacyModalShown: () => void
}

export default function QuestionsSection({
  answers,
  recommendations,
  onUpdateAnswers,
  onSelectRecommendation,
  onBack,
  privacyModalShown,
  onPrivacyModalShown,
}: Props) {
  const [questionsAnswered, setQuestionsAnswered] = useState<Record<string, boolean>>({
    problems: false,
    appearance: false,
    lightPreference: false,
    warmCool: false,
    timeline: false,
  })
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  // Determine if warmCool should be shown
  const showWarmCool = recommendations.some(
    (rec) => rec.film.warmCoolVariant === 'Warm or Cool'
  )

  const allMainAnswered = QUESTION_ORDER.every((id) => questionsAnswered[id])
  const warmCoolHandled = !showWarmCool || questionsAnswered.warmCool
  const allComplete = allMainAnswered && warmCoolHandled && questionsAnswered.timeline

  const confirmQuestion = (questionId: string) => {
    const q = QUESTIONS[questionId]
    if (q.type === 'multi' && (!answers[questionId as keyof Answers] || (answers[questionId as keyof Answers] as string[])?.length === 0)) return
    if (q.type === 'single' && !answers[questionId as keyof Answers]) return

    // Privacy modal check
    if (questionId === 'problems' && (answers.problems || []).includes('privacy') && !privacyModalShown) {
      setShowPrivacyModal(true)
      return
    }

    setQuestionsAnswered((prev) => ({ ...prev, [questionId]: true }))
  }

  const editQuestion = (questionId: string) => {
    setQuestionsAnswered((prev) => ({ ...prev, [questionId]: false }))
  }

  const toggleMulti = (questionId: string, value: string) => {
    const current = (answers[questionId as keyof Answers] as string[]) || []
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onUpdateAnswers({ [questionId]: updated } as Partial<Answers>)
  }

  const selectSingle = (questionId: string, value: string) => {
    onUpdateAnswers({ [questionId]: value } as Partial<Answers>)
  }

  const renderAccordionItem = (questionId: string, index: number) => {
    const q = QUESTIONS[questionId]
    if (!q) return null

    const isAnswered = questionsAnswered[questionId]

    // Determine if this question is active (unlocked)
    let isActive = false
    if (!isAnswered) {
      if (QUESTION_ORDER.includes(questionId)) {
        isActive = index === 0 || QUESTION_ORDER.slice(0, index).every((id) => questionsAnswered[id])
      } else if (questionId === 'warmCool') {
        isActive = questionsAnswered.lightPreference && showWarmCool
      } else if (questionId === 'timeline') {
        const mainDone = QUESTION_ORDER.every((id) => questionsAnswered[id])
        const warmDone = !showWarmCool || questionsAnswered.warmCool
        isActive = mainDone && warmDone
      }
    }

    const isLocked = !isAnswered && !isActive

    // Build answer display
    let answerDisplay = ''
    if (isAnswered) {
      if (q.type === 'multi') {
        answerDisplay = ((answers[questionId as keyof Answers] as string[]) || [])
          .map((v) => q.options.find((o) => o.id === v)?.label || v)
          .join(', ')
      } else {
        const val = answers[questionId as keyof Answers] as string
        answerDisplay = q.options.find((o) => o.id === val)?.label || val || ''
      }
    }

    return (
      <div
        key={questionId}
        className={`accordion-item ${isAnswered ? 'answered' : ''} ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
      >
        <div className="accordion-header">
          <span className="accordion-number">{index + 1}</span>
          <span className="accordion-title">{q.title}</span>
          {isAnswered && (
            <>
              <span className="accordion-answer">{answerDisplay}</span>
              <button className="btn-edit" onClick={() => editQuestion(questionId)}>
                Edit
              </button>
            </>
          )}
          {isLocked && (
            <span className="accordion-lock">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </span>
          )}
        </div>
        {isActive && (
          <div className="accordion-content">
            {q.subtitle && <p className="question-subtitle">{q.subtitle}</p>}
            <div className="options-list">
              {q.options.map((opt) => {
                const isMulti = q.type === 'multi'
                const isSelected = isMulti
                  ? ((answers[questionId as keyof Answers] as string[]) || []).includes(opt.id)
                  : answers[questionId as keyof Answers] === opt.id
                const icon = opt.icon ? QUESTION_ICONS[opt.icon] : null

                return (
                  <div
                    key={opt.id}
                    className={`fwt-option ${isMulti ? 'multi' : ''} ${isSelected ? 'selected' : ''} ${opt.hasPrivacyBreakdown ? 'has-privacy-breakdown' : ''}`}
                    onClick={() => {
                      if (isMulti) {
                        toggleMulti(questionId, opt.id)
                      } else {
                        selectSingle(questionId, opt.id)
                      }
                    }}
                  >
                    {icon && <span className="option-icon-svg">{icon}</span>}
                    <div className="option-content">
                      <span className="option-label">{opt.label}</span>
                      {opt.desc && <span className="option-desc">{opt.desc}</span>}
                      {opt.hasPrivacyBreakdown && (
                        <div className="privacy-breakdown">
                          <div className="privacy-item">
                            <span className="privacy-label">Daytime</span>
                            <span className="privacy-value yes">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                              Achievable
                            </span>
                          </div>
                          <div className="privacy-item">
                            <span className="privacy-label">Nighttime</span>
                            <span className="privacy-value explain">We&apos;ll explain</span>
                          </div>
                        </div>
                      )}
                      {opt.note && <span className="option-note">{opt.note}</span>}
                    </div>
                    <span className="option-check">
                      {isSelected && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="accordion-actions">
              <button className="btn btn-primary" onClick={() => confirmQuestion(questionId)}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Build question list
  const questionItems: { id: string; index: number }[] = []
  QUESTION_ORDER.forEach((qId, i) => {
    questionItems.push({ id: qId, index: i })
  })
  if (showWarmCool && questionsAnswered.lightPreference) {
    questionItems.push({ id: 'warmCool', index: QUESTION_ORDER.length })
  }
  if (questionsAnswered.lightPreference) {
    questionItems.push({
      id: 'timeline',
      index: QUESTION_ORDER.length + (showWarmCool ? 1 : 0),
    })
  }

  return (
    <div className="fwt-container content-page">
      <div className="fwt-header">
        <h1>Flat Glass Window Film Estimator</h1>
        <p>Answer a few questions to find your perfect solution</p>
      </div>

      <div className="questions-single-column">
        {questionItems.map((item) => renderAccordionItem(item.id, item.index))}
      </div>

      {/* Recommendations */}
      {allComplete && recommendations.length > 0 && (
        <div className="recommendations-section">
          <h2>Your Recommended Solutions</h2>
          <div className="recommendations-grid">
            {recommendations.map((rec, i) => {
              const film = rec.film
              const interior =
                rec.appearanceTone !== 'Neutral'
                  ? rec.appearanceTone
                  : film.appearanceInterior

              return (
                <div key={rec.filmId} className={`solution-card ${i === 0 ? 'primary' : ''}`}>
                  <div className="card-badge">
                    {i === 0 ? 'Recommended' : 'Alternative'}
                  </div>
                  <h4>{film.displayName}</h4>
                  <p className="tagline">{film.shortTagline}</p>

                  <div className="details">
                    <div className="detail-row">
                      <span>Interior</span>
                      <strong>{interior}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Exterior</span>
                      <strong>{film.appearanceExterior}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Darkness</span>
                      <strong>{film.shadeLabel}</strong>
                    </div>
                  </div>

                  <div className="performance-grid">
                    <div className="perf-item">
                      <span className="perf-value">{film.heatReduction}%</span>
                      <span className="perf-label">Heat</span>
                    </div>
                    <div className="perf-item">
                      <span className="perf-value">{film.glareReduction}%</span>
                      <span className="perf-label">Glare</span>
                    </div>
                    <div className="perf-item">
                      <span className="perf-value">{film.uvProtection}%</span>
                      <span className="perf-label">UV</span>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => onSelectRecommendation(rec.filmId, film.displayName)}
                  >
                    Select This Solution
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="actions" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
      </div>

      {/* Privacy Modal */}
      {showPrivacyModal && (
        <div className="modal-overlay" onClick={() => setShowPrivacyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>About Privacy Film</h3>
            <div className="privacy-explanation">
              <p>
                <strong>Daytime privacy</strong> is achievable with reflective and darker films.
                During the day, the sun makes the outside of the glass brighter than the inside,
                creating a mirror effect that prevents people from seeing in.
              </p>
              <p>
                <strong>At night, this reverses.</strong> When your interior lights are on and
                it&apos;s dark outside, people can see in. This is a property of all non-opaque
                window films — no traditional film provides 24/7 privacy.
              </p>
              <p>
                For <strong>24/7 privacy</strong>, consider our decorative/frosted film options
                which block the view in both directions at all times.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowPrivacyModal(false)
                onPrivacyModalShown()
                setQuestionsAnswered((prev) => ({ ...prev, problems: true }))
              }}
            >
              Got it, continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
