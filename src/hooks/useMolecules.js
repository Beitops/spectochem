import { useEffect, useMemo, useState } from 'react'

export function useMolecules() {
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/metadata.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Molecule database could not be loaded.')
        return response.json()
      })
      .then(setMetadata)
      .catch((caught) => {
        if (caught.name !== 'AbortError') setError(caught)
      })
    return () => controller.abort()
  }, [])

  const molecules = useMemo(() => {
    if (!metadata) return []
    return Object.entries(metadata)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.chemical_formula.ascii.localeCompare(b.chemical_formula.ascii, undefined, { numeric: true }))
  }, [metadata])

  return { metadata, molecules, error, loading: !metadata && !error }
}
