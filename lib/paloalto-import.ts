export type PaloAltoRule = {
  order: number
  name: string
  active: boolean
  action: 'ALLOW' | 'BLOCK'
  service: string
  application: string
  sourceZones: string[]
  sourceAddresses: string[]
  destZones: string[]
  destAddresses: string[]
}

const IP = /^\d{1,3}(\.\d{1,3}){3}$/
const CIDR = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/

export function isIp(value: string): boolean {
  return IP.test(value)
}

export function isCidr(value: string): boolean {
  return CIDR.test(value)
}

export function classifyTraffic(raw: string): { ports: string[]; services: string[]; applications: string[] } {
  let service = raw || ''
  let application = ''
  if (service.startsWith('{')) {
    try {
      const parsed = JSON.parse(service) as { service?: string; application?: string }
      service = parsed.service || ''
      application = parsed.application || ''
    } catch {
      service = raw || ''
    }
  }
  const ports: string[] = []
  const services: string[] = []
  for (const item of service.split(/[;,]/).map(part => part.trim()).filter(Boolean)) {
    if (/^(tcp|udp)[-/]/i.test(item) || /^\d{1,5}([-/]\d{1,5})?$/.test(item)) ports.push(item)
    else services.push(item)
  }
  const applications = application.split(/[;,]/).map(part => part.trim()).filter(Boolean)
  return { ports, services, applications }
}

function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
}

/** RFC-style CSV split that keeps quoted semicolons and commas inside fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

function headerIndex(headers: string[], name: string): number {
  const target = name.toLowerCase()
  return headers.findIndex(h => h.trim().toLowerCase() === target)
}

export function parsePaloAltoRulebase(text: string): PaloAltoRule[] {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    throw new Error('The file has no rule rows.')
  }
  const headers = rows[0]
  const nameIdx = headerIndex(headers, 'Name')
  const srcZoneIdx = headerIndex(headers, 'Source Zone')
  const srcAddrIdx = headerIndex(headers, 'Source Address')
  const dstZoneIdx = headerIndex(headers, 'Destination Zone')
  const dstAddrIdx = headerIndex(headers, 'Destination Address')
  const serviceIdx = headerIndex(headers, 'Service')
  const applicationIdx = headerIndex(headers, 'Application')
  const actionIdx = headerIndex(headers, 'Action')
  if ([nameIdx, srcZoneIdx, dstZoneIdx, actionIdx].some(i => i < 0)) {
    throw new Error('This is not a Palo Alto security rulebase export. Expected columns Name, Source Zone, Destination Zone, and Action.')
  }

  const rules: PaloAltoRule[] = []
  for (const row of rows.slice(1)) {
    const name = (row[nameIdx] || '').trim()
    if (!name) continue
    const rawAction = (row[actionIdx] || '').trim().toLowerCase()
    const orderCell = (row[0] || '').trim()
    const order = /^\d+$/.test(orderCell) ? parseInt(orderCell, 10) : rules.length + 1
    rules.push({
      order,
      name: name.replace(/^\[Disabled\]\s*/i, ''),
      active: !/^\[Disabled\]/i.test(name),
      action: rawAction === 'allow' ? 'ALLOW' : 'BLOCK',
      service: serviceIdx >= 0 ? (row[serviceIdx] || 'any').trim() || 'any' : 'any',
      application: applicationIdx >= 0 ? (row[applicationIdx] || 'any').trim() || 'any' : 'any',
      sourceZones: splitList(row[srcZoneIdx]),
      sourceAddresses: srcAddrIdx >= 0 ? splitList(row[srcAddrIdx]) : ['any'],
      destZones: splitList(row[dstZoneIdx]),
      destAddresses: dstAddrIdx >= 0 ? splitList(row[dstAddrIdx]) : ['any'],
    })
  }
  if (rules.length === 0) {
    throw new Error('No rules were found in the export.')
  }
  return rules
}
