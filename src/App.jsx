import { Atom, Dices, FlaskConical, Info, LibraryBig } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import AboutModal from './components/AboutModal.jsx'
import ModeToggle from './components/ModeToggle.jsx'
import MoleculeDatabase from './components/MoleculeDatabase.jsx'
import MoleculeViewer from './components/MoleculeViewer.jsx'
import SpectrumPlot from './components/SpectrumPlot.jsx'
import WavelengthBand from './components/WavelengthBand.jsx'
import { useMolblock } from './hooks/useMolblock.js'
import { useMolecules } from './hooks/useMolecules.js'
import { useSpectrum } from './hooks/useSpectrum.js'
import { WAVELENGTH_DOMAIN } from './lib/spectra.js'

export default function App() {
  // The top-level component owns selections and overlays. Data fetching stays
  // in hooks so the visual components only receive the data they need.
  const { molecules, error: databaseError, loading } = useMolecules()
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('pdf')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [databaseOpen, setDatabaseOpen] = useState(false)

  // Automatically show the first molecule until the visitor makes a choice.
  const activeId = selectedId ?? molecules[0]?.id ?? null
  const selected = useMemo(
    () => molecules.find((molecule) => molecule.id === activeId) ?? null,
    [activeId, molecules],
  )
  const spectrum = useSpectrum(selected)
  const molblock = useMolblock(activeId)

  const selectMolecule = useCallback((id) => {
    setSelectedId(id)
    setDatabaseOpen(false)
  }, [])

  function selectRandom() {
    if (!molecules.length) return
    let nextIndex = Math.floor(Math.random() * molecules.length)
    // Avoid making the random button appear broken by selecting the same item.
    if (molecules.length > 1 && molecules[nextIndex].id === activeId) {
      nextIndex = (nextIndex + 1) % molecules.length
    }
    selectMolecule(molecules[nextIndex].id)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Atom className="brand-mark" strokeWidth={1.45} />
          <div className="brand-word">Specto<span>Chem</span></div>
        </div>
        <div className="header-actions">
          <button className="quiet-button desktop-only" onClick={() => setAboutOpen(true)}>
            <Info size={15} />About us
          </button>
          <button className="icon-button mobile-header-only" onClick={() => setAboutOpen(true)} aria-label="About SpectoChem">
            <Info size={17} />
          </button>
          <button className="primary-button" onClick={selectRandom}>
            <Dices size={15} />
            <span className="desktop-only">Random molecule</span>
            <span className="mobile-only">Random</span>
          </button>
          <button className="icon-button mobile-header-only" onClick={() => setDatabaseOpen(true)} aria-label="Open molecule database">
            <LibraryBig size={17} />
          </button>
        </div>
      </header>

      <main className="workspace">
        {/* Desktop database; the same component is reused in the mobile drawer. */}
        <MoleculeDatabase molecules={molecules} selectedId={activeId} onSelect={selectMolecule} className="database panel" />
        <section className="stage panel">
          <div className="stage-header">
            <div className="molecule-heading">
              <p className="eyebrow">Selected molecule</p>
              <h1>{selected?.chemical_formula.unicode || (loading ? 'Loading library…' : 'No molecule')}</h1>
              <div className="molecule-meta">
                {selected && (
                  <>
                    <i className="live-dot" /> CSD {selected.id}
                    <span>·</span>
                    {WAVELENGTH_DOMAIN[0]}–{WAVELENGTH_DOMAIN[1]} nm view
                  </>
                )}
              </div>
            </div>
            <ModeToggle mode={mode} onChange={setMode} />
          </div>

          {databaseError ? (
            <div className="spectrum-loading"><FlaskConical size={22} /> {databaseError.message}</div>
          ) : (
            <div className="visualization">
              <SpectrumPlot spectrum={spectrum.data} mode={mode} loading={spectrum.loading} error={spectrum.error} />
              <WavelengthBand />
              <MoleculeViewer molecule={selected} molblock={molblock.data} />
            </div>
          )}
        </section>
      </main>

      {databaseOpen && (
        <>
          <button className="drawer-backdrop" onClick={() => setDatabaseOpen(false)} aria-label="Close molecule database" />
          <aside className="mobile-drawer">
            <div className="drawer-handle" />
            <MoleculeDatabase molecules={molecules} selectedId={activeId} onSelect={selectMolecule} className="drawer-database" />
          </aside>
        </>
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
