# Network Flow Visualizer

<div align="center">
  <img src="./public/logo.png" alt="Network Flow Visualizer Logo" width="200"/>
  <br />
  <br />
  <img src="https://img.shields.io/badge/version-1.0.0-orange.svg" alt="Version 1.0" />
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"/>
</div>

An interactive web app for reading a firewall rulebase and seeing which zones can talk to each other. Built with Next.js, React Flow, Prisma, and SQLite.

---

## Overview

Import a Palo Alto security-rulebase CSV and the app draws one box per zone. Allow traffic is a solid green line. Deny, drop, and reset traffic is a dashed red line. Each chart keeps its own zones, rules, and layout.

## Using the graph

**Import.** In the sidebar, choose **Import Palo Alto CSV**. The import replaces the zones and rules on the chart you have open. A new chart starts empty, so import again for that chart. Disabled rules (names that start with `[Disabled]`) are stored but not drawn.

**Zones.** Checked networks and hosts appear as chips inside a Networks or Hosts section of their zone. Unchecked addresses stay off the canvas. A zone and its sections can be resized; chips keep their size and wrap to fit. They cannot be dragged outside the zone.

**Lines.** By default a line runs from zone to zone and ends in an arrow. The two directions use a light and a dark shade so they stay distinct. Turn on **Per chip lines** to draw a rule to the checked network or host instead, and to hide the arrows. Drag a line to curve it. Select a line first to move the side of the zone it attaches to.

**Properties.** Select a line to see the combined sources, destinations, ports, applications, services, and actions for that direction, and to edit or delete the line.

**Layout.** Positions, sizes, curves, and attachment sides are saved on the chart and survive a refresh. **Reset graph** clears that layout and puts the zones back on the default arrangement. Rules and checked addresses stay as they are.

**Export PNG.** Export captures the whole graph, including curves and labels outside the zone boxes. Resolution is a percentage and starts at 100%. The border starts at 5 pixels and can be any color. The preview updates as you change those settings.

The canvas menu holds **Export PNG**, **Allow**, **Deny**, **Per chip lines**, and **Reset graph**.

### Charts

The tabs at the top are separate maps. Switching charts reloads that chart's zones, rules, and layout. Deleting a chart deletes its rules with it.

### Other tools

The sidebar can match a pasted list of IP addresses and subnets and check the related networks and hosts. **Show Open Paths Auto-Flow** draws guessed open paths on smaller maps. The properties panel and the data view still edit zones, networks, clients, and rules directly.

---

### 🛠 Getting Started

#### Prerequisites

Node.js (v18+)

Database: SQLite for Prisma.

#### Local Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Gemei/network-flow-visualizer.git
cd network-flow-visualizer
npm install
```

Create a `.env` file in the project root. The SQLite file is resolved from the `prisma` folder:

```bash
DATABASE_URL="file:./dev.db"
```

`.env` and `*.db` are listed in `.gitignore`.

Initialize the database and start the app:

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

Open http://localhost:3000. `prisma db seed` loads sample zones. To see a firewall map, create or select a chart and import a Palo Alto security-rulebase CSV from the sidebar.

#### 🐳 Docker Usage

The project includes a Dockerfile and docker-compose.yml. The container keeps the SQLite file at `/app/data/dev.db`, creates the tables on startup, and does not load the sample seed. Create a chart in the app and import a CSV.

Build and run locally:
```bash
docker-compose up --build -d
```


The application will be accessible on port 3000.

#### 📄 Documentation

For a complete guide, including step-by-step tutorials and advanced configuration, please see the [User Guide](docs/user-guide.md).
