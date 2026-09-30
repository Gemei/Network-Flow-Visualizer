import { useState, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { classifyTraffic } from '@/lib/paloalto-import'
import { BaseEdge, EdgeLabelRenderer, EdgeProps, Node, useReactFlow } from '@xyflow/react'

type Side = 'left' | 'right' | 'top' | 'bottom'

function nodeOrigin(node: Node, getNode: (id: string) => Node | undefined) {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = getNode(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function nodeSize(node: Node) {
  const width = node.measured?.width ?? node.width ?? (node.style?.width as number) ?? 200
  const height = node.measured?.height ?? node.height ?? (node.style?.height as number) ?? 80
  return { width, height }
}

function sideAnchor(node: Node, side: Side, getNode: (id: string) => Node | undefined) {
  const { x, y } = nodeOrigin(node, getNode)
  const { width, height } = nodeSize(node)
  if (side === 'left') return { x, y: y + height / 2 }
  if (side === 'right') return { x: x + width, y: y + height / 2 }
  if (side === 'top') return { x: x + width / 2, y }
  return { x: x + width / 2, y: y + height }
}

function nearestSide(node: Node, point: { x: number; y: number }, getNode: (id: string) => Node | undefined): Side {
  const sides: Side[] = ['left', 'right', 'top', 'bottom']
  let best: Side = 'right'
  let bestDist = Infinity
  sides.forEach(side => {
    const anchor = sideAnchor(node, side, getNode)
    const dist = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2
    if (dist < bestDist) {
      best = side
      bestDist = dist
    }
  })
  return best
}

export function RuleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  sourcePosition,
  targetPosition,
  style = {},

  data,
  selected,
}: EdgeProps) {
  // Optional persisted drag offsets passed down from page.tsx state
  const savedControlX = data?.controlX as number | undefined
  const savedControlY = data?.controlY as number | undefined

  // Local drag state for real-time 60fps updates while dragging
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const isDragging = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const dragStartOffset = useRef({ x: 0, y: 0 })
  const { getViewport, screenToFlowPosition, getNode } = useReactFlow()
  const [attachDrag, setAttachDrag] = useState<{
    end: 'source' | 'target'
    x: number
    y: number
    side: Side
    anchorX: number
    anchorY: number
  } | null>(null)

  // Compute curvature offset to prevent overlapping edges between same source/target
  const edgeIndex = (data?.edgeIndex as number) ?? 0
  const edgeTotal = (data?.edgeTotalBetweenPair as number) ?? 1
  // Offset: fan out edges symmetrically. Even a single edge gets a slight curve.
  const baseOffset = 90
  const offsetMultiplier = edgeTotal > 1
    ? (edgeIndex - (edgeTotal - 1) / 2) * baseOffset
    : 0

  // Compute the midpoint direction perpendicular to the edge for curving
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  
  // Directional Bending for intra-zone (left-to-left or right-to-right handles)
  let nx = -dy / len
  let ny = dx / len
  
  if (sourcePosition === 'left' && targetPosition === 'left') {
    nx = -1
    ny = 0
  } else if (sourcePosition === 'right' && targetPosition === 'right') {
    nx = 1
    ny = 0
  } else if (sourcePosition === 'top' && targetPosition === 'top') {
    nx = 0
    ny = -1
  } else if (sourcePosition === 'bottom' && targetPosition === 'bottom') {
    nx = 0
    ny = 1
  }

  // Always add a slight default curvature (20px) plus the fan-out offset
  const defaultCurve = 20
  const totalOffset = defaultCurve + offsetMultiplier

  let controlX = savedControlX !== undefined 
    ? savedControlX + dragOffset.x 
    : (midX + nx * totalOffset) + dragOffset.x
    
  let controlY = savedControlY !== undefined 
    ? savedControlY + dragOffset.y 
    : (midY + ny * totalOffset) + dragOffset.y

  // Build a quadratic bezier path manually for consistent curvature
  const edgePath = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`
  const labelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX
  const labelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY

  const isBlock = data?.action === 'BLOCK'
  const isAuto = data?.isAuto
  const isOverridden = data?.isOverridden
  const reverseDirection = String(source) > String(target)

  // Allow and deny each have two shades so the opposite direction reads as a different line.
  let strokeColor = reverseDirection ? '#15803d' : '#4ade80'
  if (isAuto) strokeColor = '#9ca3af'
  else if (isBlock) strokeColor = reverseDirection ? '#b91c1c' : '#fb7185'

  const activeStyle = {
    ...style,
    strokeWidth: selected ? 9 : (isAuto ? 2 : 5),
    stroke: strokeColor,
    strokeDasharray: isBlock || isAuto ? '10,7' : 'none',
    cursor: 'pointer',
    filter: selected ? `drop-shadow(0 0 4px ${strokeColor})` : undefined,
  }

  const flowRules = (data?.flowRules as { name?: string; ports?: string }[]) || []
  const services = [...new Set(flowRules.flatMap(rule => {
    const parts = classifyTraffic(rule.ports || '')
    return [...parts.ports, ...parts.services, ...parts.applications]
  }).filter(port => port && port.toLowerCase() !== 'any'))]
  const serviceText = services.length === 0 ? 'any' : services.slice(0, 2).join(', ') + (services.length > 2 ? ` +${services.length - 2}` : '')
  const ruleCount = flowRules.length || Number(data?.ruleCount) || 1
  const shortCaption = data?.isAuto ? 'possible' : `${ruleCount} ${isBlock ? 'deny' : 'allow'}`
  const caption = selected || hovered
    ? (data?.isAuto ? 'possible' : `${ruleCount} ${isBlock ? 'deny' : 'allow'} · ${serviceText}`)
    : shortCaption

  // Label color matches stroke
  let labelColor = strokeColor

  // Build tooltip with source/destination info
  const tooltipLines = [
    `Action: ${data?.action}${isOverridden ? ' (Overridden)' : ''}`,
    `Source: ${data?.sourceName || 'any'}`,
    `Destination: ${data?.destName || 'any'}`,
    `Ports: ${data?.ports}`,
  ]
  if (data?.description) tooltipLines.push(`Description: ${data.description}`)
  if (data?.priority !== undefined) tooltipLines.push(`Priority: ${data.priority}`)

  const startDrag = (e: ReactPointerEvent) => {
    e.stopPropagation()
    isDragging.current = true
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    dragStartOffset.current = { ...dragOffset }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDragging.current) return
      const zoom = getViewport().zoom
      const deltaX = (moveEvent.clientX - dragStartPos.current.x) / zoom * 2
      const deltaY = (moveEvent.clientY - dragStartPos.current.y) / zoom * 2
      setDragOffset({
        x: dragStartOffset.current.x + deltaX,
        y: dragStartOffset.current.y + deltaY,
      })
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      isDragging.current = false
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      const zoom = getViewport().zoom
      const finalDeltaX = (upEvent.clientX - dragStartPos.current.x) / zoom * 2
      const finalDeltaY = (upEvent.clientY - dragStartPos.current.y) / zoom * 2
      const finalControlX = (savedControlX !== undefined ? savedControlX : (midX + nx * totalOffset)) + dragStartOffset.current.x + finalDeltaX
      const finalControlY = (savedControlY !== undefined ? savedControlY : (midY + ny * totalOffset)) + dragStartOffset.current.y + finalDeltaY
      setDragOffset({ x: 0, y: 0 })
      if ((Math.abs(finalDeltaX) > 1 || Math.abs(finalDeltaY) > 1) && typeof data?.onControlChange === 'function') {
        data.onControlChange(id, finalControlX, finalControlY)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const startAttachDrag = (end: 'source' | 'target', e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const nodeId = end === 'source' ? source : target
    const move = (moveEvent: PointerEvent) => {
      const node = getNode(nodeId)
      if (!node) return
      const point = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY })
      const side = nearestSide(node, point, getNode)
      const anchor = sideAnchor(node, side, getNode)
      setAttachDrag({ end, x: point.x, y: point.y, side, anchorX: anchor.x, anchorY: anchor.y })
    }
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const node = getNode(nodeId)
      if (node && typeof data?.onAttachmentChange === 'function') {
        const point = screenToFlowPosition({ x: upEvent.clientX, y: upEvent.clientY })
        data.onAttachmentChange(id, end, nearestSide(node, point, getNode))
      }
      setAttachDrag(null)
    }
    move(e.nativeEvent)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ghostFrom = attachDrag?.end === 'source'
    ? { x: attachDrag.x, y: attachDrag.y }
    : { x: sourceX, y: sourceY }
  const ghostTo = attachDrag?.end === 'target'
    ? { x: attachDrag.x, y: attachDrag.y }
    : { x: targetX, y: targetY }
  const ghostPath = attachDrag
    ? `M ${ghostFrom.x},${ghostFrom.y} Q ${(ghostFrom.x + ghostTo.x) / 2},${(ghostFrom.y + ghostTo.y) / 2} ${ghostTo.x},${ghostTo.y}`
    : ''

  const arrow = data?.showArrow ? (() => {
    const adx = targetX - controlX
    const ady = targetY - controlY
    const alen = Math.hypot(adx, ady) || 1
    const ux = adx / alen
    const uy = ady / alen
    const size = selected ? 26 : 20
    const tipX = targetX
    const tipY = targetY
    const baseX = tipX - ux * size
    const baseY = tipY - uy * size
    const wing = size * 0.62
    return {
      path: `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${tipX},${tipY}`,
      points: `${tipX},${tipY} ${baseX - uy * wing},${baseY + ux * wing} ${baseX + uy * wing},${baseY - ux * wing}`,
    }
  })() : null

  return (
    <>
      <g>
        <title>{tooltipLines.join('\n')}</title>
        <path d={edgePath} fill="none" stroke="transparent" strokeWidth={28} style={{ cursor: 'grab' }} onPointerDown={startDrag} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} />
        <BaseEdge path={arrow?.path || edgePath} style={{ ...activeStyle, pointerEvents: 'none' }} interactionWidth={0} id={id} />
        {arrow && (
          <polygon
            points={arrow.points}
            fill={strokeColor}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        {attachDrag && (
          <path
            d={ghostPath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={5}
            strokeOpacity={0.35}
            strokeDasharray="8,6"
            pointerEvents="none"
          />
        )}
      </g>
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, calc(-100% - 6px)) translate(${labelX}px,${labelY}px)`,
            background: selected ? strokeColor : 'white',
            color: selected ? 'white' : labelColor,
            padding: '1px 6px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 600,
            border: `1px solid ${strokeColor}`,
            pointerEvents: 'none',
            boxShadow: selected ? `0 0 0 3px ${strokeColor}55` : '0 1px 2px rgba(0,0,0,0.12)',
            whiteSpace: 'nowrap',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            zIndex: selected ? 20 : 1,
          }}
          className="nodrag nopan"
        >
          {caption}
        </div>
      </EdgeLabelRenderer>
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            width: 14,
            height: 14,
            background: 'white',
            border: `2px solid ${strokeColor}`,
            borderRadius: '50%',
            cursor: 'grab',
            pointerEvents: 'all',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            zIndex: 10,
          }}
          className="nodrag nopan"
          onPointerDown={startDrag}
        />
      </EdgeLabelRenderer>
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${sourceX}px, ${sourceY}px)`,
              width: 16,
              height: 16,
              background: '#2563eb',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'grab',
              pointerEvents: 'all',
              zIndex: 30,
            }}
            className="nodrag nopan"
            title="Drag this end"
            onPointerDown={(e) => startAttachDrag('source', e)}
          />
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY}px)`,
              width: 16,
              height: 16,
              background: '#2563eb',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'grab',
              pointerEvents: 'all',
              zIndex: 30,
            }}
            className="nodrag nopan"
            title="Drag this end"
            onPointerDown={(e) => startAttachDrag('target', e)}
          />
          {attachDrag && (
            <>
              <div
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${attachDrag.x}px, ${attachDrag.y}px)`,
                  width: 14,
                  height: 14,
                  background: strokeColor,
                  opacity: 0.45,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  zIndex: 25,
                }}
                className="nodrag nopan"
              />
              <div
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${attachDrag.anchorX}px, ${attachDrag.anchorY}px)`,
                  width: 22,
                  height: 22,
                  border: `3px solid ${strokeColor}`,
                  background: `${strokeColor}33`,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  zIndex: 25,
                }}
                className="nodrag nopan"
              />
            </>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  )
}
