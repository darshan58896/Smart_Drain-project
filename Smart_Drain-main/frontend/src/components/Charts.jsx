import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
)

const COLORS = {
  water:  { line: '#0284C7', fill: 'rgba(2, 132, 199, 0.10)' },
  flow:   { line: '#059669', fill: 'rgba(5, 150, 105, 0.08)' },
  rain:   { line: '#7C3AED', fill: 'rgba(124, 58, 237, 0.08)' },
  rise:   { line: '#EA580C', fill: 'rgba(234, 88, 12, 0.08)' },
  risk:   { line: '#DC2626', fill: 'rgba(220, 38, 38, 0.08)' },
}

function buildDataset(history, key, color, label) {
  return {
    label,
    data: history.map(h => h[key] ?? null),
    borderColor: color.line,
    backgroundColor: color.fill,
    fill: true,
    tension: 0.35,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2,
    spanGaps: true,
  }
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: '#64748B',
        boxWidth: 12,
        font: { size: 11, family: "'Inter', sans-serif", weight: '600' },
      },
    },
    tooltip: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E2E8F0',
      borderWidth: 1,
      titleColor: '#172033',
      bodyColor: '#64748B',
      boxPadding: 4,
      padding: 10,
      titleFont: { size: 12, weight: '700' },
      bodyFont: { size: 11 },
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 10,
      shadowColor: 'rgba(15, 23, 42, 0.08)',
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#64748B',
        maxTicksLimit: 8,
        font: { size: 10, family: "'Inter', sans-serif" },
      },
      grid: { color: 'rgba(226, 232, 240, 0.8)' },
    },
    y: {
      ticks: {
        color: '#64748B',
        font: { size: 10, family: "'Inter', sans-serif" },
      },
      grid: { color: 'rgba(226, 232, 240, 0.8)' },
    },
  },
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function WaterLevelChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_level_percent', COLORS.water, 'Water Level (%)'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: {
        ...baseOptions.scales.y,
        min: 0,
        max: 100,
        ticks: { ...baseOptions.scales.y.ticks, callback: v => v + '%' },
      },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function FlowChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'flow_rate_lpm', COLORS.flow, 'Flow Rate (L/min)'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: {
        ...baseOptions.scales.y,
        min: 0,
        ticks: { ...baseOptions.scales.y.ticks, callback: v => v + ' L/m' },
      },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function MultiChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_level_percent', COLORS.water, 'Level %'),
      buildDataset(history, 'risk_score',          COLORS.risk,  'Risk Score'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: { ...baseOptions.scales.y, min: 0, max: 100 },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function RiseRateChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_rise_rate_cm_min', COLORS.rise, 'Rise Rate (cm/min)'),
    ],
  }
  return (
    <div className="chart-container">
      <Line data={data} options={baseOptions} />
    </div>
  )
}
