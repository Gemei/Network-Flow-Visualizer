import { isNetworkInCidr } from './cidr-utils'
import { classifyTraffic } from './paloalto-import'

export type ConflictInfo = {
  isFullyShadowed: boolean;
  shadowingRuleNames: string[];
  shadowedPorts: string[]; // specific ports shadowed, or 'any' if all ports shadowed
}

// Parses "80, 443, 8080-8082" into a list of numbers/strings or "any"
export function parsePorts(portsStr: string | null | undefined): Set<number> | 'any' {
  if (!portsStr || portsStr.toLowerCase().trim() === 'any' || portsStr.trim() === '') {
    return 'any';
  }
  const ports = new Set<number>();
  const parts = portsStr.split(',').map(p => p.trim());
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          ports.add(i);
        }
      }
    } else {
      const p = Number(part);
      if (!isNaN(p)) {
        ports.add(p);
      }
    }
  }
  return ports;
}

// Check if A covers B
export function portCovers(portsA: Set<number> | 'any', portsB: Set<number> | 'any'): boolean {
  if (portsA === 'any') return true;
  if (portsB === 'any') return false; // A is specific, B is any
  // Check if B's ports are subset of A's
  for (const port of portsB) {
    if (!portsA.has(port)) return false;
  }
  return true;
}

// Get the intersection of ports. If A intersects B, return the intersecting ports in B.
export function getShadowedPorts(portsA: Set<number> | 'any', portsB: Set<number> | 'any'): string[] {
  if (portsA === 'any') {
    if (portsB === 'any') return ['any'];
    return Array.from(portsB).map(String);
  }
  if (portsB === 'any') {
    // A only shadows specific ports, not the whole 'any'
    return Array.from(portsA).map(String);
  }
  // Intersect
  const shadowed: string[] = [];
  for (const port of portsB) {
    if (portsA.has(port)) {
      shadowed.push(String(port));
    }
  }
  return shadowed;
}

// Helper: Check if setB is a subset of setA
function isEntitySubset(setB: Set<string>, setA: Set<string>): boolean {
  if (setB.size === 0) {
      // If B has no targets, it means "ANY".
      // If B is ANY, A must also be ANY to cover it.
      return setA.size === 0;
  }
  if (setA.size === 0) {
      // If A is ANY, it covers any B
      return true;
  }

  for (const item of setB) {
    if (!setA.has(item)) return false;
  }
  return true;
}

// Flattens a target list to the terminal entity IDs (networks and clients) and zone IDs 
function getFlatEntities(targets: any[], topologyData: any, isSource: boolean): Set<string> {
  const { zones } = topologyData;
  const result = new Set<string>();

  if (!targets || targets.length === 0) {
      // ANY source/destination
      // For conflict detection, ANY is just represented as an empty set to denote "everything".
      return result;
  }

  targets.forEach(target => {
    if (target.clientId) {
      result.add(`client-${target.clientId}`);
    } else if (target.networkId) {
      result.add(`network-${target.networkId}`);
      // also add its clients
      const zone = zones.find((z: any) => z.networks.some((n: any) => n.id === target.networkId));
      const net = zone?.networks.find((n: any) => n.id === target.networkId);
      net?.clients.forEach((c: any) => result.add(`client-${c.id}`));
    } else if (target.zoneId) {
      result.add(`zone-${target.zoneId}`);
      const zone = zones.find((z: any) => z.id === target.zoneId);
      zone?.networks.forEach((n: any) => {
        let includeNet = true;
        if (target.cidr && n.cidr) {
          includeNet = isNetworkInCidr(n.cidr, target.cidr);
        }
        if (includeNet) {
          result.add(`network-${n.id}`);
          n.clients.forEach((c: any) => result.add(`client-${c.id}`));
        }
      });
    }
  });

  return result;
}

type MatchSet = { any: boolean; tokens: Set<string> }
type Traffic = { services: MatchSet; applications: MatchSet }
type Endpoint = { zones: MatchSet; addresses: MatchSet }

export function ruleTitle(rule: { description?: string; name?: string }) {
  const raw = String(rule.description || rule.name || 'Unnamed rule')
  return raw.split(' — ')[0].trim() || 'Unnamed rule'
}

function matchSet(values: string[]): MatchSet {
  const tokens = new Set(values.map(token => token.toLowerCase()).filter(token => token && token !== 'any'))
  return { any: values.length === 0 || values.some(token => token.toLowerCase() === 'any'), tokens }
}

