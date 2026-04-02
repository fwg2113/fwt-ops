'use client'

import { useState, useCallback } from 'react'
import type { EstimatorState, Section } from '@/app/lib/flat-glass-state'
import { INITIAL_STATE } from '@/app/lib/flat-glass-state'
import { getRecommendations } from '@/app/lib/flat-glass-data'
import type { Answers } from '@/app/lib/flat-glass-state'
import './configurator.css'

// Section components
import WelcomeSection from './sections/WelcomeSection'
import PropertyTypeSection from './sections/PropertyTypeSection'
import MeasurementsSection from './sections/MeasurementsSection'
import FilmSelectorSection from './sections/FilmSelectorSection'
import PrimerSection from './sections/PrimerSection'
import QuestionsSection from './sections/QuestionsSection'
import ContactSection from './sections/ContactSection'
import OptionsSection from './sections/OptionsSection'
import ConfirmationSection from './sections/ConfirmationSection'

// NEW FLOW ORDER:
// welcome → property-type → measurements → film-selector → contact → options → confirmation
// The "Not sure which to pick?" path: film-selector → primer → questions → (back to film-selector with recommendation)
// The "come measure" escape hatch lives on the measurements page

export default function ConfiguratorPage() {
  const [state, setState] = useState<EstimatorState>({ ...INITIAL_STATE })

  const goToSection = useCallback((section: Section) => {
    setState((s) => ({ ...s, currentSection: section }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const updateState = useCallback((updates: Partial<EstimatorState>) => {
    setState((s) => ({ ...s, ...updates }))
  }, [])

  // Welcome → property type with promo state
  const startFromWelcome = useCallback((promoCode: string, promoDiscount: number) => {
    setState((s) => ({
      ...s,
      promoCode,
      promoDiscount,
      currentSection: 'property-type',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Property type selection → go to measurements (NEW: skip film selector)
  const selectPropertyType = useCallback((type: 'residential' | 'commercial') => {
    setState((s) => ({ ...s, propertyType: type, currentSection: 'measurements' }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Film selector filter
  const setFilmFilter = useCallback((filter: string) => {
    setState((s) => ({ ...s, filmSelectorFilter: filter }))
  }, [])

  // Select film from film selector → go to contact (NEW: measurements already done)
  const selectFilm = useCallback((filmId: string, displayName: string) => {
    setState((s) => ({
      ...s,
      selectedFilm: { filmId, displayName },
      currentSection: 'contact',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Questions flow
  const updateAnswers = useCallback((updates: Partial<Answers>) => {
    setState((s) => {
      const newAnswers = { ...s.answers, ...updates }
      const hasProblems = (newAnswers.problems?.length || 0) > 0
      const hasAppearance = !!newAnswers.appearance
      const hasLight = !!newAnswers.lightPreference
      const recommendations = hasProblems && hasAppearance && hasLight
        ? getRecommendations(newAnswers)
        : s.recommendations
      return { ...s, answers: newAnswers, recommendations }
    })
  }, [])

  // Select recommendation → go to contact (NEW: measurements already done)
  const selectRecommendation = useCallback((filmId: string, displayName: string) => {
    setState((s) => ({
      ...s,
      selectedFilm: { filmId, displayName },
      currentSection: 'contact',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Navigate back (NEW flow order)
  const goBack = useCallback(() => {
    setState((s) => {
      const backMap: Partial<Record<Section, Section>> = {
        'property-type': 'welcome',
        'measurements': 'property-type',
        'film-selector': 'measurements',       // NEW: film comes after measurements
        'primer': 'film-selector',
        'questions': 'primer',
        'contact': 'film-selector',             // NEW: contact comes after film selection
        'contact-come': 'measurements',         // come-measure escape goes back to measurements
        'options': 'contact',
        'photos': 'options',
        'calendar': 'options',
      }
      const prev = backMap[s.currentSection] || 'property-type'
      return { ...s, currentSection: prev }
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Render the current section
  const renderSection = () => {
    switch (state.currentSection) {
      case 'welcome':
        return <WelcomeSection onStart={startFromWelcome} />

      case 'property-type':
        return <PropertyTypeSection onSelect={selectPropertyType} />

      // NEW: Measurements come RIGHT AFTER property type
      case 'measurements':
        return (
          <MeasurementsSection
            state={state}
            updateState={updateState}
            onContinue={() => goToSection('film-selector')}  // NEW: go to film selector after measuring
            onBack={goBack}
          />
        )

      // NEW: Film selector comes AFTER measurements — can show prices
      case 'film-selector':
        return (
          <FilmSelectorSection
            filter={state.filmSelectorFilter}
            onFilterChange={setFilmFilter}
            onSelectFilm={selectFilm}
            onGoToQuestions={() => goToSection(state.questionPrimerShown ? 'questions' : 'primer')}
            onBack={goBack}
            state={state}
            updateState={updateState}
          />
        )

      case 'primer':
        return (
          <PrimerSection
            onContinue={() => {
              updateState({ questionPrimerShown: true })
              goToSection('questions')
            }}
            onBack={goBack}
          />
        )

      case 'questions':
        return (
          <QuestionsSection
            answers={state.answers}
            recommendations={state.recommendations}
            onUpdateAnswers={updateAnswers}
            onSelectRecommendation={selectRecommendation}
            onBack={goBack}
            privacyModalShown={state.privacyModalShown}
            onPrivacyModalShown={() => updateState({ privacyModalShown: true })}
          />
        )

      // Contact comes after film selection
      case 'contact':
      case 'contact-come':
        return (
          <ContactSection
            contact={state.contact}
            propertyType={state.propertyType}
            isComeMode={state.currentSection === 'contact-come'}
            windowCountEstimate={state.windowCountEstimate}
            onUpdateContact={(updates) =>
              setState((s) => ({ ...s, contact: { ...s.contact, ...updates } }))
            }
            onWindowCountChange={(v) => updateState({ windowCountEstimate: v })}
            onContinue={() => goToSection('options')}
            onBack={goBack}
          />
        )

      case 'options':
        return (
          <OptionsSection
            state={state}
            updateState={updateState}
            onSelectPath={(path) => {
              updateState({ selectedPath: path })
              if (path === 'save') {
                goToSection('confirmation')
              } else if (path === 'consult' || path === 'commit') {
                goToSection('calendar')
              }
            }}
            onBack={goBack}
          />
        )

      case 'photos':
      case 'photos-come':
        return (
          <div className="fwt-container centered-page">
            <div className="fwt-header">
              <h2>Photos</h2>
              <p>Upload photos of your windows (optional)</p>
            </div>
            <div className="actions">
              <button className="btn btn-secondary" onClick={goBack}>Back</button>
              <button className="btn btn-primary" onClick={() => goToSection('calendar')}>Continue</button>
            </div>
          </div>
        )

      case 'calendar':
        return (
          <div className="fwt-container centered-page">
            <div className="fwt-header">
              <h2>Schedule</h2>
              <p>Pick a date and time</p>
            </div>
            <div className="actions">
              <button className="btn btn-secondary" onClick={goBack}>Back</button>
              <button className="btn btn-primary" onClick={() => goToSection('confirmation')}>Submit</button>
            </div>
          </div>
        )

      case 'confirmation':
        return (
          <ConfirmationSection
            state={state}
            onStartOver={() => {
              setState({ ...INITIAL_STATE })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        )

      default:
        return <WelcomeSection onStart={startFromWelcome} />
    }
  }

  return <div className="fwt-estimator">{renderSection()}</div>
}
