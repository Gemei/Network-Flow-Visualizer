import { Handle, Position } from '@xyflow/react'
import { Server } from 'lucide-react'
import { useTheme } from 'next-themes'

function getContrastColors(hex: string) {
  if (!hex) return { text: 'text-gray-900', subtext: 'text-gray-500', icon: 'text-gray-500' }
  const r = parseInt(hex.slice(1, 3) || 'ff', 16)
  const g = parseInt(hex.slice(3, 5) || 'ff', 16)
  const b = parseInt(hex.slice(5, 7) || 'ff', 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return (yiq >= 128) 
    ? { text: 'text-gray-700', subtext: 'text-gray-500', icon: 'text-gray-500' }
    : { text: 'text-white', subtext: 'text-gray-300', icon: 'text-gray-300' }
}

export function ClientNode({ data }: { data: any; selected?: boolean }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  
  const defaultBg = isDark ? '#1F2937' : '#FFFFFF'
  const bgColor = data.color && data.color !== '#FFFFFF' ? data.color : defaultBg
  const colors = getContrastColors(bgColor)
  
  return (
    <div 
      className="flex items-center gap-2 px-3 py-1 shadow-sm rounded-full border border-gray-300 dark:border-gray-600 w-full h-full overflow-hidden relative"
      style={{ backgroundColor: bgColor }}
      title={data.description || 'Client'}
    >
      <Server size={14} className={`${colors.icon} flex-shrink-0 relative z-10`} />
      <div className="flex flex-col overflow-hidden relative z-10 w-full">
        <span className={`font-medium text-xs ${colors.text} truncate`}>{data.label}</span>
        {data.ip && <span className={`text-[10px] ${colors.subtext} truncate`}>{data.ip}</span>}
      </div>
      
      {/* Left/Right handles only, fully invisible and non-interactive */}
      <Handle id="left" type="source" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="left-target" type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="right-target" type="target" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="top-target" type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
    </div>
  )
}
