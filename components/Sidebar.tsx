import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { classifyTraffic } from '@/lib/paloalto-import'

function ipv4ToInt(ip: string): number | null {
  const match = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  if (parts.some(part => part > 255)) return null
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0)
}

function parseBlock(token: string): { base: number; bits: number } | null {
  const [addr, bitsRaw] = token.trim().split('/')
  const base = ipv4ToInt(addr)
  if (base === null) return null
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return { base: (base & mask) >>> 0, bits }
}

function blocksOverlap(a: { base: number; bits: number }, b: { base: number; bits: number }): boolean {
  const bits = Math.min(a.bits, b.bits)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (a.base & mask) === (b.base & mask)
}

function ConflictTip({ text, tone = 'red' }: { text: string; tone?: 'red' | 'amber' }) {
  const anchor = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)

  const place = () => {
    const node = anchor.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 16)
    let left = rect.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    const roomBelow = window.innerHeight - rect.bottom
    if (roomBelow < 96 && rect.top > roomBelow) {
      setBox({ bottom: window.innerHeight - rect.top + 6, left, width })
    } else {
      setBox({ top: rect.bottom + 6, left, width })
    }
  }

  return (
    <div
      ref={anchor}
      className="relative inline-flex"
      onMouseEnter={place}
      onMouseLeave={() => setBox(null)}
    >
      <AlertCircle className={`w-3.5 h-3.5 cursor-help ${tone === 'amber' ? 'text-amber-500' : 'text-red-500'}`} />
      {box && createPortal(
        <div
          className="fixed bg-gray-800 text-white text-xs rounded px-2 py-1 font-normal shadow-lg whitespace-normal pointer-events-none"
          style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width, zIndex: 10000 }}
        >
          {text}
        </div>,
        document.body,
      )}
    </div>
  )
}

function tokenHits(token: string, name: string, cidr: string | null | undefined): boolean {
  const needle = token.trim().toLowerCase()
  if (!needle) return false
  if (name.trim().toLowerCase() === needle) return true
  if (cidr && cidr.trim().toLowerCase() === needle) return true
  const wanted = parseBlock(token)
  const have = cidr ? parseBlock(cidr) : parseBlock(name)
  if (wanted && have) return blocksOverlap(wanted, have)
  return false
}

