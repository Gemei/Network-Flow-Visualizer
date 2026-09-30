import { useState, useEffect, useMemo } from 'react'
import { classifyTraffic } from '@/lib/paloalto-import'

type EntityOption = {
  id: string
  label: string
  group: string // "Zone" | "Network" | "Client"
}

type RuleTarget = {
  id: string
  cidr?: string
}

function buildEntityOptions(topologyData: any): EntityOption[] {
  if (!topologyData?.zones) return []
  const options: EntityOption[] = []
  
  topologyData.zones.forEach((zone: any) => {
    options.push({ id: zone.id, label: zone.name, group: 'Zone' })
    zone.networks?.forEach((net: any) => {
      options.push({ id: net.id, label: `${zone.name} → ${net.name}`, group: 'Network' })
      net.clients?.forEach((client: any) => {
        options.push({ id: client.id, label: `${zone.name} → ${net.name} → ${client.name}`, group: 'Client' })
      })
    })
  })
  
  return options
}

function classifyEntity(id: string, topologyData: any): 'zone' | 'network' | 'client' | null {
  if (id === 'any') return null
  if (!topologyData?.zones) return null
  for (const zone of topologyData.zones) {
    if (zone.id === id) return 'zone'
    for (const net of zone.networks || []) {
      if (net.id === id) return 'network'
      for (const client of net.clients || []) {
        if (client.id === id) return 'client'
      }
    }
  }
  return null
}

