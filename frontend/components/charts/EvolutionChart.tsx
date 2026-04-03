'use client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'

interface EvolutionChartProps {
  data: { month: string; invested: number; gain: number }[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const invested = payload.find((p: any) => p.dataKey === 'invested')?.value ?? 0
  const gain = payload.find((p: any) => p.dataKey === 'gain')?.value ?? 0
  return (
    <div className="bg-bg-card border border-border rounded-lg p-3 text-sm shadow-xl min-w-[180px]">
      <p className="text-text-secondary mb-2 font-medium">{label}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#3fb950' }} />
            <span className="text-text-secondary">Valor aplicado</span>
          </span>
          <span className="font-semibold text-text-primary">{formatCurrency(invested)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#58a6ff' }} />
            <span className="text-text-secondary">Ganho capital</span>
          </span>
          <span className="font-semibold text-green-400">{formatCurrency(gain)}</span>
        </p>
        <div className="border-t border-border mt-2 pt-2 flex justify-between gap-4">
          <span className="text-text-secondary">Total</span>
          <span className="font-bold text-text-primary">{formatCurrency(invested + gain)}</span>
        </div>
      </div>
    </div>
  )
}

export function EvolutionChart({ data }: EvolutionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#8b949e', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#21262d' }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#8b949e', paddingTop: 8 }}
          formatter={(v) => v === 'invested' ? 'Valor aplicado' : 'Ganho capital'}
        />
        <Bar dataKey="invested" name="invested" stackId="total" fill="#3fb950" />
        <Bar dataKey="gain" name="gain" stackId="total" fill="#58a6ff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
