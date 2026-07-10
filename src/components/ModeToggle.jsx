export default function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle" role="group" aria-label="Spectrum scale">
      <button className={mode === 'pdf' ? 'active' : ''} onClick={() => onChange('pdf')} aria-pressed={mode === 'pdf'}>PDF</button>
      <button className={mode === 'intensity' ? 'active' : ''} onClick={() => onChange('intensity')} aria-pressed={mode === 'intensity'}>Intensity</button>
    </div>
  )
}