export function Sidebar({
  topologyData,
  hiddenNodes,
  setHiddenNodes,
  showAutoFlow,
  setShowAutoFlow,
  activeRules,
  setActiveRules,
  onAddGlobal,
  onSelectItem,
  hiddenRules = {},
  setHiddenRules,
  ruleConflicts = {},
  onImported,
  showAllow = true,
  setShowAllow,
  showDeny = true,
  setShowDeny,
  chipLines = false,
  setChipLines,
  onResetLayout,
  chartId,
}: any) {
  const toggleRuleVisibility = (ruleId: string, e: any) => {
    e.stopPropagation()
    if (setHiddenRules) {
      setHiddenRules((prev: any) => ({
        ...prev,
        [ruleId]: !prev[ruleId]
      }))
    }
  }
  const toggleVisibility = (id: string) => {
    setHiddenNodes((prev: any) => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const toggleRule = (ruleId: string) => {
    setActiveRules((prev: any) => 
      prev.map((r: any) => r.id === ruleId ? { ...r, active: !r.active } : r)
    )
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({})
  const [addressList, setAddressList] = useState('')
  const [selectNote, setSelectNote] = useState('')

  const applyAddressList = (only: boolean) => {
    const tokens = addressList.split(/[\s,;]+/).map(token => token.trim()).filter(Boolean)
    if (tokens.length === 0) {
      setSelectNote('Enter one IP or subnet per line.')
      return
    }
    const next: Record<string, boolean> = { ...hiddenNodes }
    if (only) {
      for (const zone of topologyData?.zones || []) {
        for (const net of zone.networks || []) {
          next[net.id] = true
          for (const client of net.clients || []) next[client.id] = true
        }
      }
    }
    const opened: Record<string, boolean> = {}
    let matched = 0
    for (const zone of topologyData?.zones || []) {
      for (const net of zone.networks || []) {
        if (net.name === 'Hosts') {
          for (const client of net.clients || []) {
            if (!tokens.some(token => tokenHits(token, client.ip || client.name, client.ip))) continue
            next[client.id] = false
            next[net.id] = false
            next[zone.id] = false
            next[`section-hosts-${zone.id}`] = false
            opened[zone.id] = true
            matched++
          }
        } else if (tokens.some(token => tokenHits(token, net.name, net.cidr))) {
          next[net.id] = false
          next[zone.id] = false
          next[`section-networks-${zone.id}`] = false
          opened[zone.id] = true
          matched++
          for (const hostNet of zone.networks || []) {
            if (hostNet.name !== 'Hosts') continue
            for (const client of hostNet.clients || []) {
              const inside = tokenHits(net.cidr || net.name, client.ip || '', client.ip)
              const direct = tokens.some(token => tokenHits(token, client.ip || client.name, client.ip))
              if (!direct && !inside) continue
              next[client.id] = false
              next[hostNet.id] = false
              next[`section-hosts-${zone.id}`] = false
              matched++
            }
          }
        }
      }
    }
    setHiddenNodes(next)
    setOpenZones(prev => ({ ...prev, ...opened }))
    setSelectNote(matched ? `${only ? 'Showing' : 'Checked'} ${matched} matching item${matched === 1 ? '' : 's'}.` : 'No hosts or networks matched that list.')
  }
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const importRulebase = async (file: File) => {
    setImporting(true)
    setImportError('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('replace', 'true')
      if (chartId) body.append('chartId', chartId)
      const res = await fetch('/api/import/paloalto', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      if (onImported) await onImported()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    const savedSort = localStorage.getItem('firewallSortOrder')
    if (savedSort === 'asc' || savedSort === 'desc') {
      setSortOrder(savedSort)
    }
  }, [])

  const toggleSortOrder = () => {
    setSortOrder(prev => {
      const newSort = prev === 'asc' ? 'desc' : 'asc'
      localStorage.setItem('firewallSortOrder', newSort)
      return newSort
    })
  }

  const sortedRules = useMemo(() => {
    return [...activeRules].sort((a: any, b: any) => {
      const pA = a.priority ?? 100;
      const pB = b.priority ?? 100;
      return sortOrder === 'asc' ? pA - pB : pB - pA;
    });
  }, [activeRules, sortOrder])

  const filteredZones = useMemo(() => {
    if (!searchQuery) return topologyData.zones;
    const q = searchQuery.toLowerCase();

    return topologyData.zones?.map((zone: any) => {
      const matchesZone = zone.name.toLowerCase().includes(q);
      
      const filteredNetworks = zone.networks.map((net: any) => {
        const matchesNet = net.name.toLowerCase().includes(q);
        const filteredClients = net.clients.filter((c: any) => 
          c.name.toLowerCase().includes(q) || (c.ip && c.ip.toLowerCase().includes(q))
        );
        
        if (matchesZone || matchesNet || filteredClients.length > 0) {
          return {
            ...net,
            clients: filteredClients.length > 0 ? filteredClients : net.clients
          };
        }
        return null;
      }).filter(Boolean);

      if (matchesZone || filteredNetworks.length > 0) {
        return {
          ...zone,
          networks: filteredNetworks.length > 0 ? filteredNetworks : zone.networks
        };
      }
      return null;
    }).filter(Boolean);
  }, [topologyData.zones, searchQuery]);

  return (
    <div className="w-80 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto flex flex-col transition-colors">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Network Flow Visualizer</h2>
        </div>
        <ThemeToggle />
      </div>

      <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importRulebase(file)
          }}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="w-full text-sm font-medium px-3 py-2 rounded-md bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-60"
        >
          {importing ? 'Importing rulebase…' : 'Import Palo Alto CSV'}
        </button>
        {importError && <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>}
        <label className="flex items-center gap-2 cursor-pointer bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition">
          <input 
            type="checkbox" 
            checked={showAutoFlow} 
            onChange={(e) => setShowAutoFlow(e.target.checked)} 
            className="w-4 h-4 text-blue-600 rounded"
          />
          <span className="font-medium text-sm text-blue-900 dark:text-blue-300">Show Open Paths (Auto-Flow)</span>
        </label>
      </div>

      <div className="flex-1 p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm tracking-wider uppercase">Topology Filter</h3>
        
        <textarea
          value={addressList}
          onChange={(e) => setAddressList(e.target.value)}
          placeholder={'172.20.3.10\n172.30.0.0/24'}
          rows={4}
          className="w-full text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-2 border border-gray-300 dark:border-gray-700 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => applyAddressList(false)}
            className="flex-1 text-sm font-medium px-2 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100"
          >
            Check matches
          </button>
          <button
            type="button"
            onClick={() => applyAddressList(true)}
            className="flex-1 text-sm font-medium px-2 py-2 rounded-md bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
          >
            Show only these
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const next: Record<string, boolean> = { ...hiddenNodes }
            for (const zone of topologyData?.zones || []) {
              for (const net of zone.networks || []) {
                next[net.id] = true
                next[`section-networks-${zone.id}`] = true
                next[`section-hosts-${zone.id}`] = true
                for (const client of net.clients || []) next[client.id] = true
              }
            }
            setHiddenNodes(next)
            setSelectNote('Cleared networks and hosts. Zones stay on the map.')
          }}
          className="w-full text-xs font-medium px-3 py-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Clear addresses
        </button>
        {selectNote && <p className="text-[11px] text-gray-500 dark:text-gray-400">{selectNote}</p>}

        <input 
          type="text" 
          placeholder="Search nodes, IPs..." 
          className="w-full text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-2 mb-4 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {filteredZones?.map((zone: any) => (
          <div key={zone.id} className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800 dark:text-gray-200">
              <input 
                type="checkbox" 
                checked={!hiddenNodes[zone.id]} 
                onChange={() => toggleVisibility(zone.id)}
                className="w-4 h-4"
              />
              <span 
                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                onClick={(e) => { e.preventDefault(); onSelectItem?.({ id: zone.id, type: 'ZoneNode', data: { label: zone.name, color: zone.color, borderColor: zone.borderColor, description: zone.description } }) }}
              >
                {zone.name}
              </span>
            </label>
            {zone.networks?.length > 0 && (
              <button
                type="button"
                className="ml-6 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-blue-600"
                onClick={() => setOpenZones(prev => ({ ...prev, [zone.id]: !prev[zone.id] }))}
              >
                {openZones[zone.id] || searchQuery ? 'Hide addresses' : `${zone.networks.reduce((sum: number, net: any) => sum + (net.name === 'Hosts' ? (net.clients?.length || 0) : 1), 0)} addresses`}
              </button>
            )}

            {!hiddenNodes[zone.id] && (openZones[zone.id] || searchQuery) && (
              <div className="ml-6 mt-1 flex flex-col gap-2">
                {(() => {
                  const networks = zone.networks.filter((net: any) => net.name !== 'Hosts')
                  const hosts = zone.networks.flatMap((net: any) => net.name === 'Hosts' ? (net.clients || []) : [])
                  return (
                    <>
                      {networks.length > 0 && (
                        <div>
                          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                            <input
                              type="checkbox"
                              checked={networks.some((net: any) => !hiddenNodes[net.id])}
                              onChange={() => {
                                const hide = !hiddenNodes[`section-networks-${zone.id}`]
                                setHiddenNodes((prev: any) => {
                                  const next = { ...prev, [`section-networks-${zone.id}`]: hide }
                                  networks.forEach((net: any) => { next[net.id] = hide })
                                  return next
                                })
                              }}
                              className="w-3.5 h-3.5"
                            />
                            Networks
                          </label>
                          <div className="ml-4">
                          {networks.map((net: any) => (
                            <label key={net.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 py-0.5">
                              <input
                                type="checkbox"
                                checked={!hiddenNodes[net.id]}
                                onChange={() => {
                                  const hide = !hiddenNodes[net.id]
                                  setHiddenNodes((prev: any) => ({
                                    ...prev,
                                    [net.id]: hide,
                                    ...(hide ? {} : { [zone.id]: false, [`section-networks-${zone.id}`]: false }),
                                  }))
                                }}
                                className="w-3.5 h-3.5"
                              />
                              <span
                                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                onClick={(e) => { e.preventDefault(); onSelectItem?.({ id: net.id, type: 'NetworkNode', data: { label: net.name, cidr: net.cidr, color: net.color, description: net.description, clientIsolation: net.clientIsolation } }) }}
                              >
                                {net.cidr ? `${net.name}` : net.name}
                              </span>
                            </label>
                          ))}
                          </div>
                        </div>
                      )}
                      {hosts.length > 0 && (
                        <div>
                          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                            <input
                              type="checkbox"
                              checked={hosts.some((client: any) => !hiddenNodes[client.id])}
                              onChange={() => {
                                const hide = !hiddenNodes[`section-hosts-${zone.id}`]
                                setHiddenNodes((prev: any) => {
                                  const next = { ...prev, [`section-hosts-${zone.id}`]: hide }
                                  hosts.forEach((client: any) => { next[client.id] = hide })
                                  return next
                                })
                              }}
                              className="w-3.5 h-3.5"
                            />
                            Hosts
                          </label>
                          <div className="ml-4">
                          {hosts.map((client: any) => (
                            <label key={client.id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 dark:text-gray-300 py-0.5">
                              <input
                                type="checkbox"
                                checked={!hiddenNodes[client.id]}
                                onChange={() => {
                                  const hide = !hiddenNodes[client.id]
                                  setHiddenNodes((prev: any) => ({
                                    ...prev,
                                    [client.id]: hide,
                                    ...(hide ? {} : {
                                      [zone.id]: false,
                                      [client.networkId]: false,
                                      [`section-hosts-${zone.id}`]: false,
                                    }),
                                  }))
                                }}
                                className="w-3 h-3"
                              />
                              <span
                                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                onClick={(e) => { e.preventDefault(); onSelectItem?.({ id: client.id, type: 'ClientNode', data: { label: client.name, ip: client.ip, color: client.color, description: client.description } }) }}
                              >
                                {client.ip || client.name}
                              </span>
                            </label>
                          ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        ))}

        <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm tracking-wider uppercase mb-0">Rules Simulation</h3>
            <button 
              onClick={toggleSortOrder}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition flex items-center gap-1 font-medium bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded"
              title={sortOrder === 'asc' ? "Lowest Priority First" : "Highest Priority First"}
            >
              {sortOrder === 'asc' ? '↓ Pri' : '↑ Pri'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {sortedRules.map((r: any) => {
              const conflict = ruleConflicts[r.id];
              const isFullyShadowed = conflict?.isFullyShadowed;
              const isPartiallyShadowed = conflict?.shadowedPorts?.length > 0 && !isFullyShadowed;

              return (
              <div key={r.id} className={`p-2 rounded-md text-sm border ${
                  isFullyShadowed 
                    ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 opacity-60' 
                    : r.action === 'BLOCK' 
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30' 
                      : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30'
                } flex items-start flex-col cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => onSelectItem?.({ id: r.id, type: 'RuleEdge', data: r })}
              >
                <div className="flex items-center justify-between w-full">
                   <div className="flex items-center gap-2">
                     <button 
                       onClick={(e) => toggleRuleVisibility(r.id, e)}
                       className="text-gray-400 hover:text-gray-700 transition-colors"
                       title={hiddenRules[r.id] ? "Show rule purely visually in graph" : "Hide rule purely visually from graph"}
                     >
                       {hiddenRules[r.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                     </button>
                     <span className={`font-medium text-gray-900 dark:text-gray-100 ${hiddenRules[r.id] ? 'opacity-50' : ''} flex items-center gap-1`}>
                       {r.description || r.action}
                       {isFullyShadowed && (
                         <ConflictTip text={`Shadowed by ${conflict.shadowingRuleNames.join(', ')}`} />
                       )}
                     </span>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="sr-only peer" checked={r.active} onChange={() => toggleRule(r.id)} />
                    <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-col gap-0.5">
                  {(() => {
                    const traffic = classifyTraffic(r.ports || '')
                    const line = (label: string, items: string[]) => (
                      <span key={label}>{label}: {items.length ? items.join(', ') : 'any'}</span>
                    )
                    return (
                      <>
                        <span className="flex items-center gap-1">
                          {line('Services', [...traffic.ports, ...traffic.services])}
                          {isPartiallyShadowed && (
                            <ConflictTip tone="amber" text={`${conflict.shadowingRuleNames.join(', ')} covers ${conflict.shadowedPorts.join(', ')}`} />
                          )}
                          <span>| Pri: {r.priority}</span>
                        </span>
                        {line('Applications', traffic.applications)}
                      </>
                    )
                  })()}
                </div>
              </div>
            )})}
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-4 pb-8">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm tracking-wider uppercase">Management</h3>
          <div className="flex gap-2">
            <button onClick={() => onAddGlobal('ZoneNode')} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm py-2 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 transition font-medium">
              + New Zone
            </button>
            <button onClick={() => onAddGlobal('RuleEdge')} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm py-2 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 transition font-medium">
              + New Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
