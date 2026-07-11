import { useEffect, useMemo, useRef, useState } from 'react'
import { formatY, prepareTracks, TRACKS, WAVELENGTH_DOMAIN } from '../lib/spectra.js'

// Reserve canvas space for tick labels and axis titles.
const PAD = { left: 58, right: 12, top: 29, bottom: 36 }

function nearestIndex(values, target) {
  // Wavelengths are sorted, so binary search is much cheaper than scanning all
  // 5,000 samples for every canvas point and pointer movement.
  let low = 0
  let high = values.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] < target) low = mid + 1
    else high = mid
  }
  return Math.max(0, Math.min(values.length - 1, low))
}

function valueAtWavelength(wavelengths, values, target) {
  const last = wavelengths.length - 1
  if (target < wavelengths[0] || target > wavelengths[last]) return 0
  const upper = nearestIndex(wavelengths, target)
  if (upper === 0 || wavelengths[upper] === target) return values[upper]
  // Interpolate between neighboring energy-grid samples. This prevents visible
  // steps after the nonlinear conversion from energy to wavelength.
  const lower = upper - 1
  const span = wavelengths[upper] - wavelengths[lower]
  const mix = span ? (target - wavelengths[lower]) / span : 0
  return values[lower] + (values[upper] - values[lower]) * mix
}

function sampleTracks(prepared, plotWidth, waveMin, waveMax, yFor) {
  if (!prepared) return []

  // Drawing roughly one point per screen pixel preserves the curve while
  // avoiding the cost of tracing all 5,000 source values every frame.
  const pixelStep = Math.max(1, plotWidth / Math.max(500, plotWidth * 1.3))
  return TRACKS.map((track, trackNumber) => {
    const points = []
    const values = prepared.tracks[track.key]

    for (let offset = 0; offset <= plotWidth; offset += pixelStep) {
      const lambda = waveMin + (offset / plotWidth) * (waveMax - waveMin)
      const value = valueAtWavelength(prepared.wavelengths, values, lambda)
      points.push({
        x: PAD.left + offset,
        y: yFor(value),
        strength: value / prepared.max,
        wavePhase: lambda * 0.052,
      })
    }

    return {
      ...track,
      trackNumber,
      points,
      endY: yFor(valueAtWavelength(prepared.wavelengths, values, waveMax)),
    }
  })
}

