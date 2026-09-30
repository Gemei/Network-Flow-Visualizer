import { useEffect, useRef } from 'react'

type Props = {
  showAllow: boolean
  setShowAllow: (value: boolean) => void
  showDeny: boolean
  setShowDeny: (value: boolean) => void
  chipLines: boolean
  setChipLines: (value: boolean) => void
  onResetLayout: () => void
  onExportPng: () => void
}

function devShadow(): ShadowRoot | null {
  const portal = document.querySelector('nextjs-portal')
  return portal instanceof HTMLElement ? portal.shadowRoot : null
}

function directionMarks(kind: 'allow' | 'deny') {
  const wrap = document.createElement('span')
  wrap.style.display = 'flex'
  wrap.style.gap = '8px'
  wrap.style.marginLeft = 'auto'
  const colors = kind === 'allow' ? ['#4ade80', '#15803d'] : ['#fb7185', '#b91c1c']
  colors.forEach(color => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '36')
    svg.setAttribute('height', '14')
    svg.setAttribute('viewBox', '0 0 36 14')
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', '1')
    line.setAttribute('y1', '7')
    line.setAttribute('x2', '24')
    line.setAttribute('y2', '7')
    line.setAttribute('stroke', color)
    line.setAttribute('stroke-width', '3')
    if (kind === 'deny') line.setAttribute('stroke-dasharray', '4 3')
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    head.setAttribute('points', '22,2 34,7 22,12')
    head.setAttribute('fill', color)
    svg.appendChild(line)
    svg.appendChild(head)
    wrap.appendChild(svg)
  })
  return wrap
}

function findMenu(): HTMLElement | null {
  const menu = devShadow()?.querySelector('#nextjs-dev-tools-menu')
  return menu instanceof HTMLElement ? menu : null
}

export function GraphMenu({
  showAllow,
  setShowAllow,
  showDeny,
  setShowDeny,
  chipLines,
  setChipLines,
  onResetLayout,
  onExportPng,
}: Props) {
  const state = useRef({ showAllow, showDeny, chipLines, setShowAllow, setShowDeny, setChipLines, onResetLayout, onExportPng })
  state.current = { showAllow, showDeny, chipLines, setShowAllow, setShowDeny, setChipLines, onResetLayout, onExportPng }

  useEffect(() => {
    let applying = false
    const sync = () => {
      if (applying) return
      const menu = findMenu()
      if (!menu) return
      applying = true
      try {
        menu.querySelectorAll<HTMLElement>('.dev-tools-indicator-item').forEach(item => {
          if (item.closest('[data-graph-tools]')) return
          const label = item.querySelector('.dev-tools-indicator-label')?.textContent?.trim()
          if ((label === 'Route' || label === 'Bundler' || label === 'Route Info') && item.style.display !== 'none') {
            item.style.display = 'none'
          }
        })
        const itemList = menu.firstElementChild
        if (itemList instanceof HTMLElement && !itemList.dataset.graphTools) {
          const visible = [...itemList.querySelectorAll<HTMLElement>('.dev-tools-indicator-item')]
            .some(item => item.style.display !== 'none')
          const next = visible ? '' : 'none'
          if (itemList.style.display !== next) itemList.style.display = next
        }

        let section = menu.querySelector<HTMLElement>('[data-graph-tools]')
        if (!section) {
          section = document.createElement('div')
          section.dataset.graphTools = 'true'
          section.style.padding = '6px'
          section.style.width = '100%'
          menu.appendChild(section)
        }
        const footer = [...menu.children].find(node =>
          node instanceof HTMLElement && node.classList.contains('dev-tools-indicator-footer') && !node.dataset.graphTools
        )
        if (footer && footer !== menu.lastElementChild) menu.appendChild(footer)

        const current = state.current
        const rows: { id: string; label: string; mark?: 'allow' | 'deny'; on: boolean }[] = [
          { id: 'export', label: 'Export PNG', on: true },
          { id: 'allow', label: 'Allow', mark: 'allow', on: current.showAllow },
          { id: 'deny', label: 'Deny', mark: 'deny', on: current.showDeny },
          { id: 'chips', label: 'Per chip lines', on: current.chipLines },
          { id: 'reset', label: 'Reset graph', on: true },
        ]
        const signature = rows.map(row => `${row.id}:${row.on}`).join('|')
        if (section.dataset.signature === signature) return
        section.dataset.signature = signature
        rows.forEach(row => {
          let button = section!.querySelector<HTMLButtonElement>(`[data-graph-tool="${row.id}"]`)
          if (!button) {
            button = document.createElement('button')
            button.type = 'button'
            button.dataset.graphTool = row.id
            button.className = 'dev-tools-indicator-item'
            button.style.width = '100%'
            button.style.display = 'flex'
            button.style.alignItems = 'center'
            button.style.gap = '8px'
            button.style.background = 'transparent'
            button.style.border = '0'
            button.style.cursor = 'pointer'
            button.addEventListener('click', event => {
              event.preventDefault()
              event.stopPropagation()
              const latest = state.current
              const id = button!.dataset.graphTool
              if (id === 'export') latest.onExportPng()
              if (id === 'allow') latest.setShowAllow(!latest.showAllow)
              if (id === 'deny') latest.setShowDeny(!latest.showDeny)
              if (id === 'chips') latest.setChipLines(!latest.chipLines)
              if (id === 'reset') latest.onResetLayout()
            })
            section!.appendChild(button)
          }
          button.replaceChildren()
          button.style.opacity = row.mark || row.id === 'chips' ? (row.on ? '1' : '0.4') : '1'
          const label = document.createElement('span')
          label.className = 'dev-tools-indicator-label'
          label.textContent = row.label
          button.appendChild(label)
          if (row.mark) {
            button.appendChild(directionMarks(row.mark))
            const value = document.createElement('span')
            value.className = 'dev-tools-indicator-value'
            value.textContent = row.on ? 'On' : 'Off'
            value.style.marginLeft = 'auto'
            button.appendChild(value)
          } else if (row.id === 'chips') {
            const value = document.createElement('span')
            value.className = 'dev-tools-indicator-value'
            value.textContent = row.on ? 'On' : 'Off'
            button.appendChild(value)
          }
        })
      } finally {
        applying = false
      }
    }

    const onShadowMutation = (records: MutationRecord[]) => {
      const own = records.every(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        return !!target?.closest('[data-graph-tools]')
      })
      if (!own) sync()
    }
    const shadowObserver = new MutationObserver(onShadowMutation)
    const attach = () => {
      const root = devShadow()
      shadowObserver.disconnect()
      if (root) shadowObserver.observe(root, { childList: true, subtree: true })
      sync()
    }
    attach()
    const portalObserver = new MutationObserver(attach)
    portalObserver.observe(document.body, { childList: true })
    return () => {
      shadowObserver.disconnect()
      portalObserver.disconnect()
      findMenu()?.querySelector('[data-graph-tools]')?.remove()
    }
  }, [showAllow, showDeny, chipLines])

  return null
}