export function PropertiesPanel({
  selectedItem,
  onClose,
  onSave,
  onDelete,
  onAddChild,
  topologyData
}: any) {
  const [formData, setFormData] = useState<any>({})
  // Use arrays of RuleTarget for multiple selections
  const [sources, setSources] = useState<RuleTarget[]>([])
  const [destinations, setDestinations] = useState<RuleTarget[]>([])

  const entityOptions = useMemo(() => buildEntityOptions(topologyData), [topologyData])

  useEffect(() => {
    if (selectedItem) {
      setFormData({ ...selectedItem.data })
      if (selectedItem.type === 'RuleEdge' && !selectedItem.data?.isAuto) {
        // Map existing Prisma relations to local state on select
        const ruleData = selectedItem.data;
        const srcList: RuleTarget[] = (ruleData.sources || []).map((s: any) => ({
          id: s.clientId || s.networkId || s.zoneId,
          cidr: s.cidr || ''
        })).filter((s:any) => s.id)
        
        const dstList: RuleTarget[] = (ruleData.destinations || []).map((d: any) => ({
          id: d.clientId || d.networkId || d.zoneId,
          cidr: d.cidr || ''
        })).filter((d:any) => d.id)

        setSources(srcList.length > 0 ? srcList : [{ id: 'any' }])
        setDestinations(dstList.length > 0 ? dstList : [{ id: 'any' }])
      }
    }
  }, [selectedItem])

  if (!selectedItem) return null

  const handleChange = (e: any) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value })
  }

  const handleSave = () => {
    if (isRule) {
      const saveData: any = { ...formData }
      
      // Clean old format backwards-compatibility keys just in case
      delete saveData.sourceZoneId; delete saveData.sourceNetworkId; delete saveData.sourceClientId;
      delete saveData.destZoneId; delete saveData.destNetworkId; delete saveData.destClientId;
      
      // Map back to Prisma nested format
      saveData.sources = sources.map(s => {
        const type = classifyEntity(s.id, topologyData)
        if (type === 'zone') return { zoneId: s.id, cidr: s.cidr || null }
        if (type === 'network') return { networkId: s.id }
        if (type === 'client') return { clientId: s.id }
        return null
      }).filter(Boolean)

      saveData.destinations = destinations.map(d => {
        if (d.id === 'any') return null // skip 'any'
        const type = classifyEntity(d.id, topologyData)
        if (type === 'zone') return { zoneId: d.id, cidr: d.cidr || null }
        if (type === 'network') return { networkId: d.id }
        if (type === 'client') return { clientId: d.id }
        return null
      }).filter(Boolean)

      onSave(selectedItem.id, selectedItem.type, saveData)
    } else {
      onSave(selectedItem.id, selectedItem.type, formData)
    }
  }

  const handleDelete = () => {
    onDelete(selectedItem.id, selectedItem.type)
  }

  const handleAddNetwork = () => onAddChild(selectedItem.id, 'NetworkNode')
  const handleAddClient = () => onAddChild(selectedItem.id, 'ClientNode')

  // derive what fields to show based on type
  const isZone = selectedItem.type === 'ZoneNode'
  const isNetwork = selectedItem.type === 'NetworkNode'
  const isClient = selectedItem.type === 'ClientNode'
  const isRule = selectedItem.type === 'RuleEdge'

  const selectClass = "w-full border border-gray-300 dark:border-gray-700 rounded-md p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
  const inputClass = "w-full border border-gray-300 dark:border-gray-700 rounded-md p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-50 p-4 shadow-xl flex flex-col transition-colors overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Properties</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
      </div>

      <div className="flex flex-col gap-4">
        {(!isRule) && (
          <div>
            <label className={labelClass}>Name / Label</label>
            <input 
              type="text" 
              name="label" 
              value={formData.label || ''} 
              onChange={handleChange} 
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Description</label>
          <textarea 
            name="description" 
            value={formData.description || ''} 
            onChange={handleChange} 
            className={`${inputClass} min-h-[80px]`}
          />
        </div>

        {isNetwork && (
          <div>
            <label className={labelClass}>CIDR</label>
            <input type="text" name="cidr" value={formData.cidr || ''} onChange={handleChange} className={inputClass} />
          </div>
        )}

        {isClient && (
          <div>
            <label className={labelClass}>IP Address</label>
            <input type="text" name="ip" value={formData.ip || ''} onChange={handleChange} className={inputClass} />
          </div>
        )}

        {/* Color Pickers for Zone */}
        {isZone && (
          <>
            <div>
              <label className={labelClass}>Background Color</label>
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  name="color" 
                  value={formData.color || '#F8FAFC'} 
                  onChange={handleChange} 
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                />
                <input 
                  type="text" 
                  name="color" 
                  value={formData.color || ''} 
                  onChange={handleChange} 
                  className={`${inputClass} flex-1`}
                  placeholder="#F8FAFC"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Border Color</label>
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  name="borderColor" 
                  value={formData.borderColor || '#94A3B8'} 
                  onChange={handleChange} 
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                />
                <input 
                  type="text" 
                  name="borderColor" 
                  value={formData.borderColor || ''} 
                  onChange={handleChange} 
                  className={`${inputClass} flex-1`}
                  placeholder="#94A3B8"
                />
              </div>
            </div>
          </>
        )}

        {/* Color Picker and Isolation for Network */}
        {isNetwork && (
          <>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  name="color" 
                  value={formData.color || '#C7D2FE'} 
                  onChange={handleChange} 
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                />
                <input 
                  type="text" 
                  name="color" 
                  value={formData.color || ''} 
                  onChange={handleChange} 
                  className={`${inputClass} flex-1`}
                  placeholder="#C7D2FE"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <label className={`text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex items-center gap-2`}>
                <input
                  type="checkbox"
                  name="clientIsolation"
                  checked={!!formData.clientIsolation}
                  onChange={handleChange}
                  className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                Client Isolation
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (Blocks communication between clients)
              </span>
            </div>
          </>
        )}

        {/* Color Picker for Client */}
        {isClient && (
          <div>
            <label className={labelClass}>Color</label>
            <div className="flex items-center gap-2">
              <input 
                type="color" 
                name="color" 
                value={formData.color || '#FFFFFF'} 
                onChange={handleChange} 
                className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
              <input 
                type="text" 
                name="color" 
                value={formData.color || ''} 
                onChange={handleChange} 
                className={`${inputClass} flex-1`}
                placeholder="#FFFFFF"
              />
            </div>
          </div>
        )}

        {isRule && Array.isArray(selectedItem.data?.flowRules) && selectedItem.data.flowRules.length > 0 && (() => {
          const rules = selectedItem.data.flowRules as { sources?: string; destinations?: string; ports?: string; action?: string }[]
          const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
          const labelFor = (id: string) => {
            if (id.startsWith('section-networks-') || id.startsWith('section-hosts-')) {
              const zoneId = id.replace(/^section-(networks|hosts)-/, '')
              const zone = topologyData?.zones?.find((item: { id: string; name: string }) => item.id === zoneId)
              const kind = id.startsWith('section-networks-') ? 'networks' : 'hosts'
              return zone ? `${zone.name} ${kind}` : kind
            }
            return entityOptions.find(option => option.id === id)?.label || id
          }
          const collected = { ports: new Set<string>(), services: new Set<string>(), applications: new Set<string>() }
          for (const rule of rules) {
            const parts = classifyTraffic(rule.ports || '')
            parts.ports.forEach(item => collected.ports.add(item))
            parts.services.forEach(item => collected.services.add(item))
            parts.applications.forEach(item => collected.applications.add(item))
          }
          const chips = (label: string, items: string[]) => (
            <div key={label}>
              <label className={labelClass}>{label}</label>
              <div className="flex flex-wrap gap-1">
                {(items.length ? items : ['any']).map(item => (
                  <span key={item} className="text-xs rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-800 dark:text-gray-100">{item}</span>
                ))}
              </div>
            </div>
          )
          const from = labelFor(selectedItem.source)
          const to = labelFor(selectedItem.target)
          return (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{from} → {to}</p>
              <div>
                <label className={labelClass}>Sources</label>
                <p className="text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{unique(rules.map(rule => rule.sources || '')).join('\n') || 'any'}</p>
              </div>
              <div>
                <label className={labelClass}>Destinations</label>
                <p className="text-xs text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{unique(rules.map(rule => rule.destinations || '')).join('\n') || 'any'}</p>
              </div>
              {chips('Ports', [...collected.ports])}
              {chips('Applications', [...collected.applications])}
              {chips('Services', [...collected.services])}
              {chips('Actions', unique(rules.map(rule => rule.action === 'BLOCK' ? 'DENY' : 'ALLOW')))}
            </div>
          )
        })()}

        {isRule && (
          <>
            {/* Sources */}
            <div>
              <label className={labelClass}>Sources</label>
              <div className="flex flex-col gap-2">
                {sources.map((src, idx) => (
                  <div key={idx} className="flex flex-col gap-1 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-950">
                    <div className="flex items-center gap-2">
                      <select 
                        value={src.id} 
                        onChange={(e) => {
                          const newSources = [...sources]
                          newSources[idx] = { ...newSources[idx], id: e.target.value }
                          setSources(newSources)
                        }} 
                        className={selectClass}
                      >
                        <option value="">-- Select Source --</option>
                        <option value="any">any</option>
                        <optgroup label="Zones">
                          {entityOptions.filter(o => o.group === 'Zone').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Networks">
                          {entityOptions.filter(o => o.group === 'Network').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Clients">
                          {entityOptions.filter(o => o.group === 'Client').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                      </select>
                      <button onClick={() => setSources(sources.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                        &times;
                      </button>
                    </div>
                    {classifyEntity(src.id, topologyData) === 'zone' && (
                      <input 
                        type="text" 
                        placeholder="CIDR Restriction (optional)" 
                        value={src.cidr || ''} 
                        onChange={(e) => {
                          const newSources = [...sources]
                          newSources[idx] = { ...newSources[idx], cidr: e.target.value }
                          setSources(newSources)
                        }}
                        className={`${inputClass} text-xs`}
                      />
                    )}
                  </div>
                ))}
                <button onClick={() => setSources([...sources, { id: '' }])} className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-start">
                  + Add Source
                </button>
              </div>
            </div>

            {/* Destinations */}
            <div>
              <label className={labelClass}>Destinations</label>
              <div className="flex flex-col gap-2">
                {destinations.map((dst, idx) => (
                  <div key={idx} className="flex flex-col gap-1 p-2 border border-orange-200 dark:border-orange-900 rounded bg-orange-50 dark:bg-orange-950">
                    <div className="flex items-center gap-2">
                      <select 
                        value={dst.id} 
                        onChange={(e) => {
                          const newDestinations = [...destinations]
                          newDestinations[idx] = { ...newDestinations[idx], id: e.target.value }
                          setDestinations(newDestinations)
                        }} 
                        className={selectClass}
                      >
                        <option value="">-- Select Destination --</option>
                        <option value="any">any</option>
                        <optgroup label="Zones">
                          {entityOptions.filter(o => o.group === 'Zone').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Networks">
                          {entityOptions.filter(o => o.group === 'Network').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Clients">
                          {entityOptions.filter(o => o.group === 'Client').map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                      </select>
                      <button onClick={() => setDestinations(destinations.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                        &times;
                      </button>
                    </div>
                    {classifyEntity(dst.id, topologyData) === 'zone' && (
                      <input 
                        type="text" 
                        placeholder="CIDR Restriction (optional)" 
                        value={dst.cidr || ''} 
                        onChange={(e) => {
                          const newDestinations = [...destinations]
                          newDestinations[idx] = { ...newDestinations[idx], cidr: e.target.value }
                          setDestinations(newDestinations)
                        }}
                        className={`${inputClass} text-xs`}
                      />
                    )}
                  </div>
                ))}
                <button onClick={() => setDestinations([...destinations, { id: '' }])} className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-start">
                  + Add Destination
                </button>
              </div>
            </div>

            {/* Ports */}
            <div>
              <label className={labelClass}>Ports</label>
              <input type="text" name="ports" value={formData.ports || ''} onChange={handleChange} className={inputClass} placeholder="e.g. 80, 443" />
            </div>

            {/* Action */}
            <div>
              <label className={labelClass}>Action</label>
              <select name="action" value={formData.action || 'ALLOW'} onChange={handleChange} className={selectClass}>
                <option value="ALLOW">ALLOW</option>
                <option value="BLOCK">BLOCK</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className={labelClass}>Priority</label>
              <input type="number" name="priority" value={formData.priority ?? 100} onChange={handleChange} className={inputClass} />
            </div>
          </>
        )}

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md p-2 font-medium transition">
            Save
          </button>
          {!selectedItem.data?.isAuto && (
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-md p-2 font-medium transition">
              Delete
            </button>
          )}
        </div>

        {/* Add Child Buttons */}
        {isZone && (
          <div className="mt-2 text-center">
            <button onClick={handleAddNetwork} className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md p-2 text-sm font-medium transition">
              + Add Network to Zone
            </button>
          </div>
        )}
        {isNetwork && (
          <div className="mt-2 text-center">
            <button onClick={handleAddClient} className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md p-2 text-sm font-medium transition">
              + Add Client to Network
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
