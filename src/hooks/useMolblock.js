import { useEffect, useState } from 'react'

// MolBlocks are fetched on demand because embedding every 3D structure in the
// startup metadata would make the initial download much larger.
const molblockCache = new Map()
const EMPTY_STATE = { id: null, data: null, loading: false, error: null }
const HEADER_BYTES = Uint32Array.BYTES_PER_ELEMENT

function decodeMolblock(buffer) {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('Invalid 3D structure payload.')

  // Binary layout: a little-endian 4-byte text length followed by UTF-8 text.
  const length = new DataView(buffer).getUint32(0, true)
  if (length !== buffer.byteLength - HEADER_BYTES) {
    throw new Error('Invalid 3D structure payload.')
  }

  return new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES, length))
}

export function useMolblock(id) {
  const [state, setState] = useState(EMPTY_STATE)

  useEffect(() => {
    if (!id) {
      setState(EMPTY_STATE)
      return undefined
    }

    // Reuse structures already viewed during this browser session.
    const cached = molblockCache.get(id)
    if (cached) {
      setState({ id, data: cached, loading: false, error: null })
      return undefined
    }

    // Abort the previous request when the selection changes quickly.
    const controller = new AbortController()
    setState({ id, data: null, loading: true, error: null })

    fetch(`/data/molblocks/${id}.bin`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`3D structure for ${id} is unavailable.`)
        return response.arrayBuffer()
      })
      .then(decodeMolblock)
      .then((data) => {
        molblockCache.set(id, data)
        setState({ id, data, loading: false, error: null })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ id, data: null, loading: false, error })
        }
      })

    return () => controller.abort()
  }, [id])

  // Never expose data belonging to the molecule selected just before this one.
  return state.id === id ? state : { id, data: null, loading: Boolean(id), error: null }
}
