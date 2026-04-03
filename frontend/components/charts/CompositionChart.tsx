'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ASSET_CLASS_COLORS, ASSET_CLASS_LABELS } from '@/lib/formatters'
import { formatCurrency } from '@/lib/formatters'

interface CompositionChartProps {
  data: { assetClass: string; value: number; percentage: number }[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-bg-card border border-border rounded-lg p-3 text-sm shadow-xl">
      <p className="text-text-secondary font-medium">{ASSET_CLASS_LABELS[d.assetClass] ?? d.assetClass}</p>
      <p className="text-text-primary font-semibold mt-1">{formatCurrency(d.value)}</p>
      <p className="text-text-secondary">{d.percentage.toFixed(2)}%</p>
    </div>
  )
}

export function CompositionChart({ data }: CompositionChartProps) {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="assetClass"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            strokeWidth={2}
            stroke="#161b22"
          >
            {data.map((entry) => (
              <Cell key={entry.assetClass} fill={ASSET_CLASS_COLORS[entry.assetClass] ?? '#8b949e'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex-1 space-y-2">
        {data.map(d => (
          <div key={d.assetClass} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: ASSET_CLASS_COLORS[d.assetClass] ?? '#8b949e' }}
              />
              <span className="text-text-secondary">{ASSET_CLASS_LABELS[d.assetClass] ?? d.assetClass}</span>
            </div>
            <span className="text-text-primary font-medium">{d.percentage.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
