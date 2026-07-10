import { Rotate3D } from 'lucide-react'
import { useEffect, useRef } from 'react'
import * as $3Dmol from '3dmol'
import SpectralBeam from './SpectralBeam.jsx'

export default function MoleculeViewer({ molecule }) {
  const hostRef = useRef(null)
  const viewerRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current || !molecule?.molblock) return undefined
    if (!viewerRef.current) {
      viewerRef.current = $3Dmol.createViewer(hostRef.current, { backgroundColor: 'rgba(0,0,0,0)', antialias: true })
      viewerRef.current.setBackgroundColor(0x000000, 0)
    }
    const viewer = viewerRef.current
    viewer.clear()
    viewer.addModel(molecule.molblock, 'mol')
    viewer.setStyle({ elem: 'C' }, { stick: { radius: 0.13, color: '#53645e' }, sphere: { scale: 0.26, color: '#60736c' } })
    viewer.setStyle({ elem: 'H' }, { stick: { radius: 0.07, color: '#8b9b95' }, sphere: { scale: 0.18, color: '#c3d0cb' } })
    viewer.setStyle({ elem: 'N' }, { stick: { radius: 0.14, color: '#48c5ff' }, sphere: { scale: 0.31, color: '#48c5ff' } })
    viewer.setStyle({ elem: 'O' }, { stick: { radius: 0.14, color: '#ff6377' }, sphere: { scale: 0.31, color: '#ff6377' } })
    viewer.setStyle({ elem: 'S' }, { stick: { radius: 0.15, color: '#f4da55' }, sphere: { scale: 0.34, color: '#f4da55' } })
    viewer.setStyle({ not: { elem: ['C', 'H', 'N', 'O', 'S'] } }, { stick: { radius: 0.15, color: '#d7ff68' }, sphere: { scale: 0.35, color: '#d7ff68' } })
    viewer.zoomTo()
    viewer.zoom(window.innerWidth < 600 ? 1.15 : 1.35)
    viewer.spin('y', 0.45)
    viewer.render()
    const resize = () => viewer.resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [molecule])

  return (
    <div className="molecule-section">
      <SpectralBeam molecule={molecule} />
      <div className="viewer-wrap">
        <div className="viewer-halo" />
        <div ref={hostRef} className="molecule-viewer" aria-label={`Rotating 3D structure of ${molecule?.chemical_formula.unicode || 'selected molecule'}`} />
        <span className="viewer-note"><Rotate3D size={13} />Drag to inspect · scroll to zoom</span>
      </div>
    </div>
  )
}
