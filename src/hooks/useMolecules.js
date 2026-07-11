import { useEffect, useState } from 'react'

const INITIAL_STATE = { molecules: [], error: null, loading: true }

function buildMoleculeIndex(metadata) {
  // Build one lowercase search field up front instead of reconstructing it on
  // every keystroke. Numeric sorting keeps formulas such as C2 before C10.
  return Object.entries(metadata)
    .map(([id, data]) => ({
      id,
      ...data,
      searchText: `${id} ${data.chemical_formula.ascii} ${data.smiles}`.toLowerCase(),
    }))
    .sort((a, b) => a.chemical_formula.ascii.localeCompare(
      b.chemical_formula.ascii,
      undefined,
      { numeric: true },
    ))
}

export function useMolecules() {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    // Metadata is the lightweight startup index; spectra and 3D structures are
    // downloaded separately only for the selected molecule.
    const controller = new AbortController()

    fetch('/data/metadata.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Molecule database could not be loaded.')
        return response.json()
      })
      .then((metadata) => {
        setState({ molecules: buildMoleculeIndex(metadata), error: null, loading: false })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ molecules: [], error, loading: false })
        }
      })

    return () => controller.abort()
  }, [])

  return state
}
