import { Node, Edge } from '@xyflow/react'
import dagre from 'dagre'
import { isNetworkInCidr } from './cidr-utils'

type TopologyData = {
  zones: any[]
  rules: any[]
}

export function generateGraph(data: TopologyData, hiddenNodes: Record<string, boolean>, hiddenRules: Record<string, boolean>, showAutoFlow: boolean, ruleConflicts: Record<string, any> = {}, storedPositions: Record<string, { x: number; y: number }> = {}, storedSizes: Record<string, { width: number; height: number }> = {}, chipLines = false) {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const { zones, rules } = data

  const ZONE_PADDING_X = 40
  const ZONE_PADDING_TOP = 50
  const ZONE_PADDING_BOTTOM = 20
  const NETWORK_GAP = 20
  const NETWORK_PADDING_X = 20
  const NETWORK_PADDING_TOP = 45
  const NETWORK_PADDING_BOTTOM = 10
  const CLIENT_WIDTH = 150
  const CLIENT_HEIGHT = 40
  const CLIENT_GAP = 10
  const MIN_NETWORK_WIDTH = 250
  const MIN_ZONE_WIDTH = 300
  const networkTotal = zones.reduce((sum: number, zone: any) => sum + (zone.networks?.length || 0), 0)
  const zoneOverview = networkTotal > 8

  // Create Nodes with dynamic sizing
  zones.forEach((zone: any) => {
    if (hiddenNodes[zone.id]) return

    const networksSectionId = `section-networks-${zone.id}`
    const hostsSectionId = `section-hosts-${zone.id}`
    const subnetNetworks = (zone.networks || []).filter((network: any) => network.name !== 'Hosts' && !hiddenNodes[network.id])
    const visibleHosts = (zone.networks || [])
      .filter((network: any) => network.name === 'Hosts')
      .flatMap((network: any) => (network.clients || []).filter((client: any) => !hiddenNodes[client.id]))

    if (zoneOverview && subnetNetworks.length === 0 && visibleHosts.length === 0) {
      const addressCount = (zone.networks || []).reduce(
        (sum: number, network: any) => sum + (network.name === 'Hosts' ? (network.clients?.length || 0) : 1),
        0,
      )
      nodes.push({
        id: zone.id,
        type: 'ZoneNode',
        data: {
          label: zone.name,
          color: zone.color,
          borderColor: zone.borderColor,
          description: addressCount ? `${addressCount} addresses` : zone.description,
        },
        position: { x: 0, y: 0 },
        width: 180,
        height: 64,
        measured: { width: 180, height: 64 },
        style: { width: 180, height: 64 },
      })
      return
    }


    const gridFor = (count: number) => {
      if (count <= 0) return { cols: 1, rows: 0, width: 0, height: 0 }
      const cols = Math.min(count, count > 12 ? 6 : count > 6 ? 5 : 4)
      const rows = Math.ceil(count / cols)
      return {
        cols,
        rows,
        width: cols * CLIENT_WIDTH + (cols - 1) * CLIENT_GAP + NETWORK_PADDING_X * 2,
        height: 36 + rows * CLIENT_HEIGHT + (rows - 1) * CLIENT_GAP + 16,
      }
    }
    const subnetGrid = gridFor(subnetNetworks.length)
    const hostGrid = gridFor(visibleHosts.length)
    const subnetWidth = subnetGrid.width
    const subnetHeight = subnetGrid.height
    const hostsWidth = hostGrid.width
    const hostsHeight = hostGrid.height

    const contentWidth = Math.max(subnetWidth, hostsWidth, MIN_ZONE_WIDTH - ZONE_PADDING_X * 2)
    const sectionsHeight = (subnetHeight ? subnetHeight : 0) + (hostsHeight ? hostsHeight : 0) + (subnetHeight && hostsHeight ? NETWORK_GAP : 0)
    const computedWidth = contentWidth + ZONE_PADDING_X * 2
    const computedHeight = sectionsHeight
      ? ZONE_PADDING_TOP + sectionsHeight + ZONE_PADDING_BOTTOM
      : ZONE_PADDING_TOP + ZONE_PADDING_BOTTOM + 60

    const zoneWidth = computedWidth
    const zoneHeight = computedHeight

    nodes.push({
      id: zone.id,
      type: 'ZoneNode',
      data: { label: zone.name, color: zone.color, borderColor: zone.borderColor, description: zone.description },
      position: { x: 0, y: 0 },
      width: zoneWidth,
      height: zoneHeight,
      measured: { width: zoneWidth, height: zoneHeight },
      style: { width: zoneWidth, height: zoneHeight },
    })

    let sectionY = ZONE_PADDING_TOP
    if (subnetHeight) {
      nodes.push({
        id: networksSectionId,
        type: 'NetworkNode',
        data: { label: 'Networks', color: '#E2E8F0', description: 'Subnets and address objects' },
        position: { x: ZONE_PADDING_X / 2, y: sectionY },
        parentId: zone.id,
        extent: 'parent',
        width: contentWidth,
        height: subnetHeight,
        measured: { width: contentWidth, height: subnetHeight },
        style: { width: contentWidth, height: subnetHeight },
      })
      subnetNetworks.forEach((network: any, index: number) => {
        const col = index % subnetGrid.cols
        const row = Math.floor(index / subnetGrid.cols)
        nodes.push({
          id: network.id,
          type: 'ClientNode',
          data: {
            label: network.name,
            ip: network.cidr || '',
            color: network.color,
            description: network.description,
          },
          position: {
            x: NETWORK_PADDING_X + col * (CLIENT_WIDTH + CLIENT_GAP),
            y: 36 + row * (CLIENT_HEIGHT + CLIENT_GAP),
          },
          parentId: networksSectionId,
          extent: 'parent',
          width: CLIENT_WIDTH,
          height: CLIENT_HEIGHT,
          measured: { width: CLIENT_WIDTH, height: CLIENT_HEIGHT },
          style: { width: CLIENT_WIDTH, height: CLIENT_HEIGHT },
        })
      })
      sectionY += subnetHeight + NETWORK_GAP
    }

    if (hostsHeight) {
      nodes.push({
        id: hostsSectionId,
        type: 'NetworkNode',
        data: { label: 'Hosts', color: '#EDE9FE', description: 'Individual addresses' },
        position: { x: ZONE_PADDING_X / 2, y: sectionY },
        parentId: zone.id,
        extent: 'parent',
        width: contentWidth,
        height: hostsHeight,
        measured: { width: contentWidth, height: hostsHeight },
        style: { width: contentWidth, height: hostsHeight },
      })
      visibleHosts.forEach((client: any, index: number) => {
        const col = index % hostGrid.cols
        const row = Math.floor(index / hostGrid.cols)
        nodes.push({
          id: client.id,
          type: 'ClientNode',
          data: { label: client.name, ip: client.ip, color: client.color, description: client.description },
          position: {
            x: NETWORK_PADDING_X + col * (CLIENT_WIDTH + CLIENT_GAP),
            y: 36 + row * (CLIENT_HEIGHT + CLIENT_GAP),
          },
          parentId: hostsSectionId,
          extent: 'parent',
          width: CLIENT_WIDTH,
          height: CLIENT_HEIGHT,
          measured: { width: CLIENT_WIDTH, height: CLIENT_HEIGHT },
          style: { width: CLIENT_WIDTH, height: CLIENT_HEIGHT },
        })
      })
    }
  })

  // Entity Map for quick lookup and routing
  const entityMap = new Map()
  zones.forEach((z: any) => {
    entityMap.set(z.id, { ...z, type: 'zone' })
    z.networks.forEach((n: any) => {
      entityMap.set(n.id, { ...n, type: 'network', parent: z.id })
      n.clients.forEach((c: any) => {
        entityMap.set(c.id, { ...c, type: 'client', parent: n.id })
      })
    })
  })

  // Returns the ID of the highest visible parent
  const getVisibleEntityId = (id: string | null): string | null => {
    if (!id) return null
    let currentId: string = id
    while (hiddenNodes[currentId]) {
      const entity = entityMap.get(currentId)
      if (!entity || !entity.parent) return null
      currentId = entity.parent
    }
    // Return the node if it exists in the visible graph
    return nodes.some(n => n.id === currentId) ? currentId : null
  }

  const activeRules = rules.filter((r: any) => r.active)

  const getAnySources = (): string[] => {
    return [
      ...nodes.filter(n => n.type === 'ZoneNode').map(n => n.id),
      ...nodes.filter(n => n.type === 'NetworkNode').map(n => n.id)
    ]
  }

  const getAnyTargets = (srcId: string | null): string[] => {
    const targets: string[] = []
    const allZones = nodes.filter(n => n.type === 'ZoneNode')
    const allNetworks = nodes.filter(n => n.type === 'NetworkNode')
    
    if (!srcId) {
      targets.push(...allZones.map(z => z.id))
      targets.push(...allNetworks.map(n => n.id))
    } else {
      const srcEntity = entityMap.get(srcId)
      if (!srcEntity) return []
      
      const srcZoneId = srcEntity.type === 'zone' ? srcEntity.id : (srcEntity.type === 'network' ? srcEntity.parent : entityMap.get(srcEntity.parent)?.parent)
      const srcNetId = srcEntity.type === 'network' ? srcEntity.id : (srcEntity.type === 'client' ? srcEntity.parent : null)
      
      // Target all OTHER zones
      allZones.forEach(z => {
        if (z.id !== srcZoneId) targets.push(z.id)
      })
      
      // Target all OTHER networks in the SAME zone
      allNetworks.forEach(n => {
        if (n.parentId === srcZoneId && n.id !== srcNetId) {
          targets.push(n.id)
        }
      })
    }
    return targets
  }



  // Helper: get human-readable name for an entity
  const getEntityName = (id: string | null): string => {
    if (!id) return 'any'
    const entity = entityMap.get(id)
    if (!entity) return 'Unknown'
    return entity.name || entity.label || 'Unknown'
  }

  // Resolve sources for a rule considering CIDR restrictions
  const resolveTargetIds = (targets: any[], isSource: boolean): string[] => {
    if (!targets || targets.length === 0) {
      if (isSource) return getAnySources()
      return [] // We'll handle 'any' destination separately 
    }

    const resolvedIds = new Set<string>()

    targets.forEach(target => {
      const targetId = target.clientId || target.networkId || target.zoneId
      if (!targetId) return

      const entity = entityMap.get(targetId)
      if (!entity) return

      if (entity.type === 'zone') {
        const zoneId = getVisibleEntityId(targetId)
        if (zoneId) {
          if (target.cidr) {
            // Apply CIDR filter: only target networks within this zone that match the CIDR
            const visibleNetworksInZone = nodes.filter(n => n.type === 'NetworkNode' && n.parentId === targetId)
            let matchFound = false
            visibleNetworksInZone.forEach(net => {
              // Extract the full network object to get its actual CIDR
              const netEntity = entityMap.get(net.id)
              if (netEntity && netEntity.cidr) {
                if (isNetworkInCidr(netEntity.cidr, target.cidr)) {
                  resolvedIds.add(net.id)
                  matchFound = true
                }
              }
            })
            // If no networks matched the CIDR, or if there are no visible networks,
            // we probably still want to draw a line to the zone itself to indicate the rule exists,
            // or perhaps not. Let's draw it to the Zone if no specific networks matched so it's not invisible.
            if (!matchFound) {
               resolvedIds.add(zoneId)
            }
          } else {
            // No CIDR, target the entire zone
            resolvedIds.add(zoneId)
          }
        }
      } else {
        // Network or Client
        const vid = getVisibleEntityId(targetId)
        if (vid) resolvedIds.add(vid)
      }
    })

    return Array.from(resolvedIds)
  }

  const isRuleOverridden = (rule: any): boolean => {
    return ruleConflicts?.[rule.id]?.isFullyShadowed || false
  }

  // "any" matched against every zone and network explodes after a firewall import.
  // Keep that fan-out only for small hand-built topologies.
  const zoneIds = nodes.filter(n => n.type === 'ZoneNode').map(n => n.id)
  const drawAny = zoneIds.length > 0 && zoneIds.length <= 6

  // Explicit rules
  activeRules.forEach((rule: any) => {
    const overridden = isRuleOverridden(rule)
    
    // Fallbacks for backwards compatibility if they don't have sources/destinations array
    // Our seed and update migrated them, but just in case:
    const sources = rule.sources || []
    const destinations = rule.destinations || []

    const drawnIds = new Set(nodes.map(node => node.id))
    const toEndpoint = (id: string | null): string | null => {
      if (!id) return null
      if (chipLines && drawnIds.has(id)) return id
      let current: string | null = id
      while (current) {
        const entity = entityMap.get(current)
        if (!entity) return drawnIds.has(id) ? id : null
        if (chipLines && drawnIds.has(current) && entity.type !== 'zone') return current
        if (entity.type === 'zone') return hiddenNodes[entity.id] ? null : entity.id
        current = entity.parent || null
      }
      return null
    }

    const isZoneNode = (id: string) => nodes.some(node => node.id === id && node.type === 'ZoneNode')
    let sourceIds = sources.length === 0
      ? (drawAny && !zoneOverview ? zoneIds : [])
      : [...new Set(resolveTargetIds(sources, true).map(toEndpoint).filter(Boolean) as string[])]
    const baseDestIds = destinations.length === 0
      ? null
      : [...new Set(resolveTargetIds(destinations, false).map(toEndpoint).filter(Boolean) as string[])]
    const ruleUsesChip = chipLines && (
      sourceIds.some(id => !isZoneNode(id)) ||
      (baseDestIds?.some(id => !isZoneNode(id)) ?? false)
    )
    
    sourceIds.forEach(sourceId => {
      const destIds = baseDestIds ?? (drawAny && !zoneOverview ? zoneIds.filter(id => id !== sourceId) : [])

      destIds.forEach(destId => {
        if (ruleUsesChip && isZoneNode(sourceId) && isZoneNode(destId)) return
        if (sourceId && destId && sourceId !== destId) {
          if (!hiddenRules[rule.id]) {
            edges.push({
              id: `${rule.id}-${sourceId}-${destId}`,
              type: 'RuleEdge',
              source: sourceId,
              target: destId,
              data: {
                action: rule.action,
                ports: 'any',
                description: rule.description,
                priority: rule.priority,
                flowRules: [(() => {
                  const description = String(rule.description || '')
                  const [title, body = ''] = description.split(' — ')
                  const arrow = body.indexOf(' → ')
                  return {
                    name: title || description || 'Rule',
                    sources: arrow >= 0 ? body.slice(0, arrow) : (sources.map((s: any) => getEntityName(s.clientId || s.networkId || s.zoneId)).join(', ') || 'any'),
                    destinations: arrow >= 0 ? body.slice(arrow + 3) : (destinations.map((d: any) => getEntityName(d.clientId || d.networkId || d.zoneId)).join(', ') || 'any'),
                    ports: rule.ports || 'any',
                    action: rule.action,
                    priority: rule.priority,
                  }
                })()],
                isAuto: false,
                isOverridden: overridden,

                sourceName: sources.map((s:any) => getEntityName(s.clientId || s.networkId || s.zoneId)).join(', ') || 'any',
                destName: destinations.map((d:any) => getEntityName(d.clientId || d.networkId || d.zoneId)).join(', ') || 'any',
                // Keep these empty or array to not break PropertiesPanel
                sources,
                destinations
              },
              animated: false,
            })
          }
        }
      })
    })
  })

  // Client Isolation Logic
  const visibleNetworks2 = nodes.filter(n => n.type === 'NetworkNode')
  visibleNetworks2.forEach(netNode => {
    const network = zones.flatMap(z => z.networks).find(n => n.id === netNode.id)
    if (network && network.clientIsolation) {
      const visibleClients = nodes.filter(n => n.type === 'ClientNode' && n.parentId === network.id)
      for (let i = 0; i < visibleClients.length; i++) {
        for (let j = i + 1; j < visibleClients.length; j++) {
           edges.push({
             id: `isolation-${network.id}-${visibleClients[i].id}-${visibleClients[j].id}`,
             type: 'RuleEdge',
             source: visibleClients[i].id,
             target: visibleClients[j].id,
             data: {
               action: 'BLOCK',
               ports: 'Isolation',
               description: 'Client Isolation block',
               isAuto: false,
               isOverridden: false
             },
             animated: false,
           })
        }
      }
    }
  })

  // Auto-Flow Logic
  if (showAutoFlow && !zoneOverview) {
    const visibleEndpoints = nodes.filter(n => n.type === 'NetworkNode' || n.type === 'ClientNode')
    
    // Helper to get hierarchy for matching rules
    const getHierarchy = (node: any) => {
      if (node.type === 'NetworkNode') return { clientId: null, networkId: node.id, zoneId: node.parentId! };
      if (node.type === 'ClientNode') {
        const parentNet = nodes.find(n => n.id === node.parentId);
        return { clientId: node.id, networkId: node.parentId!, zoneId: parentNet?.parentId! };
      }
      return { clientId: null, networkId: null, zoneId: null };
    }

    for (let i = 0; i < visibleEndpoints.length; i++) {
        for (let j = i + 1; j < visibleEndpoints.length; j++) {
            const epA = visibleEndpoints[i]
            const epB = visibleEndpoints[j]

            const hA = getHierarchy(epA)
            const hB = getHierarchy(epB)

            // Skip if they are in the same network (handled by intra-network logic or doesn't make sense)
            if (hA.networkId === hB.networkId) continue

            const isBlocked = activeRules.some(rule => {
                if (rule.action !== 'BLOCK') return false
                
                const sources = rule.sources || []
                const destinations = rule.destinations || []
                
                const matchEntity = (h: any, targetArray: any[]) => {
                    if (targetArray.length === 0) return true; // ANY
                    return targetArray.some(t => {
                        if (t.clientId) return h.clientId === t.clientId;
                        if (t.networkId) return h.networkId === t.networkId;
                        if (t.zoneId) {
                            if (t.cidr && h.networkId) {
                                const netEntity = entityMap.get(h.networkId);
                                if (netEntity && netEntity.cidr) {
                                  // Use the imported isNetworkInCidr utility
                                  if (!isNetworkInCidr(netEntity.cidr, t.cidr)) {
                                      return false;
                                  }
                                }
                            }
                            return h.zoneId === t.zoneId;
                        }
                        return false;
                    });
                }

                const srcMatchesA = matchEntity(hA, sources)
                const dstMatchesB = matchEntity(hB, destinations)
                
                const srcMatchesB = matchEntity(hB, sources)
                const dstMatchesA = matchEntity(hA, destinations)

                const blocksAtoB = srcMatchesA && dstMatchesB
                const blocksBtoA = srcMatchesB && dstMatchesA
                
                return blocksAtoB || blocksBtoA
            })

            const hasExplicitEdge = edges.some(e => 
                (e.source === epA.id && e.target === epB.id) || 
                (e.source === epB.id && e.target === epA.id)
            )

            if (!isBlocked && !hasExplicitEdge) {
                edges.push({
                    id: `auto-${epA.id}-${epB.id}`,
                    type: 'RuleEdge',
                    source: epA.id,
                    target: epB.id,
                    data: {
                      action: 'ALLOW',
                      ports: 'auto/possible',
                      description: 'Auto Discovered Path',
                      isAuto: true
                    },
                    animated: false,
                })
            }
        }
    }

    // Intra-Network Client Auto-Flows
    visibleNetworks2.forEach(netNode => {
      const network = zones.flatMap(z => z.networks).find(n => n.id === netNode.id)
      if (network && !network.clientIsolation) {
        const visibleClients = nodes.filter(n => n.type === 'ClientNode' && n.parentId === network.id)
        for (let i = 0; i < visibleClients.length; i++) {
          for (let j = i + 1; j < visibleClients.length; j++) {
            const hasExplicitEdge = edges.some(e => 
              (e.source === visibleClients[i].id && e.target === visibleClients[j].id) || 
              (e.source === visibleClients[j].id && e.target === visibleClients[i].id)
            )
            
            if (!hasExplicitEdge) {
              edges.push({
                 id: `auto-intra-${network.id}-${visibleClients[i].id}-${visibleClients[j].id}`,
                 type: 'RuleEdge',
                 source: visibleClients[i].id,
                 target: visibleClients[j].id,
                 data: {
                   action: 'ALLOW',
                   ports: 'auto/possible',
                   description: 'Local Network Communication',
                   isAuto: true
                 },
                 animated: false,
              })
            }
          }
        }
      }
    })
  }

  // One stroke per zone pair and action. A busy pair otherwise stacks dozens of DOM edges.
  const collapsed: Edge[] = []
  const pairBuckets = new Map<string, Edge>()
  edges.forEach(edge => {
    if (edge.data?.isAuto || String(edge.id).startsWith('isolation')) {
      collapsed.push(edge)
      return
    }
    const key = `${edge.source}\0${edge.target}\0${edge.data?.action}`
    const existing = pairBuckets.get(key)
    if (!existing) {
      edge.data = { ...edge.data, ruleCount: 1, summary: true, ports: 'any' }
      pairBuckets.set(key, edge)
      collapsed.push(edge)
      return
    }
    const count = ((existing.data?.ruleCount as number) || 1) + 1
    const flowRules = [
      ...((existing.data?.flowRules as { name: string; ports: string; priority: number }[]) || []),
      ...((edge.data?.flowRules as { name: string; ports: string; priority: number }[]) || []),
    ]
    const mergeEnds = (current: any[] = [], extra: any[] = []) => {
      const seen = new Set(current.map(item => item.clientId || item.networkId || item.zoneId || item.id))
      const next = [...current]
      for (const item of extra) {
        const key = item.clientId || item.networkId || item.zoneId || item.id
        if (!key || seen.has(key)) continue
        seen.add(key)
        next.push(item)
      }
      return next
    }
    const descriptions = [...new Set(flowRules.map(rule => rule.name).filter(Boolean))]
    existing.data = {
      ...existing.data,
      ruleCount: count,
      flowRules,
      sources: mergeEnds(existing.data?.sources as any[], edge.data?.sources as any[]),
      destinations: mergeEnds(existing.data?.destinations as any[], edge.data?.destinations as any[]),
      sourceName: [...new Set([existing.data?.sourceName, edge.data?.sourceName].flatMap(value => String(value || '').split(', ')).filter(name => name && name !== 'any'))].join(', ') || 'any',
      destName: [...new Set([existing.data?.destName, edge.data?.destName].flatMap(value => String(value || '').split(', ')).filter(name => name && name !== 'any'))].join(', ') || 'any',
      ports: 'any',
      summary: true,
      description: descriptions.join('; '),
    }
  })
  edges.length = 0
  edges.push(...collapsed)
  if (edges.length > 25) {
    edges.forEach(edge => {
      edge.data = { ...edge.data, lite: true }
      edge.animated = false
    })
  }

  // Group edges by source+target pair to prevent overlap
  const edgePairCounts = new Map<string, number>()
  const edgePairIndices = new Map<string, number>()
  
  edges.forEach(edge => {
    // Normalize pair key so A→B and B→A are in the same group
    const pairKey = [edge.source, edge.target].sort().join('::')
    edgePairCounts.set(pairKey, (edgePairCounts.get(pairKey) || 0) + 1)
  })
  
  edges.forEach(edge => {
    const pairKey = [edge.source, edge.target].sort().join('::')
    const currentIndex = edgePairIndices.get(pairKey) || 0
    const total = edgePairCounts.get(pairKey) || 1
    
    edge.data = {
      ...edge.data,
      edgeIndex: currentIndex,
      edgeTotalBetweenPair: total,
    }
    
    edgePairIndices.set(pairKey, currentIndex + 1)
  })

  if (zoneOverview) {
    const visibleZones = nodes.filter(n => n.type === 'ZoneNode')
    const hasStoredPositions = visibleZones.some(node => storedPositions[node.id])
    if (!hasStoredPositions) {
      const count = Math.max(visibleZones.length, 1)
      const radius = Math.max(340, count * 48)
      visibleZones.forEach((node, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
        node.position = {
          x: radius + Math.cos(angle) * radius,
          y: radius + Math.sin(angle) * radius,
        }
      })
      return { nodes, edges }
    }
    let laidOut = nodes
    visibleZones.forEach(node => {
      const savedSize = storedSizes[node.id]
      if (savedSize) {
        laidOut = fitZoneContents(laidOut, node.id, savedSize.width, savedSize.height)
      }
    })
    laidOut = laidOut.map(node => {
      if (node.type === 'ZoneNode' && storedPositions[node.id]) {
        return { ...node, position: { ...storedPositions[node.id] } }
      }
      return node
    })
    return { nodes: laidOut, edges }
  }

  // Apply Dagre layout to top-level Zones
  const zoneNodes = nodes.filter(n => n.type === 'ZoneNode')
  const hasStoredPositions = Object.keys(storedPositions).length > 0

  // Check which zones need layout (new ones without stored positions)
  const zonesNeedingLayout = zoneNodes.filter(n => !storedPositions[n.id])
  
  if (zonesNeedingLayout.length > 0 && !hasStoredPositions) {
    // First time: use dagre for all zones
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 150, edgesep: 50, ranksep: 250 })
    g.setDefaultEdgeLabel(() => ({}))

    zoneNodes.forEach(node => {
      g.setNode(node.id, { width: node.style?.width as number || 500, height: node.style?.height as number || 200 })
    })

    const getZoneId = (id: string) => {
      let currentId: string = id
      while (true) {
        const entity = entityMap.get(currentId)
        if (!entity || !entity.parent) return currentId
        currentId = entity.parent
      }
    }

    edges.forEach(edge => {
      const sourceZone = getZoneId(edge.source)
      const targetZone = getZoneId(edge.target)
      if (sourceZone && targetZone && sourceZone !== targetZone) {
        if (g.hasNode(sourceZone) && g.hasNode(targetZone)) {
          g.setEdge(sourceZone, targetZone)
        }
      }
    })

    dagre.layout(g)

    nodes.forEach(node => {
      if (node.type === 'ZoneNode') {
        const nodeWithPos = g.node(node.id)
        if (nodeWithPos) {
          node.position = {
            x: nodeWithPos.x - nodeWithPos.width / 2,
            y: nodeWithPos.y - nodeWithPos.height / 2
          }
        }
      }
    })
  } else {
    // Subsequent times: use stored positions, place new zones at a reasonable position
    let maxX = 0
    let maxY = 0
    nodes.forEach(node => {
      if (node.type === 'ZoneNode') {
        if (storedPositions[node.id]) {
          node.position = { ...storedPositions[node.id] }
          maxX = Math.max(maxX, node.position.x + (node.style?.width as number || 500))
          maxY = Math.max(maxY, node.position.y)
        }
      }
    })
    // Place new zones that don't have stored positions
    let offsetY = maxY
    nodes.forEach(node => {
      if (node.type === 'ZoneNode' && !storedPositions[node.id]) {
        offsetY += 50
        node.position = { x: 0, y: offsetY }
        offsetY += (node.style?.height as number || 200)
      }
    })
  }

  separateZones(nodes)

  // Edge handles are computed dynamically in page.tsx via recomputeEdgeHandles()
  return { nodes, edges }
}

