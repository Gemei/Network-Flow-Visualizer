import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Check if database is already seeded
  const zoneCount = await prisma.zone.count()
  if (zoneCount > 0) {
    console.log('Database already seeded, skipping seed script...')
    return
  }

  // Clear existing data to avoid duplicates on re-seed
  await prisma.rule.deleteMany()
  await prisma.client.deleteMany()
  await prisma.network.deleteMany()
  await prisma.zone.deleteMany()

  const chart = await prisma.chart.create({ data: { name: 'Chart 1' } })

  // --- ZONES ---
  const internalZone = await prisma.zone.create({
    data: { chartId: chart.id, name: 'INTERNAL', color: '#DBEAFE', borderColor: '#3B82F6', description: 'Internal Corporate Networks' }
  })

  const untrustedZone = await prisma.zone.create({
    data: { chartId: chart.id, name: 'Untrusted', color: '#F3F4F6', borderColor: '#9CA3AF', description: 'Guest and Untrusted Networks' }
  })

  const vpnZone = await prisma.zone.create({
    data: { chartId: chart.id, name: 'VPN', color: '#D1FAE5', borderColor: '#10B981', description: 'Remote Access VPNs' }
  })

  const externalZone = await prisma.zone.create({
    data: { chartId: chart.id, name: 'EXTERNAL', color: '#FFEDD5', borderColor: '#F97316', description: 'Internet and External Providers' }
  })

  // --- NETWORKS (Converted to Class B: 172.16.x.x) ---
  const vlan1 = await prisma.network.create({
    data: { name: 'Vlan 1 Management', color: '#F9A8D4', zoneId: internalZone.id, cidr: '172.16.1.0/24' }
  })

  const vlan100 = await prisma.network.create({
    data: { name: 'Vlan 100 Server Management', color: '#FCA5A5', zoneId: internalZone.id, cidr: '172.16.100.0/24' }
  })

  const vlan10 = await prisma.network.create({
    data: { name: 'Vlan 10 Services', color: '#FCA5A5', zoneId: internalZone.id, cidr: '172.16.10.0/24' }
  })

  const vlan9 = await prisma.network.create({
    data: { name: 'Vlan 9 Home Clients', color: '#FDE68A', zoneId: internalZone.id, cidr: '172.16.9.0/24' }
  })

  const vlan200 = await prisma.network.create({
    data: { name: 'Vlan 200 Video-Intern', color: '#86EFAC', zoneId: internalZone.id, cidr: '172.16.200.0/24' }
  })

  const vlan30 = await prisma.network.create({
    data: { name: 'Vlan 30 Monitoring', color: '#93C5FD', zoneId: internalZone.id, cidr: '172.16.30.0/24' }
  })

  const vlan50 = await prisma.network.create({
    data: { name: 'Vlan 50 Proxmox', color: '#FDE68A', zoneId: internalZone.id, cidr: '172.16.50.0/24' }
  })

  const vlan2 = await prisma.network.create({
    data: { name: 'Vlan 2 Smarthome', color: '#86EFAC', zoneId: untrustedZone.id, cidr: '172.16.2.0/24' }
  })

  const vlan20 = await prisma.network.create({
    data: { name: 'Vlan 20 Sandbox', color: '#86EFAC', zoneId: untrustedZone.id, cidr: '172.16.20.0/24' }
  })

  const vlan3 = await prisma.network.create({
    data: { name: 'Vlan 3 Gast', color: '#93C5FD', zoneId: untrustedZone.id, cidr: '172.16.3.0/24' }
  })

  const wgVPN = await prisma.network.create({
    data: { name: 'WireGuardHomeDevices', color: '#FCA5A5', zoneId: vpnZone.id, cidr: '172.16.99.0/24' }
  })

  const internet = await prisma.network.create({
    data: { name: 'INTERNET', color: '#FDBA74', zoneId: externalZone.id, cidr: '0.0.0.0/0' }
  })

  const berlin = await prisma.network.create({
    data: { name: 'BERLIN', color: '#93C5FD', zoneId: externalZone.id, cidr: '1.2.3.4/32' }
  })

  const fritzbox = await prisma.network.create({
    data: { name: 'FRITZBOX', color: '#86EFAC', zoneId: externalZone.id, cidr: '172.16.178.0/24' }
  })

  // --- CLIENTS (Updated IPs to match new Networks) ---
  const proxmoxHost = await prisma.client.create({
    data: { name: 'Proxmox Node 1', ip: '172.16.50.2', color: '#BFDBFE', networkId: vlan50.id }
  })

  const dnsServer = await prisma.client.create({
    data: { name: 'Pi-hole', ip: '172.16.10.53', color: '#BBF7D0', networkId: vlan10.id }
  })

  const smartDevice = await prisma.client.create({
    data: { name: 'Smart Bulb', ip: '172.16.2.15', color: '#FDE68A', networkId: vlan2.id }
  })

  // --- RULES (Logik bleibt identisch) ---
  await prisma.rule.create({
    data: {
      chartId: chart.id,
      description: 'Management to Smarthome',
      ports: '443, 80',
      action: 'ALLOW',
      priority: 10,
      active: true,
      sources: { create: [{ networkId: vlan1.id }] },
      destinations: { create: [{ networkId: vlan2.id }] }
    }
  })

  await prisma.rule.create({
    data: {
      chartId: chart.id,
      description: 'Block Untrusted to Internal',
      ports: 'any',
      action: 'BLOCK',
      priority: 100,
      active: true,
      sources: { create: [{ zoneId: untrustedZone.id }] },
      destinations: { create: [{ zoneId: internalZone.id }] }
    }
  })

  await prisma.rule.create({
    data: {
      chartId: chart.id,
      description: 'Proxmox to Internet',
      ports: '443, 80, 53',
      action: 'ALLOW',
      priority: 20,
      active: true,
      sources: { create: [{ networkId: vlan50.id }] },
      destinations: { create: [{ networkId: internet.id }] }
    }
  })

  await prisma.rule.create({
    data: {
      chartId: chart.id,
      description: 'Default Block Inbound',
      ports: 'any',
      action: 'BLOCK',
      priority: 200,
      active: true,
      sources: { create: [{ networkId: internet.id }] },
      destinations: { create: [{ zoneId: internalZone.id }] }
    }
  })

  await prisma.rule.create({
    data: {
      chartId: chart.id,
      description: 'Video isolation',
      ports: 'any',
      action: 'BLOCK',
      priority: 50,
      active: true,
      sources: { create: [{ networkId: vlan200.id }] },
      destinations: { create: [{ networkId: vlan1.id }] }
    }
  })

  console.log('Seeding complete with Class B addresses!');
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })