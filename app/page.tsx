"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { ReactFlow, Controls, Background, ReactFlowProvider, useNodesState, useEdgesState, useUpdateNodeInternals, useReactFlow, ConnectionMode, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { ZoneNode } from '@/components/nodes/ZoneNode'
import { NetworkNode } from '@/components/nodes/NetworkNode'
import { ClientNode } from '@/components/nodes/ClientNode'
import { RuleEdge } from '@/components/edges/RuleEdge'
import { Sidebar } from '@/components/Sidebar'
import { PropertiesPanel } from '@/components/PropertiesPanel'
import { ChartTabs, Chart } from '@/components/ChartTabs'
import { DataTablePopup } from '@/components/DataTablePopup'
import { ExportPngDialog } from '@/components/ExportPngDialog'
import { GraphMenu } from '@/components/GraphMenu'
import { generateGraph, resizeFlowNode } from '@/lib/graph-logic'
import { detectRuleConflicts } from '@/lib/rule-conflicts'

const nodeTypes = {
  ZoneNode,
  NetworkNode,
  ClientNode,
}

const edgeTypes = {
  RuleEdge,
}

// Helper: compute absolute center of a node by walking up parent chain
function getAbsoluteCenter(nodeId: string, nodeMap: Map<string, Node>): { x: number; y: number } {
  const node = nodeMap.get(nodeId)
  if (!node) return { x: 0, y: 0 }
  
  const w = (node.width ?? (node.style?.width as number) ?? 200)
  const h = (node.height ?? (node.style?.height as number) ?? 60)
  
  let x = node.position.x + w / 2
  let y = node.position.y + h / 2
  
  let parentId = node.parentId
  while (parentId) {
    const parent = nodeMap.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  
  return { x, y }
}

function facingSide(from: { x: number; y: number }, to: { x: number; y: number }): 'left' | 'right' | 'top' | 'bottom' {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function recomputeEdgeHandles(edges: Edge[], nodes: Node[]): Edge[] {
  const nodeMap = new Map<string, Node>()
  nodes.forEach(n => nodeMap.set(n.id, n))

  return edges.map(edge => {
    const srcCenter = getAbsoluteCenter(edge.source, nodeMap)
    const tgtCenter = getAbsoluteCenter(edge.target, nodeMap)
    if (edge.data?.manualHandles && edge.sourceHandle && edge.targetHandle) return edge
    const sourceSide = facingSide(srcCenter, tgtCenter)
    const targetSide = facingSide(tgtCenter, srcCenter)
    return { ...edge, sourceHandle: sourceSide, targetHandle: targetSide }
  })
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <Home />
    </ReactFlowProvider>
  )
}

function Home() {
  const { fitView } = useReactFlow()
  const [topologyData, setTopologyData] = useState<any>(null)
  
  // Chart states
  const [charts, setCharts] = useState<Chart[]>([])
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const [chartsReady, setChartsReady] = useState(false)
  
  // View states (now bound to the active chart conceptually)
  const [hiddenNodes, setHiddenNodes] = useState<Record<string, boolean>>({})
  const [hiddenRules, setHiddenRules] = useState<Record<string, boolean>>({})
  const [showAutoFlow, setShowAutoFlow] = useState(false)
  const [showAllow, setShowAllow] = useState(true)
  const [showDeny, setShowDeny] = useState(true)
  const [chipLines, setChipLines] = useState(false)
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [isDataViewOpen, setIsDataViewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  
  const [activeRules, setActiveRules] = useState<any[]>([])
  const [selectedItem, setSelectedItem] = useState<any>(null)

  const ruleConflicts = useMemo(() => {
    if (!topologyData) return {}
    return detectRuleConflicts(activeRules, topologyData)
  }, [topologyData, activeRules])

  // Store node positions and sizes so layout doesn't jump
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const nodeSizesRef = useRef<Record<string, { width: number; height: number }>>({})
  const edgeHandlesRef = useRef<Record<string, { sourceHandle: string; targetHandle: string }>>({})
  const resetLayoutPending = useRef(false)
  // Store custom drag curves for edges
  const edgeControlsRef = useRef<Record<string, { x: number; y: number }>>({})

  const refreshTopology = async (chartId?: string) => {
    const id = chartId || activeChartId
    if (!id) return
    try {
      const res = await fetch(`/api/topology?chartId=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.zones && data.rules) {
        setTopologyData(data)
        setActiveRules(data.rules)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadCharts = async () => {
    try {
      const res = await fetch('/api/charts')
      const data = await res.json()
      
      if (data.length === 0) {
        // Create first default chart if none exist
        const defaultChart = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Chart 1' })
        }).then(r => r.json())
        setCharts([defaultChart])
        setActiveChartId(defaultChart.id)
      } else {
        setCharts(data)
        if (!activeChartId) {
          setActiveChartId(data[0].id)
          applyChartViewState(data[0])
        }
      }
      setChartsReady(true)
    } catch (e) {
      console.error(e)
      setChartsReady(true)
    }
  }

  useEffect(() => {
    loadCharts()
  }, [])

  useEffect(() => {
    if (!chartsReady || !activeChartId) return
    refreshTopology(activeChartId)
  }, [chartsReady, activeChartId])

  // Autosave view state when relevant local states change
  useEffect(() => {
    if (!activeChartId) return
    const timer = setTimeout(() => {
      saveActiveChartState()
    }, 1000)
    return () => clearTimeout(timer)
  }, [hiddenNodes, hiddenRules, showAutoFlow, showAllow, showDeny, chipLines, activeChartId])

  const applyChartViewState = (chart: Chart) => {
    if (!chart.viewState) {
      setHiddenNodes({})
      setShowAutoFlow(false)
      nodePositionsRef.current = {}
      nodeSizesRef.current = {}
      edgeControlsRef.current = {}
      edgeHandlesRef.current = {}
      return
    }
    try {
      const state = JSON.parse(chart.viewState)
      setHiddenNodes(state.hiddenNodes || {})
      setHiddenRules(state.hiddenRules || {})
      setShowAutoFlow(state.showAutoFlow || false)
      if (typeof state.showAllow === 'boolean') setShowAllow(state.showAllow)
      if (typeof state.showDeny === 'boolean') setShowDeny(state.showDeny)
      if (typeof state.chipLines === 'boolean') setChipLines(state.chipLines)
      nodePositionsRef.current = state.nodePositions || state.zonePositions || {}
      nodeSizesRef.current = state.nodeSizes || state.zoneSizes || {}
      edgeControlsRef.current = state.edgeControls || {}
      edgeHandlesRef.current = state.edgeHandles || {}
    } catch (e) {
      console.error('Failed to parse chart state', e)
    }
  }

  const saveActiveChartState = () => {
    if (!activeChartId) return
    const viewState = JSON.stringify({
      hiddenNodes,
      hiddenRules,
      showAutoFlow,
      nodePositions: nodePositionsRef.current,
      nodeSizes: nodeSizesRef.current,
      edgeControls: edgeControlsRef.current,
      edgeHandles: edgeHandlesRef.current,
      showAllow,
      showDeny,
      chipLines,
    })
    
    fetch(`/api/charts/${activeChartId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewState })
    })
    
    // update local state
    setCharts(prev => prev.map(c => c.id === activeChartId ? { ...c, viewState } : c))
  }

  const resetGraphLayout = () => {
    nodePositionsRef.current = {}
    nodeSizesRef.current = {}
    edgeControlsRef.current = {}
    edgeHandlesRef.current = {}
    resetLayoutPending.current = true
    setLayoutEpoch(epoch => epoch + 1)
    saveActiveChartState()
  }

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const updateNodeInternals = useUpdateNodeInternals()
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const zoneOf = (id: string) => {
      if (id.startsWith('section-networks-') || id.startsWith('section-hosts-')) {
        return id.replace(/^section-(networks|hosts)-/, '')
      }
      let current = nodes.find(node => node.id === id)
      while (current?.parentId) {
        const parent = nodes.find(node => node.id === current?.parentId)
        if (!parent) break
        if (parent.type === 'ZoneNode') return parent.id
        current = parent
      }
      return current?.type === 'ZoneNode' ? current.id : null
    }
    const active = new Set<string>()
    edges.forEach(edge => {
      if (!edge.selected) return
      const sourceZone = zoneOf(edge.source)
      const targetZone = zoneOf(edge.target)
      if (sourceZone) active.add(sourceZone)
      if (targetZone) active.add(targetZone)
    })
    setNodes(current => {
      let changed = false
      const next = current.map(node => {
        if (node.type !== 'ZoneNode') return node
        const showAttachments = active.has(node.id)
        if (!!node.data?.showAttachments === showAttachments) return node
        changed = true
        return { ...node, data: { ...node.data, showAttachments } }
      })
      return changed ? next : current
    })
  }, [edges, nodes, setNodes])

  // Generate graph when topology data changes
  useEffect(() => {
    if (!topologyData || !chartsReady) return
    const { nodes: initNodes, edges: initEdges } = generateGraph(
      { zones: topologyData.zones, rules: activeRules },
      hiddenNodes,
      hiddenRules,
      showAutoFlow,
      ruleConflicts,
      nodePositionsRef.current,
      nodeSizesRef.current,
      chipLines
    )
    // Save node positions (for zones) and sizes (for all) for next time
    initNodes.forEach(n => {
      if (n.type === 'ZoneNode') {
        nodePositionsRef.current[n.id] = { ...n.position }
      }
      if (n.style?.width && n.style?.height) {
        nodeSizesRef.current[n.id] = {
          width: n.style.width as number,
          height: n.style.height as number,
        }
      }
    })

    // Compute edge handles based on node positions
    const edgesWithHandles = recomputeEdgeHandles(initEdges, initNodes).map(edge => {
      const saved = edgeHandlesRef.current[edge.id]
      if (!saved) return edge
      return { ...edge, sourceHandle: saved.sourceHandle, targetHandle: saved.targetHandle, data: { ...edge.data, manualHandles: true } }
    })
    
    // Inject saved control curves and the update callback
    const edgesWithControls = edgesWithHandles.map(edge => {
      const savedControl = edgeControlsRef.current[edge.id]
      return {
        ...edge,
        data: {
          ...edge.data,
          controlX: savedControl?.x,
          controlY: savedControl?.y,
          onControlChange: handleEdgeControlChange,
          onAttachmentChange: handleAttachmentChange,
          showArrow: !chipLines,
        }
      }
    })
    
    const visibleEdges = edgesWithControls.filter(edge => {
      if (edge.data?.isAuto) return true
      if (edge.data?.action === 'BLOCK') return showDeny
      return showAllow
    })
    setNodes(initNodes)
    setEdges(visibleEdges)
    requestAnimationFrame(() => {
      initNodes.forEach(node => updateNodeInternals(node.id))
      if (resetLayoutPending.current) {
        resetLayoutPending.current = false
        fitView({ padding: 0.2, duration: 300 })
      }
    })
  }, [topologyData, chartsReady, hiddenNodes, hiddenRules, showAutoFlow, activeRules, showAllow, showDeny, chipLines, layoutEpoch, setNodes, setEdges, updateNodeInternals, fitView])

  const handleAttachmentChange = useCallback((id: string, end: 'source' | 'target', side: string) => {
    setEdges(currentEdges => currentEdges.map(edge => {
      if (edge.id !== id) return edge
      const sourceHandle = end === 'source' ? side : (edge.sourceHandle || 'right')
      const targetHandle = end === 'target' ? side : (edge.targetHandle || 'left')
      edgeHandlesRef.current[id] = { sourceHandle, targetHandle }
      return {
        ...edge,
        sourceHandle,
        targetHandle,
        data: { ...edge.data, manualHandles: true },
      }
    }))
    saveActiveChartState()
  }, [setEdges, activeChartId])

  // Handle manual edge dragging
  const handleEdgeControlChange = useCallback((id: string, x: number, y: number) => {
    edgeControlsRef.current[id] = { x, y }
    saveActiveChartState()
    setEdges(currentEdges => 
      currentEdges.map(e => 
        e.id === id 
          ? { ...e, data: { ...e.data, controlX: x, controlY: y } } 
          : e
      )
    )
  }, [setEdges, activeChartId])

  // Track drag and resize changes for zone nodes, recompute edge handles
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes.filter((change: any) => change.type !== 'dimensions' || change.resizing))
    const zoneResizes = changes.filter((change: any) => change.type === 'dimensions' && change.resizing && change.dimensions)
    if (zoneResizes.length > 0) {
      setNodes(current => {
        let next = current
        for (const change of zoneResizes) {
          next = resizeFlowNode(next, change.id, change.dimensions.width, change.dimensions.height)
          next.forEach(node => {
            if (node.type === 'ZoneNode' && node.width && node.height) {
              nodePositionsRef.current[node.id] = { ...node.position }
              nodeSizesRef.current[node.id] = { width: node.width, height: node.height }
            }
          })
        }
        return next
      })
    }
    
    let needsEdgeUpdate = false
    let autoSaveTrigger = false
    
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        const node = nodes.find(n => n.id === change.id)
        if (node?.type === 'ZoneNode') {
          nodePositionsRef.current[change.id] = { ...change.position }
          needsEdgeUpdate = true
          if (!change.dragging) autoSaveTrigger = true // drag ended
        }
      }
      if (change.type === 'dimensions' && change.dimensions && !change.resizing) {
        autoSaveTrigger = true
      }
    })
    
    // Recompute edge handles when zones are dragged
    if (needsEdgeUpdate) {
      setEdges(currentEdges => {
        // Build updated node positions by applying changes
        const updatedNodes = nodes.map(n => {
          const posChange = changes.find((c: any) => c.type === 'position' && c.id === n.id && c.position)
          if (posChange) {
            return { ...n, position: posChange.position }
          }
          return n
        })
        return recomputeEdgeHandles(currentEdges, updatedNodes).map(edge => {
          const saved = edgeHandlesRef.current[edge.id]
          if (!saved) return edge
          return { ...edge, sourceHandle: saved.sourceHandle, targetHandle: saved.targetHandle, data: { ...edge.data, manualHandles: true } }
        })
      })
    }

    if (autoSaveTrigger) {
      saveActiveChartState()
    }
  }, [onNodesChange, nodes, setEdges, activeChartId])

  const handleSaveProperties = async (id: string, type: string, formData: any) => {
    let endpoint = ''
    if (type === 'ZoneNode') endpoint = `/api/zones/${id}`
    else if (type === 'NetworkNode') endpoint = `/api/networks/${id}`
    else if (type === 'ClientNode') endpoint = `/api/clients/${id}`
    else if (type === 'RuleEdge') {
      if (formData.isAuto) return
      
      if (id === '__new_rule__') {
        await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, chartId: activeChartId })
        })
        setSelectedItem(null)
        await refreshTopology()
        return
      }
      
      const realRuleId = id.split('-')[0]
      endpoint = `/api/rules/${realRuleId}`
    }

    if (endpoint) {
      const saveData: any = { ...formData }
      if (saveData.label !== undefined) {
        saveData.name = saveData.label
        delete saveData.label
      }
      delete saveData.isAuto

      await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      })
      await refreshTopology()
    }
  }

  const handleDeleteProperties = async (id: string, type: string) => {
    let endpoint = ''
    if (type === 'ZoneNode') endpoint = `/api/zones/${id}`
    else if (type === 'NetworkNode') endpoint = `/api/networks/${id}`
    else if (type === 'ClientNode') endpoint = `/api/clients/${id}`
    else if (type === 'RuleEdge') {
      const realRuleId = id.split('-')[0]
      endpoint = `/api/rules/${realRuleId}`
    }

    if (endpoint) {
      await fetch(endpoint, { method: 'DELETE' })
      // Remove stored position/size for deleted nodes
      delete nodeSizesRef.current[id]
      if (type === 'ZoneNode') {
        delete nodePositionsRef.current[id]
      }
      setSelectedItem(null)
      await refreshTopology()
    }
  }

  const handleAddChild = async (parentId: string, childType: string) => {
    let endpoint = ''
    let body = {}
    if (childType === 'NetworkNode') {
      endpoint = `/api/networks`
      body = { name: 'New Network', zoneId: parentId }
    } else if (childType === 'ClientNode') {
      endpoint = `/api/clients`
      body = { name: 'New Client', networkId: parentId }
    }

    if (endpoint) {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      await refreshTopology()
    }
  }

  const handleAddGlobal = async (type: string) => {
    if (type === 'ZoneNode') {
      await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Zone', chartId: activeChartId })
      })
      await refreshTopology()
    } else if (type === 'RuleEdge') {
      setSelectedItem({
        id: '__new_rule__',
        type: 'RuleEdge',
        data: {
          action: 'ALLOW',
          ports: 'any',
          description: '',
          priority: 100,
          isAuto: false,
          sourceZoneId: null,
          sourceNetworkId: null,
          sourceClientId: null,
          destZoneId: null,
          destNetworkId: null,
          destClientId: null,
        }
      })
    }
  }

  const handleSwitchChart = (id: string) => {
    saveActiveChartState()
    setActiveChartId(id)
    const chart = charts.find(c => c.id === id)
    if (chart) applyChartViewState(chart)
  }

  const handleCreateChart = async () => {
    saveActiveChartState()
    const num = charts.length + 1
    const newChart = await fetch('/api/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Chart ${num}` })
    }).then(r => r.json())
    
    setCharts([...charts, newChart])
    setActiveChartId(newChart.id)
    applyChartViewState(newChart)
  }

  const handleDeleteChart = async (id: string) => {
    if (charts.length <= 1) return // Keep at least one chart
    
    await fetch(`/api/charts/${id}`, { method: 'DELETE' })
    const filtered = charts.filter(c => c.id !== id)
    setCharts(filtered)
    
    if (activeChartId === id) {
      setActiveChartId(filtered[0].id)
      applyChartViewState(filtered[0])
    }
  }

  const handleRenameChart = async (id: string, newName: string) => {
    await fetch(`/api/charts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })
    setCharts(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c))
  }

  // Handle sidebar clicks: build a proper selectedItem for PropertiesPanel
  const handleSidebarSelect = useCallback((item: any) => {
    if (item.type === 'RuleEdge') {
      // Rules already have full data from activeRules
      setSelectedItem(item)
    } else {
      // For topology items, find the matching node to get full data
      const node = nodes.find(n => n.id === item.id)
      if (node) {
        setSelectedItem(node)
      } else {
        setSelectedItem(item)
      }
    }
  }, [nodes])

  if (!topologyData) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400 dark:bg-gray-900">Loading Network Topology...</div>
  }

  return (
    <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950 transition-colors">
      <Sidebar 
        topologyData={topologyData}
        hiddenNodes={hiddenNodes}
        setHiddenNodes={setHiddenNodes}
        hiddenRules={hiddenRules}
        setHiddenRules={setHiddenRules}
        showAutoFlow={showAutoFlow}
        setShowAutoFlow={setShowAutoFlow}
        activeRules={activeRules}
        setActiveRules={setActiveRules}
        onAddGlobal={handleAddGlobal}
        onSelectItem={handleSidebarSelect}
        ruleConflicts={ruleConflicts}
        onImported={refreshTopology}
        showAllow={showAllow}
        setShowAllow={setShowAllow}
        showDeny={showDeny}
        setShowDeny={setShowDeny}
        chipLines={chipLines}
        setChipLines={setChipLines}
        onResetLayout={resetGraphLayout}
        chartId={activeChartId}
      />
      
      <div className="flex-1 h-full flex flex-col">
        <ChartTabs 
          charts={charts}
          activeChartId={activeChartId}
          onSwitchChart={handleSwitchChart}
          onCreateChart={handleCreateChart}
          onDeleteChart={handleDeleteChart}
          onRenameChart={handleRenameChart}
          onOpenDataView={() => setIsDataViewOpen(true)}
        />
        <div className="flex-1 relative">
            <ReactFlow 
              nodes={nodes} 
              edges={edges} 
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(e, node) => setSelectedItem(node)}
              onEdgeClick={(e, edge) => setSelectedItem(edge)}
              onPaneClick={() => setSelectedItem(null)}
              nodeTypes={nodeTypes} 
              edgeTypes={edgeTypes}
              fitView
              onlyRenderVisibleElements
              minZoom={0.1}
              maxZoom={1.5}
              nodesConnectable={false}
              connectionMode={ConnectionMode.Loose}
              edgesReconnectable={false}
              connectOnClick={false}
              proOptions={{ hideAttribution: true }}
              className="dark:bg-gray-950"
            >
              <Controls className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700" />
              <GraphMenu
                showAllow={showAllow}
                setShowAllow={setShowAllow}
                showDeny={showDeny}
                setShowDeny={setShowDeny}
                chipLines={chipLines}
                setChipLines={setChipLines}
                onResetLayout={resetGraphLayout}
                onExportPng={() => setExportOpen(true)}
              />
              <Background color="#ccc" gap={16} />
            </ReactFlow>
            
            <PropertiesPanel 
              selectedItem={selectedItem} 
              onClose={() => setSelectedItem(null)} 
              onSave={handleSaveProperties}
              onDelete={handleDeleteProperties}
              onAddChild={handleAddChild}
              topologyData={topologyData}
            />
        </div>
      </div>
      
      <ExportPngDialog
        open={exportOpen}
        chartName={charts.find(chart => chart.id === activeChartId)?.name || 'graph'}
        onClose={() => setExportOpen(false)}
      />
      {isDataViewOpen && (
        <DataTablePopup 
          topologyData={topologyData} 
          onClose={() => setIsDataViewOpen(false)} 
          ruleConflicts={ruleConflicts}
        />
      )}
    </div>
  )
}
