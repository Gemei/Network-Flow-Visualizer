import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { parsePaloAltoRulebase, type PaloAltoRule } from '@/lib/paloalto-import'

const prisma = new PrismaClient()

const ZONE_COLORS = ['#DBEAFE', '#DCFCE7', '#FEF3C7', '#FCE7F3', '#EDE9FE', '#CFFAFE', '#FFEDD5', '#E2E8F0']
const ZONE_BORDERS = ['#2563EB', '#15803D', '#B45309', '#BE185D', '#6D28D9', '#0E7490', '#C2410C', '#334155']

function meaningful(values: string[]): string[] {
  return values.filter(v => v.toLowerCase() !== 'any')
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a Palo Alto security rulebase CSV.' }, { status: 400 })
    }
    const chartId = String(form.get('chartId') || '')
    if (!chartId) {
      return NextResponse.json({ error: 'Open a chart before importing.' }, { status: 400 })
    }
    const chart = await prisma.chart.findUnique({ where: { id: chartId } })
    if (!chart) {
      return NextResponse.json({ error: 'That chart no longer exists.' }, { status: 404 })
    }
    const replace = String(form.get('replace') ?? 'true') !== 'false'
    const text = await file.text()
    const rules = parsePaloAltoRulebase(text)

    const zoneNames = new Set<string>()
    for (const rule of rules) {
      for (const zone of [...rule.sourceZones, ...rule.destZones]) {
        if (zone.toLowerCase() !== 'any') zoneNames.add(zone)
      }
    }

    const summary = await prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.rule.deleteMany({ where: { chartId } })
        await tx.zone.deleteMany({ where: { chartId } })
      }

      const existing = await tx.zone.findMany({ where: { chartId }, select: { id: true, name: true } })
      const zoneIdByName = new Map(existing.map(z => [z.name, z.id]))
      let colorIndex = existing.length
      for (const name of [...zoneNames].sort((a, b) => a.localeCompare(b))) {
        if (zoneIdByName.has(name)) continue
        const created = await tx.zone.create({
          data: {
            chartId,
            name,
            color: ZONE_COLORS[colorIndex % ZONE_COLORS.length],
            borderColor: ZONE_BORDERS[colorIndex % ZONE_BORDERS.length],
            description: 'Imported from Palo Alto security rulebase',
          },
        })
        zoneIdByName.set(name, created.id)
        colorIndex++
      }

      const zoneEnds = (zones: string[]) =>
        zones
          .filter(zone => zone.toLowerCase() !== 'any' && zoneIdByName.has(zone))
          .map(zone => ({ zoneId: zoneIdByName.get(zone) }))

      const brief = (zones: string[], addresses: string[]) => {
        const namedZones = zones.filter(zone => zone.toLowerCase() !== 'any')
        const namedAddresses = meaningful(addresses)
        const zoneText = namedZones.length ? namedZones.join(', ') : 'any'
        const shown = namedAddresses.slice(0, 8)
        const extra = namedAddresses.length - shown.length
        const addrText = shown.length ? shown.join(', ') + (extra > 0 ? `, +${extra}` : '') : 'any'
        return `${zoneText} [${addrText}]`
      }

      let createdRules = 0
      for (const rule of rules) {
        const sources = zoneEnds(rule.sourceZones)
        const destinations = zoneEnds(rule.destZones)
        await tx.rule.create({
          data: {
            chartId,
            description: `${rule.name} — ${brief(rule.sourceZones, rule.sourceAddresses)} → ${brief(rule.destZones, rule.destAddresses)}`,
            ports: JSON.stringify({ service: rule.service, application: rule.application }),
            action: rule.action,
            priority: rule.order,
            active: rule.active,
            sources: sources.length ? { create: sources } : undefined,
            destinations: destinations.length ? { create: destinations } : undefined,
          },
        })
        createdRules++
      }

      return {
        rules: createdRules,
        zones: zoneIdByName.size,
        disabled: rules.filter((r: PaloAltoRule) => !r.active).length,
      }
    }, { timeout: 120000 })

    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    console.error('Palo Alto import failed:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
