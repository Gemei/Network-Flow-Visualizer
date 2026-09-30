import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ALLOWED_RULE_FIELDS = [
  'description', 'ports', 'action', 'priority', 'active', 'chartId',
]

function sanitizeRuleData(data: any) {
  const clean: any = {}
  for (const key of ALLOWED_RULE_FIELDS) {
    if (key in data) {
      clean[key] = data[key]
    }
  }
  // Convert priority to number if present
  if ('priority' in clean && clean.priority !== null) {
    clean.priority = parseInt(clean.priority, 10) || 100
  }
  return clean
}

export async function POST(req: Request) {
  try {
    const rawData = await req.json()
    const data = sanitizeRuleData(rawData)
    
    // Construct nested create for sources and destinations
    if (rawData.sources && Array.isArray(rawData.sources)) {
      data.sources = { create: rawData.sources }
    }
    if (rawData.destinations && Array.isArray(rawData.destinations)) {
      data.destinations = { create: rawData.destinations }
    }

    const rule = await prisma.rule.create({ 
      data,
      include: { sources: true, destinations: true }
    })
    return NextResponse.json(rule)
  } catch (error) {
    console.error('Failed to create rule:', error)
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }
}
