import { X } from 'lucide-react'

export default function AboutModal({ onClose }) {
  // The backdrop is a button so mouse, touch, and keyboard users can all close
  // the dialog without relying on a click handler attached to a plain div.
  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close about dialog" />
      <article className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="icon-button about-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <p className="eyebrow">The project</p>
        <h2 id="about-title">Reading light through molecules.</h2>
        <p>SpectoChem predicts UV–Vis–NIR absorption spectra directly from three-dimensional molecular structure. It is designed to make large libraries of transition-metal complexes explorable in seconds, supporting the search for compounds that can harvest light efficiently.</p>
        <h3>What the curves mean</h3>
        <p>Ground truth is shown beside predictions from SchNet and a GAT baseline. Ten predicted excitation energies and oscillator strengths are broadened into a continuous spectrum. PDF mode normalizes each curve by its area so shapes can be compared; Intensity mode preserves the predicted magnitude.</p>
        <div className="formula-card">I(E) = Σ fₖ exp[−½((E − Eₖ) / σ)²]</div>
        <h3>How to explore</h3>
        <p>Select a compound by formula, CSD code, or SMILES. Hover or drag across the plot for exact wavelength and response values. The luminous field below the wavelength band marks the selected molecule’s computed spectral range, while its optimized 3D structure rotates below.</p>
        <h3>Research context</h3>
        <p>The dataset is based on tmQMg* molecular structures and the prediction workflow supplied with this project. The visualizer compares SchNet and GAT outputs against the reference spectrum using 5,000 energy-grid samples per curve.</p>
      </article>
    </>
  )
}
