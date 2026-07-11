export default function WavelengthBand() {
  // These widths correspond to the 100–900 nm chart domain: UV and visible each
  // occupy 300 nm, while near-infrared occupies the remaining 200 nm.
  return (
    <div className="band-section" aria-label="Electromagnetic wavelength regions from ultraviolet to near-infrared">
      <div className="wavelength-band" />
      <div className="band-labels">
        <div className="band-label"><strong>Ultraviolet</strong><span>100–400 nm</span></div>
        <div className="band-label"><strong>Visible light</strong><span>400–700 nm</span></div>
        <div className="band-label"><strong>Near-infrared</strong><span>700–900 nm</span></div>
      </div>
    </div>
  )
}
