import { useEffect, useMemo, useRef, useState } from 'react'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react'
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

export default function SpectrumPlot({ spectrum, jsd, mode, loading, error }) {
  const canvasRef = useRef(null)
  const drawRef = useRef(null)
  const previousViewRef = useRef(null)
  // The animation reads hoverRef without restarting its effect on every pointer
  // move; hover state separately drives the React tooltip.
  const hoverRef = useRef(null)
  const activeTouchPointerRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState(null)
  const [visibleTrack, setVisibleTrack] = useState(null)
  const prepared = useMemo(() => prepareTracks(spectrum, mode), [spectrum, mode])
  const { refs, floatingStyles } = useFloating({
    open: Boolean(hover),
    placement: 'right-start',
    strategy: 'fixed',
    middleware: [
      offset(14),
      flip({ fallbackPlacements: ['left-start', 'right-end', 'left-end'] }),
      shift({ padding: 10 }),
    ],
    whileElementsMounted: autoUpdate,
  })

  function updateHover(nextHover) {
    hoverRef.current = nextHover
    setHover(nextHover)
    // Once the entrance animation has settled, pointer changes still need one
    // canvas redraw to update the highlighted curve and marker.
    if (drawRef.current) requestAnimationFrame(drawRef.current)
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
    const animationStarted = performance.now()
    const animationDuration = 650
    const plotWidth = size.width - PAD.left - PAD.right
    const plotHeight = size.height - PAD.top - PAD.bottom
    const [waveMin, waveMax] = WAVELENGTH_DOMAIN
    // Leave a small amount of headroom above absolute-intensity curves.
    const verticalScale = mode === 'pdf' ? 1 : 0.9

    const previousView = previousViewRef.current
    const isSameSpectrum = previousView?.spectrum === spectrum
    const isModeTransition = isSameSpectrum && previousView.mode !== mode
    const isVisibilityTransition = isSameSpectrum && previousView.visibleTrack !== visibleTrack

    const xFor = (lambda) => PAD.left + ((lambda - waveMin) / (waveMax - waveMin)) * plotWidth
    const yFor = (value) => PAD.top + plotHeight - (value / (prepared?.max || 1)) * plotHeight * verticalScale
    const sampledTracks = sampleTracks(prepared, plotWidth, waveMin, waveMax, yFor)
    const previousVerticalScale = previousView?.mode === 'pdf' ? 1 : 0.9
    const previousYFor = (value) => PAD.top + plotHeight
      - (value / (previousView?.prepared?.max || 1)) * plotHeight * previousVerticalScale
    const previousTracks = isModeTransition
      ? sampleTracks(previousView.prepared, plotWidth, waveMin, waveMax, previousYFor)
      : null

    const isTrackVisible = (trackKey, selection) => !selection || selection === trackKey

    function draw(timestamp = 0) {
      const rawProgress = reducedMotion ? 1 : Math.min(1, (timestamp - animationStarted) / animationDuration)
      // Cubic easing gives the new spectrum a quick, confident start and a
      // gentle finish without continuously animating scientific data.
      const easedProgress = 1 - Math.pow(1 - Math.max(0, rawProgress), 3)
      const revealProgress = isSameSpectrum ? 1 : easedProgress
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
          const previousTrack = previousTracks?.[track.trackNumber]
          const startAlpha = isVisibilityTransition
            ? Number(isTrackVisible(track.key, previousView.visibleTrack))
            : Number(isTrackVisible(track.key, visibleTrack))
          const endAlpha = Number(isTrackVisible(track.key, visibleTrack))
          const visibilityAlpha = startAlpha + (endAlpha - startAlpha) * easedProgress
          if (visibilityAlpha <= 0.001) return
          context.save()
          context.beginPath()
          context.rect(PAD.left, PAD.top - 20, plotWidth * revealProgress, plotHeight + 40)
          context.clip()
          context.beginPath()
          for (let index = 0; index < track.points.length; index += 1) {
            const point = track.points[index]
            const previousY = previousTrack?.points[index]?.y ?? point.y
            const animatedY = previousY + (point.y - previousY) * easedProgress
            if (index === 0) context.moveTo(point.x, animatedY)
            else context.lineTo(point.x, animatedY)
          }
          const previousEndY = previousTrack?.endY ?? track.endY
          context.lineTo(PAD.left + plotWidth, previousEndY + (track.endY - previousEndY) * easedProgress)
          context.strokeStyle = track.color
          context.lineWidth = track.trackNumber === 0 ? 1.35 : 1.55
          context.setLineDash(track.dash ? [4, 5] : [])
          context.shadowColor = track.color
          context.shadowBlur = activeHover?.trackKey === track.key ? 16 : 7
          context.globalAlpha = visibilityAlpha * (activeHover && activeHover.trackKey !== track.key ? 0.35 : 0.9)
          context.stroke()
          context.globalAlpha = 1; context.shadowBlur = 0; context.setLineDash([])
          context.restore()
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

      if (rawProgress < 1) frame = requestAnimationFrame(draw)
    }
    previousViewRef.current = { spectrum, prepared, mode, visibleTrack }
    drawRef.current = draw
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      drawRef.current = null
    }
  }, [prepared, mode, size, visibleTrack])

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
    TRACKS.filter((track) => !visibleTrack || track.key === visibleTrack).forEach((track) => {
      const value = valueAtWavelength(prepared.wavelengths, prepared.tracks[track.key], lambda)
      const y = PAD.top + plotHeight - (value / prepared.max) * plotHeight * verticalScale
      const distance = Math.abs(y - localY)
      if (!closest || distance < closest.distance) closest = { ...track, trackKey: track.key, value, y, distance }
    })
    updateHover({ ...closest, lambda, x: localX, color: closest.color })
    // A virtual reference lets Floating UI place the panel next to the actual
    // pointer while flip/shift keep it clear of both the cursor and viewport.
    refs.setPositionReference({
      getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0),
    })
  }

  function handlePointerDown(event) {
    if (event.pointerType !== 'mouse') {
      activeTouchPointerRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    handlePointer(event)
  }

  function handlePointerMove(event) {
    if (event.pointerType !== 'mouse' && activeTouchPointerRef.current !== event.pointerId) return
    handlePointer(event)
  }

  function handlePointerEnd(event) {
    if (activeTouchPointerRef.current !== event.pointerId) return
    activeTouchPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updateHover(null)
  }

  function toggleTrack(trackKey) {
    setVisibleTrack((current) => current === trackKey ? null : trackKey)
    updateHover(null)
  }

  return (
    <div className="chart-section">
      <div className="legend">
        {TRACKS.map((track) => (
          <button
            type="button"
            className={`legend-item ${visibleTrack && visibleTrack !== track.key ? 'muted' : 'active'}`}
            key={track.key}
            onClick={() => toggleTrack(track.key)}
            aria-pressed={visibleTrack === track.key}
            title={visibleTrack === track.key ? 'Show all models' : `Show only ${track.label}`}
          >
            <i className="legend-line" style={{ background: track.color, color: track.color }} />{track.label}
          </button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        className="spectrum-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') updateHover(null) }}
        aria-label="Interactive molecular spectrum plot"
      />
      {loading && <div className="spectrum-loading">Resolving spectrum…</div>}
      {error && <div className="spectrum-loading">{error.message}</div>}
      {hover && (
        <div ref={refs.setFloating} className="spectrum-tooltip" style={floatingStyles}>
          <div className="tooltip-track" style={{ color: hover.color }}><i className="live-dot" style={{ background: hover.color }} />{hover.label}</div>
          <div className="tooltip-grid">
            <span>λ</span><strong>{hover.lambda.toFixed(2)} nm</strong>
            <span>{mode === 'pdf' ? 'Density' : 'Intensity'}</span><strong>{formatY(hover.value, mode)}</strong>
            <span>JSD</span><strong>{hover.trackKey === 'groundTruth' ? 'Reference' : jsd?.[hover.trackKey === 'schnet' ? 'SchNet' : 'GAT']?.toFixed(4) ?? '—'}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
