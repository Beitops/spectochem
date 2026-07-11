import { Rotate3D } from 'lucide-react'
import { useEffect, useRef } from 'react'
import SpectralBeam from './SpectralBeam.jsx'

// Lazy-load the sizeable 3D library once, when a molecule is first displayed.
let threeDMolPromise

function loadThreeDMol() {
  threeDMolPromise ??= import('3dmol')
  return threeDMolPromise
}

export default function MoleculeViewer({ molecule, molblock }) {
  const hostRef = useRef(null)
  const viewerRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current) return undefined

    if (!molblock) {
      viewerRef.current?.clear()
      viewerRef.current?.render()
      return undefined
    }

    // The import is asynchronous, so guard against finishing after unmount.
    let disposed = false
    let resizeObserver

    loadThreeDMol().then(($3Dmol) => {
      if (disposed || !hostRef.current) return

      // Reuse one viewer instance; replacing only its model avoids repeated
      // WebGL setup when browsing through the database.
      if (!viewerRef.current) {
        viewerRef.current = $3Dmol.createViewer(hostRef.current, {
          backgroundColor: 'rgba(0,0,0,0)',
          antialias: true,
        })
        viewerRef.current.setBackgroundColor(0x000000, 0)
      }

      const viewer = viewerRef.current
      viewer.resize()
      viewer.clear()
      viewer.addModel(molblock, 'mol')
      viewer.setStyle({ elem: 'C' }, { stick: { radius: 0.13, color: '#53645e' }, sphere: { scale: 0.26, color: '#60736c' } })
      viewer.setStyle({ elem: 'H' }, { stick: { radius: 0.07, color: '#8b9b95' }, sphere: { scale: 0.18, color: '#c3d0cb' } })
      viewer.setStyle({ elem: 'N' }, { stick: { radius: 0.14, color: '#48c5ff' }, sphere: { scale: 0.31, color: '#48c5ff' } })
      viewer.setStyle({ elem: 'O' }, { stick: { radius: 0.14, color: '#ff6377' }, sphere: { scale: 0.31, color: '#ff6377' } })
      viewer.setStyle({ elem: 'S' }, { stick: { radius: 0.15, color: '#f4da55' }, sphere: { scale: 0.34, color: '#f4da55' } })
      viewer.setStyle({ not: { elem: ['C', 'H', 'N', 'O', 'S'] } }, { stick: { radius: 0.15, color: '#d7ff68' }, sphere: { scale: 0.35, color: '#d7ff68' } })

      // Recenter after responsive layout changes so the molecule remains framed.
      const centerMolecule = () => {
        viewer.resize()
        viewer.zoomTo()
        viewer.zoom(window.innerWidth < 600 ? 1.15 : 1.35)
        viewer.render()
      }

      centerMolecule()
      viewer.spin('y', 0.45)
      resizeObserver = new ResizeObserver(centerMolecule)
      resizeObserver.observe(hostRef.current)
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
    }
  }, [molblock])

  return (
    <div className="molecule-section">
      <SpectralBeam />
      <div className="viewer-wrap">
        <div className="viewer-halo" />
        <div ref={hostRef} className="molecule-viewer" aria-label={`Rotating 3D structure of ${molecule?.chemical_formula.unicode || 'selected molecule'}`} />
        <span className="viewer-note"><Rotate3D size={13} />Drag to inspect · scroll to zoom</span>
      </div>
    </div>
  )
}
