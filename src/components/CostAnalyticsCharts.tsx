'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

function formatRon(value: unknown): string {
  return `${Number(value).toLocaleString('ro-RO')} RON`
}

interface CategoryDatum {
  label: string
  total: number
}

interface MonthlyDatum {
  month: string
  cumulative: number
}

// RL-015: bar chart (spend by category) + line chart (cumulative spend
// over time), both mobile-responsive via recharts' ResponsiveContainer.
// Data is pre-aggregated server-side (src/lib/analytics.ts) — this
// component only renders it.
export default function CostAnalyticsCharts({
  categoryData,
  monthlyData,
}: {
  categoryData: CategoryDatum[]
  monthlyData: MonthlyDatum[]
}) {
  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Spend by category</h2>
        {categoryData.length === 0 ? (
          <p className="text-sm text-ink-faint">No costed tasks in this range.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3DBCE" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={formatRon} />
                <Bar dataKey="total" fill="#F2560F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Cumulative spend over time</h2>
        {monthlyData.length === 0 ? (
          <p className="text-sm text-ink-faint">No costed tasks in this range.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3DBCE" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={formatRon} />
                <Line type="monotone" dataKey="cumulative" stroke="#F2560F" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
