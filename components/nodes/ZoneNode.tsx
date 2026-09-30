import { useRef } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import { useTheme } from 'next-themes'

export function ZoneNode({ data, selected }: { data: any; selected?: boolean }) {
  const resizing = useRef(false)
  const minWidth = useRef(data.minWidth || 180)
  const minHeight = useRef(data.minHeight || 80)
  if (!resizing.current) {
    minWidth.current = data.minWidth || 180
    minHeight.current = data.minHeight || 80
  }
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  
  const defaultBg = isDark ? '#1E293B' : '#F8FAFC'
  const defaultBorder = isDark ? '#334155' : '#94A3B8'
  
  const bgColor = data.color && data.color !== '#F8FAFC' ? data.color : defaultBg
  const borderColor = data.borderColor && data.borderColor !== '#94A3B8' ? data.borderColor : defaultBorder
  
  return (
    <div 
      className="relative w-full h-full rounded-xl border-2 shadow-sm transition-all"
      style={{ 
        backgroundColor: bgColor, 
        borderColor: borderColor,
      }}
      title={data.description || 'Zone'}
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
      <div 
        className="absolute top-2 left-4 text-sm font-bold tracking-wider uppercase px-2 py-0.5 rounded"
        style={{ color: borderColor }}
      >
        {data.label}
      </div>
      {(['left', 'right', 'top', 'bottom'] as const).map(side => {
        const position = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[side]
        return (
          <Handle
            key={side}
            id={side}
            type="source"
            position={position}
            style={{
              width: 12,
              height: 12,
              background: '#2563eb',
              border: '2px solid white',
              opacity: data.showAttachments ? 1 : 0,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
