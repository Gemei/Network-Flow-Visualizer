import { useState, useRef, useEffect } from 'react'

export type Chart = {
  id: string
  name: string
  viewState: string | null
  createdAt: string
  updatedAt: string
}

type ChartTabsProps = {
  charts: Chart[]
  activeChartId: string | null
  onSwitchChart: (id: string) => void
  onCreateChart: () => void
  onDeleteChart: (id: string) => void
  onRenameChart: (id: string, newName: string) => void
  onOpenDataView: () => void
}

export function ChartTabs({
  charts,
  activeChartId,
  onSwitchChart,
  onCreateChart,
  onDeleteChart,
  onRenameChart,
  onOpenDataView,
}: ChartTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const handleDoubleClick = (chart: Chart) => {
    setEditingId(chart.id)
    setEditName(chart.name)
  }

  const handleRenameSubmit = () => {
    if (editingId && editName.trim()) {
      onRenameChart(editingId, editName.trim())
    }
    setEditingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div className="flex bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 items-center px-2 py-1 gap-1">
      <div className="flex-1 flex overflow-x-auto gap-1 custom-scrollbar">
        {charts.map(chart => (
          <div
            key={chart.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg transition-colors cursor-pointer select-none text-sm group ${
              chart.id === activeChartId
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-medium shadow-sm border-t-2 border-t-blue-500'
                : 'bg-gray-200 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-white/80 dark:hover:bg-gray-800'
            }`}
            onClick={(e) => {
              if (editingId !== chart.id) onSwitchChart(chart.id)
            }}
            onDoubleClick={() => handleDoubleClick(chart)}
          >
            {editingId === chart.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleKeyDown}
                className="bg-transparent border-none outline-none w-24 text-gray-900 dark:text-gray-100"
              />
            ) : (
              <span className="truncate max-w-[150px]">{chart.name}</span>
            )}
            
            {charts.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete chart "${chart.name}"?`)) {
                    onDeleteChart(chart.id)
                  }
                }}
                className={`ml-1 text-gray-400 hover:text-red-500 transition-colors ${
                  chart.id === activeChartId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Delete chart"
              >
                &times;
              </button>
            )}
          </div>
        ))}

        <button
          onClick={onCreateChart}
          className="flex items-center justify-center w-8 h-8 rounded-full ml-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="New Chart"
        >
          +
        </button>
      </div>

      <div className="flex-shrink-0 px-2">
        <button
          onClick={onOpenDataView}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800"
          title="Data View"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Data View
        </button>
      </div>
    </div>
  )
}
