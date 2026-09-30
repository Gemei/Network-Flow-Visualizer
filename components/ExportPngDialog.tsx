import { useEffect, useRef, useState } from 'react'
import { getNodesBounds, getViewportForBounds, useReactFlow, type Node, type Viewport } from '@xyflow/react'
import { toPng } from 'html-to-image'

type Props = {
  open: boolean
  chartName: string
  onClose: () => void
}

const PREVIEW_MAX = 1400

type Box = { x: number; y: number; width: number; height: number }

function emptyBox(): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function include(box: { minX: number; minY: number; maxX: number; maxY: number }, x: number, y: number, width: number, height: number) {
  if (width < 1 || height < 1 || !Number.isFinite(x) || !Number.isFinite(y)) return
  box.minX = Math.min(box.minX, x)
  box.minY = Math.min(box.minY, y)
  box.maxX = Math.max(box.maxX, x + width)
  box.maxY = Math.max(box.maxY, y + height)
}

function toBox(box: { minX: number; minY: number; maxX: number; maxY: number }, fallback: Box): Box {
  if (!Number.isFinite(box.minX)) return fallback
  return {
    x: box.minX,
    y: box.minY,
    width: Math.max(box.maxX - box.minX, 1),
    height: Math.max(box.maxY - box.minY, 1),
  }
}

// Measure the painted nodes, curves, arrowheads, and labels. Stored positions
// miss curves that bow outside a zone, which is what was getting cropped.
function renderedBounds(viewport: Viewport, nodes: Node[]): Box {
  const official = nodes.length
    ? getNodesBounds(nodes)
    : { x: 0, y: 0, width: 1, height: 1 }
  const pane = document.querySelector('.react-flow') as HTMLElement | null
  if (!pane) return official
  const paneRect = pane.getBoundingClientRect()
  const zoom = viewport.zoom || 1
  const nodesBox = emptyBox()
  const inkBox = emptyBox()
  const addScreen = (target: { minX: number; minY: number; maxX: number; maxY: number }, el: Element) => {
    const rect = el.getBoundingClientRect()
    include(target, (rect.left - paneRect.left - viewport.x) / zoom, (rect.top - paneRect.top - viewport.y) / zoom, rect.width / zoom, rect.height / zoom)
  }
  pane.querySelectorAll('.react-flow__node').forEach(el => addScreen(nodesBox, el))
  const screenNodes = toBox(nodesBox, official)
  const shiftX = screenNodes.x - official.x
  const shiftY = screenNodes.y - official.y
  pane.querySelectorAll('.react-flow__node, .react-flow__edge path, .react-flow__edge polygon, .react-flow__edgelabel-renderer > div').forEach(el => addScreen(inkBox, el))
  include(inkBox, official.x + shiftX, official.y + shiftY, official.width, official.height)
  const ink = toBox(inkBox, { ...official, x: official.x + shiftX, y: official.y + shiftY })
  const slack = 12
  return {
    x: ink.x - shiftX - slack,
    y: ink.y - shiftY - slack,
    width: ink.width + slack * 2,
    height: ink.height + slack * 2,
  }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not draw the graph image.'))
    img.src = dataUrl
  })
}

const CANVAS_LIMIT = 16384

async function rasterGraph(nodes: Node[], viewportState: Viewport, background: string, scale: number, maxEdge?: number) {
  const bounds = renderedBounds(viewportState, nodes)
  let graphW = Math.max(1, Math.ceil(bounds.width * scale))
  let graphH = Math.max(1, Math.ceil(bounds.height * scale))
  if (maxEdge) {
    const fit = Math.min(1, maxEdge / Math.max(graphW, graphH))
    graphW = Math.max(1, Math.round(graphW * fit))
    graphH = Math.max(1, Math.round(graphH * fit))
  }
  const limitFit = Math.min(1, CANVAS_LIMIT / Math.max(graphW, graphH))
  graphW = Math.max(1, Math.floor(graphW * limitFit))
  graphH = Math.max(1, Math.floor(graphH * limitFit))
  const viewport = getViewportForBounds(bounds, graphW, graphH, 0.01, 64, 0)
  const flow = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!flow) throw new Error('Graph is not ready to export.')
  const dataUrl = await toPng(flow, {
    backgroundColor: background,
    width: graphW,
    height: graphH,
    pixelRatio: 1,
    style: {
      width: `${graphW}px`,
      height: `${graphH}px`,
      overflow: 'visible',
      transformOrigin: '0 0',
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  })
  return { image: await loadImage(dataUrl), flowW: bounds.width, flowH: bounds.height }
}

