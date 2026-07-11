export default function SpectralBeam() {
  // Two copies of the triangular spectrum create a soft glow and a sharper core.
  return (
    <svg className="beam-field" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="spectral-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6c3ce8" /><stop offset=".25" stopColor="#2979ff" />
          <stop offset=".38" stopColor="#33d8d3" /><stop offset=".48" stopColor="#5ee778" />
          <stop offset=".59" stopColor="#f1dc57" /><stop offset=".68" stopColor="#ff8d42" />
          <stop offset=".78" stopColor="#ff455b" /><stop offset="1" stopColor="#7c2442" />
        </linearGradient>
        <linearGradient id="beam-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".65" /><stop offset=".76" stopColor="white" stopOpacity=".08" /><stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="fade-mask"><rect width="1000" height="500" fill="url(#beam-fade)" /></mask>
        <filter id="beam-blur"><feGaussianBlur stdDeviation="10" /></filter>
      </defs>
      <path d="M500 430 L0 0 H1000 Z" fill="url(#spectral-fill)" mask="url(#fade-mask)" filter="url(#beam-blur)" />
      <path d="M500 430 L0 0 H1000 Z" fill="url(#spectral-fill)" opacity=".28" mask="url(#fade-mask)" />
    </svg>
  )
}
