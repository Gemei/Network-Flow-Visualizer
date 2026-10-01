import { useRef } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import { Lock } from 'lucide-react'
import { useTheme } from 'next-themes'

function getContrastColors(hex: string) {
  if (!hex) return { text: 'text-gray-900', subtext: 'text-gray-700' }
  const r = parseInt(hex.slice(1, 3) || 'ff', 16)
  const g = parseInt(hex.slice(3, 5) || 'ff', 16)
  const b = parseInt(hex.slice(5, 7) || 'ff', 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return (yiq >= 128) 
    ? { text: 'text-gray-900', subtext: 'text-gray-700' }
    : { text: 'text-white', subtext: 'text-gray-200' }
}

export function NetworkNode({ data, selected }: { data: any; selected?: boolean }) {
  const resizing = useRef(false)
  const minWidth = useRef(data.minWidth || 166)
  const minHeight = useRef(data.minHeight || 70)
  if (!resizing.current) {
    minWidth.current = data.minWidth || 166
    minHeight.current = data.minHeight || 70
  }
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  
  const defaultBg = isDark ? '#3730A3' : '#C7D2FE'
  const bgColor = data.color || defaultBg
  const colors = getContrastColors(bgColor)
  
  return (
    <div 
      className="w-full h-full px-4 py-2 shadow-md rounded-md border border-gray-400 dark:border-gray-500 overflow-hidden relative"
      style={{ backgroundColor: bgColor, borderColor: data.borderColor || undefined }}
      title={data.description || 'Network'}
    >
      <NodeResizer
        minWidth={minWidth.current}
        minHeight={minHeight.current}
        isVisible={selected}
        lineClassName="!border-blue-400"
        handleClassName="!w-3 !h-3 !bg-blue-500 !border-blue-600 !rounded-sm"
        onResizeStart={() => { resizing.current = true }}
        onResizeEnd={() => { resizing.current = false }}
      />
      <div className="flex flex-col relative z-10">
        <span className={`font-semibold text-sm ${colors.text} truncate pr-6`}>{data.label}</span>
        {data.cidr && <span className={`text-xs ${colors.subtext} truncate`}>{data.cidr}</span>}
      </div>
      
      {data.clientIsolation && (
        <div className="absolute top-2 right-2 text-red-600 bg-white/50 backdrop-blur-sm rounded-full p-1 z-10" title="Client Isolation Active">
          <Lock size={12} strokeWidth={3} />
        </div>
      )}
      
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