function trafficOf(raw: string | null | undefined): Traffic {
  const text = String(raw || '').trim()
  if (!text || text.toLowerCase() === 'any') {
    return { services: { any: true, tokens: new Set() }, applications: { any: true, tokens: new Set() } }
  }
  const parts = classifyTraffic(text)
  return {
    services: matchSet([...parts.ports, ...parts.services]),
    applications: matchSet(parts.applications),
  }
}

function setCovers(higher: MatchSet, lower: MatchSet) {
  if (higher.any) return true
  if (lower.any || lower.tokens.size === 0) return false
  for (const token of lower.tokens) {
    if (!higher.tokens.has(token)) return false
  }
  return true
}

function setOverlaps(higher: MatchSet, lower: MatchSet) {
  if (higher.any || lower.any) return true
  for (const token of lower.tokens) {
    if (higher.tokens.has(token)) return true
  }
  return false
}

function trafficCovers(higher: Traffic, lower: Traffic) {
  return setCovers(higher.services, lower.services) && setCovers(higher.applications, lower.applications)
}

function asCidr(value: string) {
  const token = value.trim()
  if (token.includes('/')) return token
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(token)) return `${token}/32`
  return ''
}

function addressContains(outer: string, inner: string) {
  if (outer.toLowerCase() === inner.toLowerCase()) return true
  const outerCidr = asCidr(outer)
  const innerCidr = asCidr(inner)
  if (!outerCidr || !innerCidr) return false
  return isNetworkInCidr(innerCidr, outerCidr)
}

function addressesCover(higher: MatchSet, lower: MatchSet) {
  if (higher.any) return true
  if (lower.any || lower.tokens.size === 0) return false
  for (const inner of lower.tokens) {
    let covered = false
    for (const outer of higher.tokens) {
      if (addressContains(outer, inner)) covered = true
    }
    if (!covered) return false
  }
  return true
}

function addressesOverlap(higher: MatchSet, lower: MatchSet) {
  if (higher.any || lower.any) return true
  for (const inner of lower.tokens) {
    for (const outer of higher.tokens) {
      if (addressContains(outer, inner) || addressContains(inner, outer)) return true
    }
  }
  return false
}

function endpointCovers(higher: Endpoint, lower: Endpoint) {
  return setCovers(higher.zones, lower.zones) && addressesCover(higher.addresses, lower.addresses)
}

function endpointOverlaps(higher: Endpoint, lower: Endpoint) {
  return setOverlaps(higher.zones, lower.zones) && addressesOverlap(higher.addresses, lower.addresses)
}

function endpointFromText(text: string): Endpoint | null {
  const match = text.match(/^(.*) \[(.*)\]$/)
  if (!match) return null
  const zones = match[1].split(',').map(part => part.trim()).filter(Boolean)
  const addresses = match[2].split(',').map(part => part.trim()).filter(part => part && !/^\+\d+$/.test(part))
  const truncated = /\+\d+/.test(match[2])
  return {
    zones: matchSet(zones),
    addresses: truncated ? { any: false, tokens: new Set([`unlisted ${match[2]}`]) } : matchSet(addresses),
  }
}

function endpointOf(rule: any, side: 'sources' | 'destinations', topologyData: any): Endpoint {
  const description = String(rule.description || '')
  const body = description.includes(' — ') ? description.slice(description.indexOf(' — ') + 3) : ''
  const halves = body.split(' → ')
  const text = side === 'sources' ? halves[0] : halves[1]
  const parsed = text ? endpointFromText(text.trim()) : null
  if (parsed) return parsed

  const targets = Array.isArray(rule[side]) ? rule[side] : []
  if (!targets.length) return { zones: { any: true, tokens: new Set() }, addresses: { any: true, tokens: new Set() } }

  const zones = new Set<string>()
  const addresses = new Set<string>()
  let addressAny = false
  for (const target of targets) {
    let found = false
    for (const zone of topologyData?.zones || []) {
      if (target.zoneId && target.zoneId === zone.id) {
        zones.add(zone.name)
        if (target.cidr) addresses.add(target.cidr)
        else addressAny = true
        found = true
      }
      for (const network of zone.networks || []) {
        if (target.networkId && target.networkId === network.id) {
          zones.add(zone.name)
          if (network.cidr) addresses.add(network.cidr)
          else addresses.add(`network:${network.id}`)
          found = true
        }
        for (const client of network.clients || []) {
          if (target.clientId && target.clientId === client.id) {
            zones.add(zone.name)
            addresses.add(client.ip || `client:${client.id}`)
            found = true
          }
        }
      }
    }
    if (!found) {
      const id = target.clientId || target.networkId || target.zoneId || target.cidr
      if (id) addresses.add(String(id))
    }
  }

  return {
    zones: zones.size ? { any: false, tokens: new Set([...zones].map(zone => zone.toLowerCase())) } : { any: false, tokens: new Set(['unmatched zone']) },
    addresses: addressAny ? { any: true, tokens: new Set() } : { any: false, tokens: new Set([...addresses].map(address => address.toLowerCase())) },
  }
}