export default function SpectrumPlot({ spectrum, mode, loading, error }) {
  const canvasRef = useRef(null)
  // The animation reads hoverRef without restarting its effect on every pointer
  // move; hover state separately drives the React tooltip.
  const hoverRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState(null)
  const prepared = useMemo(() => prepareTracks(spectrum, mode), [spectrum, mode])

  function updateHover(nextHover) {
    hoverRef.current = nextHover
    setHover(nextHover)
  }

  useEffect(() => {
    // Canvas resolution must follow its responsive CSS size.
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((current) => (
        current.width === width && current.height === height ? current : { width, height }
      ))
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return undefined
    // Limit pixel density to control redraw cost on very high-DPI displays.
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
    // Leave a small amount of headroom above absolute-intensity curves.
    const verticalScale = mode === 'pdf' ? 1 : 0.9

    const xFor = (lambda) => PAD.left + ((lambda - waveMin) / (waveMax - waveMin)) * plotWidth
    const yFor = (value) => PAD.top + plotHeight - (value / (prepared?.max || 1)) * plotHeight * verticalScale
    const sampledTracks = sampleTracks(prepared, plotWidth, waveMin, waveMax, yFor)

    function draw(timestamp = 0) {
      // Cap the animated chart near 26 fps; the underlying data is static.
      if (!reducedMotion && timestamp - lastDraw < 38) {
        frame = requestAnimationFrame(draw)
        return
      }
      lastDraw = timestamp
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      // Draw the axes and restrained scientific grid behind the spectra.
      context.lineWidth = 1
      context.font = '9px ui-monospace, SFMono-Regular, monospace'
      context.fillStyle = '#6f847c'
      context.strokeStyle = 'rgba(194,232,214,.09)'
      for (let tick = 0; tick <= 8; tick += 1) {
        const lambda = waveMin + (tick / 8) * (waveMax - waveMin)
        const x = xFor(lambda)
        context.beginPath(); context.moveTo(x, PAD.top); context.lineTo(x, PAD.top + plotHeight); context.stroke()
        context.textAlign = 'center'; context.fillText(String(Math.round(lambda)), x, size.height - 15)
      }
      for (let i = 0; i <= 4; i += 1) {
        const y = PAD.top + (i / 4) * plotHeight
        context.beginPath(); context.moveTo(PAD.left, y); context.lineTo(size.width - PAD.right, y); context.stroke()
        const value = (prepared?.max || 1) * (1 - i / 4) / verticalScale
        const label = mode === 'pdf' ? Math.max(0, value).toFixed(2) : formatY(Math.max(0, value), mode)
        context.textAlign = 'right'; context.fillText(label, PAD.left - 8, y + 3)
      }
      context.save()
      context.translate(13, PAD.top + plotHeight / 2)
      context.rotate(-Math.PI / 2)
      context.fillStyle = '#9cb3aa'; context.textAlign = 'center'; context.font = '9px Inter, sans-serif'
      context.fillText(mode === 'pdf' ? 'Probability density' : 'Intensity', 0, 0)
      context.restore()
      context.fillStyle = '#9cb3aa'; context.textAlign = 'right'; context.font = '9px Inter, sans-serif'
      context.fillText('Wavelength  λ  (nm)', size.width - PAD.right, size.height - 2)

      if (sampledTracks.length) {
        const activeHover = hoverRef.current
        sampledTracks.forEach((track) => {
          // Add a subtle visual shimmer only; point.y remains the true value.
          const wobblePhase = timestamp * 0.0008 + track.trackNumber * 2.1
          context.beginPath()
          for (let index = 0; index < track.points.length; index += 1) {
            const point = track.points[index]
            const wobble = reducedMotion || point.strength <= 0.005
              ? 0
              : Math.sin(point.wavePhase + wobblePhase) * (0.45 + point.strength * 1.4)
            const y = point.y + wobble
            if (index === 0) context.moveTo(point.x, y)
            else context.lineTo(point.x, y)
          }
          context.lineTo(PAD.left + plotWidth, track.endY)
          context.strokeStyle = track.color
          context.lineWidth = track.trackNumber === 0 ? 1.35 : 1.55
          context.setLineDash(track.dash ? [4, 5] : [])
          context.shadowColor = track.color
          context.shadowBlur = activeHover?.trackKey === track.key ? 16 : 7
          context.globalAlpha = activeHover && activeHover.trackKey !== track.key ? 0.35 : 0.9
          context.stroke()
          context.globalAlpha = 1; context.shadowBlur = 0; context.setLineDash([])
        })
      }

      const activeHover = hoverRef.current
      if (activeHover && prepared) {
        // Mark the exact unanimated value, not the decorative wobble position.
        const x = xFor(activeHover.lambda)
        const y = yFor(activeHover.value)
        context.strokeStyle = 'rgba(238,249,244,.25)'; context.lineWidth = 1
        context.beginPath(); context.moveTo(x, PAD.top); context.lineTo(x, PAD.top + plotHeight); context.stroke()
        context.fillStyle = activeHover.color; context.shadowColor = activeHover.color; context.shadowBlur = 12
        context.beginPath(); context.arc(x, y, 3.2, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0
      }

      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [prepared, mode, size])

  function handlePointer(event) {
    if (!prepared) return
    const rect = canvasRef.current.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const plotWidth = rect.width - PAD.left - PAD.right
    if (localX < PAD.left || localX > rect.width - PAD.right || localY < PAD.top || localY > rect.height - PAD.bottom) {
      updateHover(null)
      return
    }
    const [waveMin, waveMax] = WAVELENGTH_DOMAIN
    const lambda = waveMin + ((localX - PAD.left) / plotWidth) * (waveMax - waveMin)
    const plotHeight = rect.height - PAD.top - PAD.bottom
    const verticalScale = mode === 'pdf' ? 1 : 0.9
    // At the pointer wavelength, select whichever track is vertically closest.
    let closest = null
    TRACKS.forEach((track) => {
      const value = valueAtWavelength(prepared.wavelengths, prepared.tracks[track.key], lambda)
      const y = PAD.top + plotHeight - (value / prepared.max) * plotHeight * verticalScale
      const distance = Math.abs(y - localY)
      if (!closest || distance < closest.distance) closest = { ...track, trackKey: track.key, value, y, distance }
    })
    updateHover({ ...closest, lambda, x: localX, color: closest.color })
  }

  // Clamp the tooltip so it remains inside the chart on narrow screens.
  const tooltipLeft = hover ? Math.min(size.width - 90, Math.max(92, hover.x)) : 0
  const tooltipTop = hover ? Math.max(106, hover.y) : 0

  return (
    <div className="chart-section">
      <div className="legend">
        {TRACKS.map((track) => <span className="legend-item" key={track.key}><i className="legend-line" style={{ background: track.color, color: track.color }} />{track.label}</span>)}
      </div>
      <canvas ref={canvasRef} className="spectrum-canvas" onPointerMove={handlePointer} onPointerLeave={() => updateHover(null)} aria-label="Interactive molecular spectrum plot" />
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
