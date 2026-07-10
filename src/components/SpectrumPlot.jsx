import { useEffect, useMemo, useRef, useState } from 'react'
import { formatY, prepareTracks, TRACKS, WAVELENGTH_DOMAIN, wavelengthToColor } from '../lib/spectra.js'

const PAD = { left: 58, right: 12, top: 29, bottom: 36 }

function nearestIndex(values, target) {
  let low = 0
  let high = values.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] < target) low = mid + 1
    else high = mid
  }
  return Math.max(0, Math.min(values.length - 1, low))
}

export default function SpectrumPlot({ spectrum, mode, loading, error }) {
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState(null)
  const prepared = useMemo(() => prepareTracks(spectrum, mode), [spectrum, mode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return undefined
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const context = canvas.getContext('2d')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let lastDraw = 0
    const plotWidth = size.width - PAD.left - PAD.right
    const plotHeight = size.height - PAD.top - PAD.bottom
    const [waveMin, waveMax] = WAVELENGTH_DOMAIN

    const xFor = (lambda) => PAD.left + ((lambda - waveMin) / (waveMax - waveMin)) * plotWidth
    const yFor = (value) => PAD.top + plotHeight - (value / (prepared?.max || 1)) * plotHeight * 0.9

    function draw(timestamp = 0) {
      if (!reducedMotion && timestamp - lastDraw < 38) {
        frame = requestAnimationFrame(draw)
        return
      }
      lastDraw = timestamp
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      // restrained scientific grid
      context.lineWidth = 1
      context.font = '9px ui-monospace, SFMono-Regular, monospace'
      context.fillStyle = '#6f847c'
      context.strokeStyle = 'rgba(194,232,214,.09)'
      for (let lambda = 200; lambda <= 1000; lambda += 100) {
        const x = xFor(lambda)
        context.beginPath(); context.moveTo(x, PAD.top); context.lineTo(x, PAD.top + plotHeight); context.stroke()
        context.textAlign = 'center'; context.fillText(String(lambda), x, size.height - 15)
      }
      for (let i = 0; i <= 4; i += 1) {
        const y = PAD.top + (i / 4) * plotHeight
        context.beginPath(); context.moveTo(PAD.left, y); context.lineTo(size.width - PAD.right, y); context.stroke()
        const value = (prepared?.max || 1) * (1 - i / 4) / 0.9
        context.textAlign = 'right'; context.fillText(formatY(Math.max(0, value), mode), PAD.left - 8, y + 3)
      }
      context.save()
      context.translate(13, PAD.top + plotHeight / 2)
      context.rotate(-Math.PI / 2)
      context.fillStyle = '#9cb3aa'; context.textAlign = 'center'; context.font = '9px Inter, sans-serif'
      context.fillText(mode === 'pdf' ? 'Probability density' : 'Intensity', 0, 0)
      context.restore()
      context.fillStyle = '#9cb3aa'; context.textAlign = 'right'; context.font = '9px Inter, sans-serif'
      context.fillText('Wavelength  λ  (nm)', size.width - PAD.right, size.height - 2)

      if (prepared) {
        TRACKS.forEach((track, trackNumber) => {
          const values = prepared.tracks[track.key]
          const wavelengths = prepared.wavelengths
          const step = Math.max(1, Math.floor(values.length / Math.max(500, plotWidth * 1.3)))
          const wobblePhase = timestamp * 0.0008 + trackNumber * 2.1
          context.beginPath()
          let started = false
          for (let i = 0; i < values.length; i += step) {
            const lambda = wavelengths[i]
            if (lambda < waveMin || lambda > waveMax) continue
            const x = xFor(lambda)
            const baseY = yFor(values[i])
            const strength = values[i] / (prepared.max || 1)
            const wobble = reducedMotion ? 0 : Math.sin(lambda * 0.052 + wobblePhase) * (0.45 + strength * 1.4)
            if (!started) { context.moveTo(x, baseY + wobble); started = true }
            else context.lineTo(x, baseY + wobble)
          }
          context.strokeStyle = track.color
          context.lineWidth = trackNumber === 0 ? 1.35 : 1.55
          context.setLineDash(track.dash ? [4, 5] : [])
          context.shadowColor = track.color
          context.shadowBlur = hover?.trackKey === track.key ? 16 : 7
          context.globalAlpha = hover && hover.trackKey !== track.key ? 0.35 : 0.9
          context.stroke()
          context.globalAlpha = 1; context.shadowBlur = 0; context.setLineDash([])
        })
      }

      if (hover && prepared) {
        const x = xFor(hover.lambda)
        const y = yFor(hover.value)
        context.strokeStyle = 'rgba(238,249,244,.25)'; context.lineWidth = 1
        context.beginPath(); context.moveTo(x, PAD.top); context.lineTo(x, PAD.top + plotHeight); context.stroke()
        context.fillStyle = hover.color; context.shadowColor = hover.color; context.shadowBlur = 12
        context.beginPath(); context.arc(x, y, 3.2, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0
      }

      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [prepared, mode, size, hover])

  function handlePointer(event) {
    if (!prepared) return
    const rect = canvasRef.current.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const plotWidth = rect.width - PAD.left - PAD.right
    if (localX < PAD.left || localX > rect.width - PAD.right || localY < PAD.top || localY > rect.height - PAD.bottom) {
      setHover(null); return
    }
    const lambda = WAVELENGTH_DOMAIN[0] + ((localX - PAD.left) / plotWidth) * (WAVELENGTH_DOMAIN[1] - WAVELENGTH_DOMAIN[0])
    const index = nearestIndex(prepared.wavelengths, lambda)
    const plotHeight = rect.height - PAD.top - PAD.bottom
    let closest = null
    TRACKS.forEach((track) => {
      const value = prepared.tracks[track.key][index]
      const y = PAD.top + plotHeight - (value / prepared.max) * plotHeight * 0.9
      const distance = Math.abs(y - localY)
      if (!closest || distance < closest.distance) closest = { ...track, trackKey: track.key, value, y, distance }
    })
    setHover({ ...closest, lambda: prepared.wavelengths[index], x: localX, color: closest.color })
  }

  const tooltipLeft = hover ? Math.min(size.width - 90, Math.max(92, hover.x)) : 0
  const tooltipTop = hover ? Math.max(106, hover.y) : 0

  return (
    <div className="chart-section">
      <div className="legend">
        {TRACKS.map((track) => <span className="legend-item" key={track.key}><i className="legend-line" style={{ background: track.color, color: track.color }} />{track.label}</span>)}
      </div>
      <canvas ref={canvasRef} className="spectrum-canvas" onPointerMove={handlePointer} onPointerLeave={() => setHover(null)} aria-label="Interactive molecular spectrum plot" />
      {loading && <div className="spectrum-loading">Resolving spectrum…</div>}
      {error && <div className="spectrum-loading">{error.message}</div>}
      {hover && (
        <div className="spectrum-tooltip" style={{ left: tooltipLeft, top: tooltipTop }}>
          <div className="tooltip-track" style={{ color: hover.color }}><i className="live-dot" style={{ background: hover.color }} />{hover.label}</div>
          <div className="tooltip-grid">
            <span>λ</span><strong>{hover.lambda.toFixed(2)} nm</strong>
            <span>{mode === 'pdf' ? 'Density' : 'Intensity'}</span><strong>{formatY(hover.value, mode)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