function sized(node: Node, width: number, height: number, position?: { x: number; y: number }): Node {
  return {
    ...node,
    position: position ?? node.position,
    width,
    height,
    measured: { width, height },
    style: { ...(node.style || {}), width, height },
  }
}

const CHIP_W = 150
const CHIP_H = 40
const CHIP_GAP = 8
const SECTION_HEADER = 36
const ZONE_PAD_X = 16
const ZONE_PAD_TOP = 36
const ZONE_PAD_BOTTOM = 12
const SECTION_GAP = 12

function chipSize(_chip: Node) {
  return { w: CHIP_W, h: CHIP_H }
}

function sectionLayout(chips: Node[], innerWidth: number) {
  const stepW = chips.length ? Math.max(...chips.map(chip => chipSize(chip).w)) : CHIP_W
  const stepH = chips.length ? Math.max(...chips.map(chip => chipSize(chip).h)) : CHIP_H
  const minInner = stepW + 16
  const width = Math.max(minInner, innerWidth)
  const cols = Math.max(1, Math.min(chips.length || 1, Math.floor((width - 16 + CHIP_GAP) / (stepW + CHIP_GAP))))
  const rows = chips.length ? Math.ceil(chips.length / cols) : 0
  const height = rows === 0 ? SECTION_HEADER + 12 : SECTION_HEADER + rows * stepH + Math.max(rows - 1, 0) * CHIP_GAP + 10
  return { stepW, stepH, cols, rows, width, height, minWidth: minInner, minHeight: height }
}

