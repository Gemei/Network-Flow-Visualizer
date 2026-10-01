import type { Edge, Node } from '@xyflow/react'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function sizeOf(node: Node) {
  const width = Number(node.measured?.width ?? node.width ?? node.style?.width) || 180
  const height = Number(node.measured?.height ?? node.height ?? node.style?.height) || 64
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

function cellId(id: string) {
  return `n-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

type Side = 'left' | 'right' | 'top' | 'bottom'

function sidePoint(side: string | null | undefined, fallback: Side): [string, string] {
  const chosen = side || fallback
  if (chosen === 'left') return ['0', '0.5']
  if (chosen === 'top') return ['0.5', '0']
  if (chosen === 'bottom') return ['0.5', '1']
  return ['1', '0.5']
}

function absoluteOrigin(node: Node, byId: Map<string, Node>) {
  let x = node.position?.x || 0
  let y = node.position?.y || 0
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position?.x || 0
    y += parent.position?.y || 0
    parentId = parent.parentId
  }
  return { x, y }
}

function anchor(node: Node, side: string, byId: Map<string, Node>) {
  const origin = absoluteOrigin(node, byId)
  const { width, height } = sizeOf(node)
  if (side === 'left') return { x: origin.x, y: origin.y + height / 2 }
  if (side === 'top') return { x: origin.x + width / 2, y: origin.y }
  if (side === 'bottom') return { x: origin.x + width / 2, y: origin.y + height }
  return { x: origin.x + width, y: origin.y + height / 2 }
}

function curvePoints(edge: Edge, byId: Map<string, Node>) {
  const source = byId.get(edge.source || '')
  const target = byId.get(edge.target || '')
  if (!source || !target) return []
  const data = (edge.data || {}) as Record<string, unknown>
  const sourceSide = edge.sourceHandle || 'right'
  const targetSide = edge.targetHandle || 'left'
  const start = anchor(source, sourceSide, byId)
  const end = anchor(target, targetSide, byId)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  let nx = -dy / len
  let ny = dx / len
  if (sourceSide === 'left' && targetSide === 'left') { nx = -1; ny = 0 }
  else if (sourceSide === 'right' && targetSide === 'right') { nx = 1; ny = 0 }
  else if (sourceSide === 'top' && targetSide === 'top') { nx = 0; ny = -1 }
  else if (sourceSide === 'bottom' && targetSide === 'bottom') { nx = 0; ny = 1 }
  const edgeIndex = Number(data.edgeIndex) || 0
  const edgeTotal = Number(data.edgeTotalBetweenPair) || 1
  const fan = edgeTotal > 1 ? (edgeIndex - (edgeTotal - 1) / 2) * 90 : 0
  const bend = 20 + fan
  const control = {
    x: typeof data.controlX === 'number' ? data.controlX : (start.x + end.x) / 2 + nx * bend,
    y: typeof data.controlY === 'number' ? data.controlY : (start.y + end.y) / 2 + ny * bend,
  }
  return [0.25, 0.5, 0.75].map(t => {
    const u = 1 - t
    return {
      x: Math.round(u * u * start.x + 2 * u * t * control.x + t * t * end.x),
      y: Math.round(u * u * start.y + 2 * u * t * control.y + t * t * end.y),
    }
  })
}

function nodeValue(node: Node) {
  const data = (node.data || {}) as Record<string, unknown>
  const label = String(data.label || data.name || node.id)
  if (node.type === 'ZoneNode') return escapeXml(label.toUpperCase())
  const ip = typeof data.ip === 'string' && data.ip ? data.ip : ''
  return escapeXml(ip ? `${label}\n${ip}` : label).replace(/\n/g, '&#10;')
}

function nodeStyle(node: Node) {
  const data = (node.data || {}) as Record<string, unknown>
  if (node.type === 'ZoneNode') {
    const fill = hexColor(data.color, '#F8FAFC')
    const stroke = hexColor(data.borderColor, '#94A3B8')
    return `rounded=1;absoluteArcSize=1;arcSize=12;whiteSpace=wrap;html=1;container=1;collapsible=0;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontStyle=1;fontSize=14;fontColor=${stroke};fillColor=${fill};strokeColor=${stroke};strokeWidth=2;`
  }
  if (node.type === 'NetworkNode') {
    const fill = hexColor(data.color, '#E2E8F0')
    return `rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;container=1;collapsible=0;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontStyle=1;fontSize=14;fontColor=#111827;fillColor=${fill};strokeColor=#9CA3AF;strokeWidth=1;`
  }
  const fill = hexColor(data.color, '#FFFFFF')
  return `rounded=1;whiteSpace=wrap;html=1;verticalAlign=middle;align=center;fillColor=${fill};strokeColor=#64748B;fontSize=11;`
}

