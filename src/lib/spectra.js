// Track order is part of the binary file format and must match the Python
// exporter: 5,000 ground-truth values, then SchNet, then GAT.
export const TRACKS = [
  { key: 'groundTruth', label: 'Ground truth', color: '#f2fff8', dash: true },
  { key: 'schnet', label: 'SchNet', color: '#d7ff68' },
  { key: 'gat', label: 'GAT', color: '#65dcc1' },
]

export const POINTS_PER_TRACK = 5000
// Photon energy and wavelength are related by wavelength_nm = hc / energy_eV.
export const HC_EV_NM = 1239.841984
export const WAVELENGTH_DOMAIN = [100, 900]

export function decodeSpectrum(buffer, metadata) {
  // Reject truncated or incompatible files before constructing typed-array views.
  const expectedBytes = TRACKS.length * POINTS_PER_TRACK * Float32Array.BYTES_PER_ELEMENT
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`Unexpected spectrum payload (${buffer.byteLength} bytes; expected ${expectedBytes}).`)
  }

  const energyStep = (metadata.x_max - metadata.x_min) / (POINTS_PER_TRACK - 1)
  const wavelengths = new Float32Array(POINTS_PER_TRACK)
  const tracks = {}

  // The Python exporter samples energy in ascending order. The UI reverses that
  // axis so wavelength remains intuitive: short UV wavelengths on the left.
  for (let i = 0; i < POINTS_PER_TRACK; i += 1) {
    const energy = metadata.x_max - i * energyStep
    wavelengths[i] = HC_EV_NM / energy
  }

  TRACKS.forEach((track, trackIndex) => {
    // Typed-array views read directly from the downloaded buffer. A reversed copy
    // then aligns every track with the ascending wavelength array above.
    const source = new Float32Array(buffer, trackIndex * POINTS_PER_TRACK * 4, POINTS_PER_TRACK)
    const values = new Float32Array(POINTS_PER_TRACK)
    for (let i = 0; i < POINTS_PER_TRACK; i += 1) values[i] = source[POINTS_PER_TRACK - 1 - i]
    tracks[track.key] = values
  })

  return { wavelengths, tracks }
}

export function prepareTracks(spectrum, mode) {
  if (!spectrum) return null
  const { wavelengths, tracks } = spectrum
  let globalMax = 0

  if (mode !== 'pdf') {
    // Intensity mode uses one shared maximum so relative magnitudes remain visible.
    TRACKS.forEach(({ key }) => {
      const values = tracks[key]
      for (let i = 0; i < values.length; i += 1) {
        if (values[i] > globalMax) globalMax = values[i]
      }
    })
    return { wavelengths, tracks, max: globalMax || 1 }
  }

  const prepared = {}
  TRACKS.forEach(({ key }) => {
    const source = tracks[key]
    let trackMax = 0
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] > trackMax) trackMax = source[i]
    }

    // Shape mode compares each model profile independently, with every track's
    // highest point set to 1. Despite the UI label, this is peak normalization,
    // not area normalization into a mathematical probability density function.
    const divisor = trackMax || 1
    const values = new Float32Array(source.length)
    for (let i = 0; i < source.length; i += 1) {
      values[i] = source[i] / divisor
      if (values[i] > globalMax) globalMax = values[i]
    }
    prepared[key] = values
  })

  return { wavelengths, tracks: prepared, max: globalMax || 1 }
}

export function wavelengthToColor(wavelength) {
  // Approximate display colors for broad wavelength regions; these are visual
  // cues and are not a physical color-conversion model.
  if (wavelength < 400) return '#8258ff'
  if (wavelength < 470) return '#3378ff'
  if (wavelength < 505) return '#24d4e8'
  if (wavelength < 570) return '#63e874'
  if (wavelength < 590) return '#f1dd58'
  if (wavelength < 620) return '#ff9a43'
  if (wavelength < 700) return '#ff4b5d'
  return '#9a2947'
}

export function formatY(value, mode) {
  // Keep tooltip labels compact while preserving very large intensity values.
  if (!Number.isFinite(value)) return '—'
  if (mode === 'pdf') return Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3)
  return value >= 100 ? value.toExponential(2) : value.toFixed(3)
}
