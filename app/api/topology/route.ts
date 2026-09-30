import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: Request) {
  try {
    const chartId = new URL(req.url).searchParams.get('chartId')
    if (!chartId) {
      return NextResponse.json({ zones: [], rules: [] })
    }
    const zones = await prisma.zone.findMany({
      where: { chartId },
      include: {
        networks: {
          include: {
            clients: true
          }
        }
      }
    })

    const rules = await prisma.rule.findMany({
      where: { chartId },
      include: {
        sources: true,
        destinations: true
      }
    })

    return NextResponse.json({ zones, rules })
  } catch (error) {
    console.error('Failed to fetch topology:', error)
    return NextResponse.json({ error: 'Failed to fetch topology' }, { status: 500 })
  }
}