function ruleNames(edge: Edge) {
  const data = (edge.data || {}) as Record<string, unknown>
  const rules = Array.isArray(data.flowRules) ? data.flowRules as { name?: string }[] : []
  return [...new Set(rules.map(rule => String(rule.name || '').trim()).filter(Boolean))]
}

function edgeValue(edge: Edge) {
  const data = (edge.data || {}) as Record<string, unknown>
  if (data.isAuto) return 'possible'
  const names = ruleNames(edge)
  const count = names.length || Number(data.ruleCount) || 1
  const action = data.action === 'BLOCK' ? 'deny' : 'allow'
  const caption = `${count} ${action}`
  const body = names.map(name => `&#10;${escapeXml(name)}`).join('')
  return `${caption}${body}`
}

function edgeStyle(edge: Edge) {
  const data = (edge.data || {}) as Record<string, unknown>
  const reverse = String(edge.source) > String(edge.target)
  let stroke = reverse ? '#15803d' : '#4ade80'
  if (data.isAuto) stroke = '#9ca3af'
  else if (data.action === 'BLOCK') stroke = reverse ? '#b91c1c' : '#fb7185'
  const dashed = data.action === 'BLOCK' || data.isAuto ? 'dashed=1;' : ''
  const arrow = data.showArrow === false ? 'none' : 'block'
  const [exitX, exitY] = sidePoint(edge.sourceHandle, 'right')
  const [entryX, entryY] = sidePoint(edge.targetHandle, 'left')
  return `curved=1;html=1;endArrow=${arrow};startArrow=none;strokeWidth=2;strokeColor=${stroke};${dashed}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;fontSize=11;labelBackgroundColor=#ffffff;labelBorderColor=#e5e7eb;`
}

export function buildDrawio(nodes: Node[], edges: Edge[], name: string) {
  const byParent = new Map<string, Node[]>()
  nodes.forEach(node => {
    const parent = node.parentId && nodes.some(item => item.id === node.parentId) ? node.parentId : ''
    const list = byParent.get(parent) || []
    list.push(node)
    byParent.set(parent, list)
  })
  const ordered: Node[] = []
  const walk = (parentId: string) => {
    for (const node of byParent.get(parentId) || []) {
      ordered.push(node)
      walk(node.id)
    }
  }
  walk('')

  const cells = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
  ]
  ordered.forEach(node => {
    const { width, height } = sizeOf(node)
    const parent = node.parentId && nodes.some(item => item.id === node.parentId) ? cellId(node.parentId) : '1'
    const x = Math.round(node.position?.x || 0)
    const y = Math.round(node.position?.y || 0)
    cells.push(
      `<mxCell id="${cellId(node.id)}" value="${nodeValue(node)}" style="${nodeStyle(node)}" vertex="1" parent="${parent}">` +
      `<mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>` +
      '</mxCell>',
    )
  })
  const byId = new Map(nodes.map(node => [node.id, node]))
  edges.forEach(edge => {
    if (!edge.source || !edge.target || !byId.has(edge.source) || !byId.has(edge.target)) return
    const points = curvePoints(edge, byId)
      .map(point => `<mxPoint x="${point.x}" y="${point.y}"/>`)
      .join('')
    const geometry = points
      ? `<mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry>`
      : '<mxGeometry relative="1" as="geometry"/>'
    cells.push(
      `<mxCell id="${cellId(edge.id)}" value="${edgeValue(edge)}" style="${edgeStyle(edge)}" edge="1" parent="1" source="${cellId(edge.source)}" target="${cellId(edge.target)}">` +
      geometry +
      '</mxCell>',
    )
  })

  const safeName = escapeXml(name || 'Graph')
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Network Flow Visualizer" version="1.0">
  <diagram id="network-flow" name="${safeName}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`
}

export function downloadDrawio(nodes: Node[], edges: Edge[], name: string) {
  const xml = buildDrawio(nodes, edges, name)
  const blob = new Blob([xml], { type: 'application/vnd.jgraph.mxfile' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const fileName = `${(name || 'graph').replace(/[^\w.-]+/g, '-')}.drawio`
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}