function shadowedTraffic(higher: Traffic, lower: Traffic): string[] {
  if (!setOverlaps(higher.services, lower.services) || !setOverlaps(higher.applications, lower.applications)) return []
  if (trafficCovers(higher, lower)) {
    const services = lower.services.any ? ['any'] : [...lower.services.tokens]
    const applications = lower.applications.any ? [] : [...lower.applications.tokens]
    return [...services, ...applications]
  }
  const services = higher.services.any
    ? (lower.services.any ? ['any'] : [...lower.services.tokens])
    : [...lower.services.tokens].filter(token => higher.services.tokens.has(token))
  const applications = higher.applications.any
    ? []
    : [...lower.applications.tokens].filter(token => higher.applications.tokens.has(token))
  return [...services, ...applications]
}

export function detectRuleConflicts(rules: any[], topologyData: any): Record<string, ConflictInfo> {
  const conflicts: Record<string, ConflictInfo> = {};

  // Sort active rules by priority (lowest number = highest priority)
  const activeRules = rules.filter(r => r.active).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  // Pre-calculate flat sets for performance
  const sources: Record<string, Endpoint> = {};
  const destinations: Record<string, Endpoint> = {};
  const parsedPorts: Record<string, Traffic> = {};

  activeRules.forEach(r => {
    sources[r.id] = endpointOf(r, 'sources', topologyData);
    destinations[r.id] = endpointOf(r, 'destinations', topologyData);
    parsedPorts[r.id] = trafficOf(r.ports);
    
    // Initialize default conflict state
    conflicts[r.id] = {
      isFullyShadowed: false,
      shadowingRuleNames: [],
      shadowedPorts: []
    };
  });

  // For each rule, check if any higher priority rule shadows it
  for (let i = 0; i < activeRules.length; i++) {
    const rule = activeRules[i];
    const myPorts = parsedPorts[rule.id];
    let fullyShadowed = false;
    const shadowingRuleNames = new Set<string>();
    const shadowedPorts = new Set<string>();

    for (let j = 0; j < i; j++) {
      const higher = activeRules[j];
      // A lower priority number is evaluated first. The same number does not shadow.
      if ((higher.priority ?? 100) >= (rule.priority ?? 100)) continue;

      const higherPorts = parsedPorts[higher.id];
      const pathOverlaps = endpointOverlaps(sources[higher.id], sources[rule.id]) && endpointOverlaps(destinations[higher.id], destinations[rule.id]);
      const pathCovers = endpointCovers(sources[higher.id], sources[rule.id]) && endpointCovers(destinations[higher.id], destinations[rule.id]);
      const trafficOverlaps = setOverlaps(higherPorts.services, myPorts.services) && setOverlaps(higherPorts.applications, myPorts.applications);

      // The earlier rule hides this one only when every packet this rule would match
      // already matches the earlier rule's source and destination.
      if (pathCovers && trafficOverlaps) {
        shadowingRuleNames.add(`${ruleTitle(higher)} (priority ${higher.priority ?? 100})`);
        shadowedTraffic(higherPorts, myPorts).forEach(item => shadowedPorts.add(item));

        if (trafficCovers(higherPorts, myPorts)) {
          fullyShadowed = true;
          break;
        }
      }
    }

    conflicts[rule.id] = {
      isFullyShadowed: fullyShadowed,
      shadowingRuleNames: Array.from(shadowingRuleNames),
      shadowedPorts: Array.from(shadowedPorts)
    };
  }

  // Assign empty conflict info for inactive rules
  rules.filter(r => !r.active).forEach(r => {
    conflicts[r.id] = {
      isFullyShadowed: false,
      shadowingRuleNames: [],
      shadowedPorts: []
    };
  });

  return conflicts;
}
