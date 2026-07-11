import { useEffect, useState } from 'react'
import { decodeSpectrum } from '../lib/spectra.js'

export function useSpectrum(molecule) {
  const [state, setState] = useState({ data: null, loading: false, error: null })

  useEffect(() => {
    if (!molecule) return undefined

    // Each file contains three consecutive Float32 tracks. decodeSpectrum
    // validates that binary contract and adds the wavelength coordinates.
    const controller = new AbortController()
    setState({ data: null, loading: true, error: null })
    fetch(`/data/spectrums/${molecule.id}.bin`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Spectrum for ${molecule.id} is unavailable.`)
        return response.arrayBuffer()
      })
      .then((buffer) => setState({ data: decodeSpectrum(buffer, molecule), loading: false, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, loading: false, error })
      })
    return () => controller.abort()
  }, [molecule])

  return state
}