export function resizeFlowNode(nodes: Node[], id: string, width: number, height: number): Node[] {
  if (id.startsWith('section-networks-') || id.startsWith('section-hosts-')) {
    const zoneId = id.replace(/^section-(networks|hosts)-/, '')
    const zone = nodes.find(node => node.id === zoneId)
    const zoneWidth = width + ZONE_PAD_X * 2
    const zoneHeight = (zone?.height ?? (zone?.style?.height as number) ?? height)
    return fitZoneContents(nodes, zoneId, zoneWidth, zoneHeight)
  }
  if (!nodes.some(node => node.id === id && node.type === 'ZoneNode')) return nodes
  return fitZoneContents(nodes, id, width, height)
}

export function fitZoneContents(nodes: Node[], zoneId: string, zoneWidth: number, zoneHeight: number): Node[] {
  const sections = [`section-networks-${zoneId}`, `section-hosts-${zoneId}`]
    .map(id => nodes.find(node => node.id === id))
    .filter((node): node is Node => Boolean(node))
  const zone = nodes.find(node => node.id === zoneId)
  if (!zone) return nodes
  if (sections.length === 0) {
    return nodes.map(node => node.id === zoneId ? sized(node, Math.max(zoneWidth, 180), Math.max(zoneHeight, 64)) : node)
  }

  const minInner = Math.max(...sections.map(section => sectionLayout(nodes.filter(node => node.parentId === section.id), CHIP_W).minWidth))
  const innerW = Math.max(minInner, zoneWidth - ZONE_PAD_X * 2)
  const layouts = sections.map(section => sectionLayout(nodes.filter(node => node.parentId === section.id), innerW))
  const requiredW = ZONE_PAD_X * 2 + minInner
  const requiredH = ZONE_PAD_TOP + layouts.reduce((sum, layout) => sum + layout.height, 0) + SECTION_GAP * Math.max(sections.length - 1, 0) + ZONE_PAD_BOTTOM
  const finalW = Math.max(zoneWidth, requiredW)
  const finalH = Math.max(zoneHeight, requiredH)
  const updates = new Map<string, Node>()
  updates.set(zoneId, {
    ...sized(zone, finalW, finalH),
    data: { ...zone.data, minWidth: requiredW, minHeight: requiredH },
  })

  let y = ZONE_PAD_TOP
  sections.forEach((section, index) => {
    const layout = layouts[index]
    const chips = nodes.filter(node => node.parentId === section.id)
    updates.set(section.id, {
      ...sized(section, innerW, layout.height, { x: ZONE_PAD_X, y }),
      data: { ...section.data, minWidth: layout.minWidth, minHeight: layout.height },
    })
    chips.forEach((chip, chipIndex) => {
      const col = chipIndex % layout.cols
      const row = Math.floor(chipIndex / layout.cols)
      const size = chipSize(chip)
      updates.set(chip.id, {
        ...chip,
        position: {
          x: 8 + col * (layout.stepW + CHIP_GAP),
          y: SECTION_HEADER + row * (layout.stepH + CHIP_GAP),
        },
        width: size.w,
        height: size.h,
        measured: { width: size.w, height: size.h },
        style: { ...(chip.style || {}), width: size.w, height: size.h },
        data: { ...chip.data, minWidth: CHIP_W, minHeight: CHIP_H },
      })
    })
    y += layout.height + SECTION_GAP
  })
  return nodes.map(node => updates.get(node.id) ?? node)
}

function separateZones(nodes: Node[]) {
  const zones = nodes.filter(node => node.type === 'ZoneNode')
  const gap = 72
  const box = (node: Node) => ({
    x: node.position.x,
    y: node.position.y,
    w: (node.style?.width as number) || node.width || 180,
    h: (node.style?.height as number) || node.height || 64,
  })

  for (let pass = 0; pass < 16; pass++) {
    let moved = false
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = box(zones[i])
        const b = box(zones[j])
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        if (overlapX < overlapY) {
          const push = (overlapX + gap) / 2
          const dir = a.x <= b.x ? -1 : 1
          zones[i].position = { ...zones[i].position, x: zones[i].position.x + dir * push }
          zones[j].position = { ...zones[j].position, x: zones[j].position.x - dir * push }
        } else {
          const push = (overlapY + gap) / 2
          const dir = a.y <= b.y ? -1 : 1
          zones[i].position = { ...zones[i].position, y: zones[i].position.y + dir * push }
          zones[j].position = { ...zones[j].position, y: zones[j].position.y - dir * push }
        }
        moved = true
      }
    }
    if (!moved) break
  }
}
