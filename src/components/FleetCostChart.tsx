'use client'

import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './useChartTheme'
import { formatRon } from '@/lib/money'

const ronTooltip = (value: unknown) => formatRon(Number(value))

/**
 * RL-039: the fleet's running cost per month. Pre-aggregated on the server
 * (`fleetCost()`); colours from useChartTheme(), because Recharts writes
 * literal SVG colours and cannot see the app's CSS variables.
 */
export default function FleetCostChart({ data }: { data: Array<{ month: string; total: number }> }) {
  const t = useTranslations('fleet.cost')
  const theme = useChartTheme()
  if (data.length === 0) return <p className="text-sm text-ink-faint">{t('noCosts')}</p>
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.axis }} />
          <YAxis tick={{ fontSize: 11, fill: theme.axis }} />
          <Tooltip
            formatter={ronTooltip}
            contentStyle={{ backgroundColor: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8, color: theme.axis }}
            itemStyle={{ color: theme.axis }}
          />
          <Bar dataKey="total" name={t('running')} fill={theme.accent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