function composePng(
  image: HTMLImageElement,
  flowW: number,
  flowH: number,
  percent: number,
  borderPx: number,
  borderColor: string,
  maxEdge?: number,
) {
  const scale = Math.max(percent, 1) / 100
  let graphW = Math.max(1, Math.ceil(flowW * scale))
  let graphH = Math.max(1, Math.ceil(flowH * scale))
  let border = Math.max(0, Math.round(borderPx))
  if (maxEdge) {
    const fit = Math.min(1, maxEdge / Math.max(graphW + border * 2, graphH + border * 2))
    graphW = Math.max(1, Math.round(graphW * fit))
    graphH = Math.max(1, Math.round(graphH * fit))
    border = Math.round(border * fit)
  }
  const canvas = document.createElement('canvas')
  canvas.width = graphW + border * 2
  canvas.height = graphH + border * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the image.')
  ctx.fillStyle = borderColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, border, border, graphW, graphH)
  return { url: canvas.toDataURL('image/png'), width: Math.ceil(flowW * scale) + Math.max(0, Math.round(borderPx)) * 2, height: Math.ceil(flowH * scale) + Math.max(0, Math.round(borderPx)) * 2 }
}

type GraphShot = { image: HTMLImageElement; flowW: number; flowH: number }

export function ExportPngDialog({ open, chartName, onClose }: Props) {
  const { getNodes, getViewport } = useReactFlow()
  const [percentText, setPercentText] = useState('100')
  const [borderPx, setBorderPx] = useState(5)
  const [borderColor, setBorderColor] = useState('#ffffff')
  const [previewUrl, setPreviewUrl] = useState('')
  const [sizeLabel, setSizeLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shotRef = useRef<GraphShot | null>(null)
  const parsedPercent = Number(percentText)
  const percent = Number.isFinite(parsedPercent) && parsedPercent > 0 ? parsedPercent : 100

  useEffect(() => {
    if (!open) {
      shotRef.current = null
      return
    }
    let cancelled = false
    const nodes = getNodes()
    if (!nodes.length) {
      setPreviewUrl('')
      setSizeLabel('')
      setError('Nothing on the graph to export.')
      return
    }
    setBusy(true)
    setError('')
    const pane = document.querySelector('.react-flow') as HTMLElement | null
    const background = pane ? getComputedStyle(pane).backgroundColor : '#f9fafb'
    rasterGraph(nodes, getViewport(), background, 1, PREVIEW_MAX)
      .then(shot => {
        if (cancelled) return
        shotRef.current = shot
        setBusy(false)
      })
      .catch(err => {
        if (cancelled) return
        shotRef.current = null
        setPreviewUrl('')
        setError(err instanceof Error ? err.message : 'Preview failed')
        setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, getNodes, getViewport])

  useEffect(() => {
    const shot = shotRef.current
    if (!open || !shot) return
    const scale = Math.max(percent, 1) / 100
    const border = Math.max(0, Math.round(borderPx))
    setSizeLabel(`${Math.ceil(shot.flowW * scale) + border * 2} × ${Math.ceil(shot.flowH * scale) + border * 2} px`)
    try {
      setPreviewUrl(composePng(shot.image, shot.flowW, shot.flowH, percent, borderPx, borderColor, PREVIEW_MAX).url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    }
  }, [open, percent, borderPx, borderColor, busy])

  if (!open) return null

  const download = async () => {
    const nodes = getNodes()
    if (!nodes.length) return
    setBusy(true)
    setError('')
    try {
      const pane = document.querySelector('.react-flow') as HTMLElement | null
      const background = pane ? getComputedStyle(pane).backgroundColor : '#f9fafb'
      const shot = await rasterGraph(nodes, getViewport(), background, Math.max(percent, 1) / 100)
      const file = composePng(shot.image, shot.image.naturalWidth, shot.image.naturalHeight, 100, borderPx, borderColor)
      const link = document.createElement('a')
      link.href = file.url
      link.download = `${chartName || 'graph'}.png`
      link.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6">
      <div className="flex h-[min(820px,90vh)] w-[min(1100px,96vw)] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex min-w-0 flex-1 flex-col bg-gray-100 p-4 dark:bg-gray-950">
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {busy ? 'Updating preview…' : sizeLabel ? `Export size ${sizeLabel}` : 'Preview'}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            {previewUrl ? (
              <img src={previewUrl} alt="PNG export preview" className="max-h-full max-w-full object-contain shadow" />
            ) : (
              <p className="text-sm text-gray-500">{error || 'Preview will appear here.'}</p>
            )}
          </div>
        </div>
        <div className="flex w-72 shrink-0 flex-col gap-4 border-l border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Export PNG</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close">
              ×
            </button>
          </div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Resolution
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                step="any"
                value={percentText}
                onChange={(e) => setPercentText(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            {shotRef.current && Math.max(shotRef.current.flowW, shotRef.current.flowH) * (percent / 100) > CANVAS_LIMIT && (
              <p className="mt-1 text-xs text-gray-500">The picture is capped at {CANVAS_LIMIT}px on the long side, which is as large as the browser can save.</p>
            )}
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Border
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={400}
                value={borderPx}
                onChange={(e) => setBorderPx(Math.min(400, Math.max(0, Number(e.target.value) || 0)))}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="text-sm text-gray-500">px</span>
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Border color
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1 dark:border-gray-700"
              />
              <input
                type="text"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </label>
          {error && previewUrl && <p className="text-xs text-red-600">{error}</p>}
          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || !previewUrl}
              onClick={download}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
