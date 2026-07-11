export const TRACKS = [
  { key: 'groundTruth', label: 'Ground truth', color: '#f2fff8', dash: true },
  { key: 'schnet', label: 'SchNet', color: '#d7ff68' },
  { key: 'gat', label: 'GAT', color: '#65dcc1' },
]

export const POINTS_PER_TRACK = 5000
export const HC_EV_NM = 1239.841984
export function decodeSpectrum(buffer, metadata) {
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
  const prepared = {}
  let globalMax = 0

  TRACKS.forEach(({ key }) => {
    const source = tracks[key]
    let divisor = 1
    if (mode === 'pdf') {
      // Shape mode in the reference visualizer compares the profile of each
      // model independently, with every track's highest point set to 1.
      let trackMax = 0
      for (let i = 0; i < source.length; i += 1) {
        if (source[i] > trackMax) trackMax = source[i]
      }
      divisor = trackMax || 1
    }
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
  if (!Number.isFinite(value)) return '—'
  if (mode === 'pdf') return value < 0.001 ? value.toExponential(2) : value.toFixed(4)
  return value >= 100 ? value.toExponential(2) : value.toFixed(3)
}
