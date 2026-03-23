import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { reportsApi, profilesApi } from '../services/api'
import { cn } from '../utils/cn'
import { COUNTRIES, COUNTRY_FLAG } from '../utils/constants'
import type { Country, LeadSource, HunterStats, TeamSummaryResponse } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

type PeriodKey = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month'

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today',      label: 'Hoy' },
  { id: 'this_week',  label: 'Esta semana' },
  { id: 'last_week',  label: 'Semana pasada' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes pasado' },
]

const COUNTRY_NAME: Record<Country, string> = {
  CO: 'Colombia', MX: 'México', AR: 'Argentina',
  PE: 'Perú',     CL: 'Chile',  EC: 'Ecuador',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

type SortField =
  | 'hunterName' | 'country' | 'team' | 'totalLeads' | 'leadsConTyc' | 'leadsSinTyc'
  | 'leadsWithContactAttempt' | 'leadsWithEffectiveContact' | 'obCount' | 'r2sCount'
  | 'productivity' | 'accumulatedTarget' | 'phasing' | 'gap'

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function Kpi({
  label, value, sub, color, onClick,
}: {
  label: string; value: number | string; sub: string; color: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl p-4 shadow-sm border border-gray-200',
        onClick && 'cursor-pointer hover:border-primary/40 hover:shadow-md transition-all',
      )}
    >
      <p className="text-xs text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={cn('text-3xl font-extrabold mt-1', color)}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

// ─── Sortable header ──────────────────────────────────────────────────────────

function SortTh({
  label, field, sortBy, sortDir, onClick,
}: {
  label: string; field: string; sortBy: string; sortDir: SortDir; onClick: (f: string) => void
}) {
  const active = sortBy === field
  return (
    <th
      onClick={() => onClick(field)}
      className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap cursor-pointer select-none hover:text-dark transition-colors"
    >
      <span className="flex items-center gap-0.5">
        {label}
        <span className="flex flex-col -space-y-0.5">
          <ChevronUp size={8} className={active && sortDir === 'asc' ? 'text-primary' : 'text-gray-300'} />
          <ChevronDown size={8} className={active && sortDir === 'desc' ? 'text-primary' : 'text-gray-300'} />
        </span>
      </span>
    </th>
  )
}

// ─── Source Toggle ────────────────────────────────────────────────────────────

function SourceToggle({
  value, onChange,
}: {
  value: 'all' | 'SDR' | 'SOB'; onChange: (v: 'all' | 'SDR' | 'SOB') => void
}) {
  return (
    <div className="flex bg-white rounded-xl border border-gray-200 p-1 gap-1">
      {(['all', 'SDR', 'SOB'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
            value === s
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-500 hover:text-dark',
          )}
        >
          {s === 'all' ? 'Todos' : s}
        </button>
      ))}
    </div>
  )
}

// ─── Phasing bar ──────────────────────────────────────────────────────────────

function PhasingBar({ value }: { value: number }) {
  const pct = Math.min(value, 150)
  const color =
    value >= 100 ? 'bg-success' :
    value >= 60  ? 'bg-warning' :
    'bg-danger'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        'text-sm font-bold tabular-nums w-12 text-right shrink-0',
        value >= 100 ? 'text-success' : value >= 60 ? 'text-warning' : 'text-danger',
      )}>
        {value.toFixed(1)}%
      </span>
    </div>
  )
}

// ─── GestionPage ──────────────────────────────────────────────────────────────

export default function GestionPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const isAdmin   = user?.role === 'ADMIN'
  const isLider   = user?.role === 'LIDER'

  // ── Filter state ────────────────────────────────────────────────────────────
  const [sourceFilter, setSourceFilter] = useState<'all' | 'SDR' | 'SOB'>('all')
  const [periodKey,    setPeriodKey]    = useState<PeriodKey>('this_month')
  const [country,      setCountry]      = useState<Country | ''>('')
  const [sortBy,       setSortBy]       = useState<SortField>('productivity')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')

  // Build the reference date as today's ISO date
  const refDate = new Date().toISOString().slice(0, 10)

  // ── Data fetching ───────────────────────────────────────────────────────────
  const sourceParam = sourceFilter === 'all' ? undefined : sourceFilter as LeadSource

  const { data: summary, isLoading, isFetching, refetch } = useQuery<TeamSummaryResponse>({
    queryKey: ['team-summary', periodKey, country || null, sourceFilter],
    queryFn:  () => reportsApi.getTeamSummary(periodKey, refDate, country || undefined, sourceParam),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  const { data: hunters = [] } = useQuery({
    queryKey: ['hunters', country || null, sourceFilter],
    queryFn:  () => profilesApi.getHunters({
      country:  (country as Country) || undefined,
      source:   sourceParam,
      leaderId: isLider ? user?.id : undefined,
    }),
    staleTime: 300_000,
  })

  // ── Sort handler ────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: string) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev as SortField
      }
      setSortDir('desc')
      return field as SortField
    })
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────────
  const teamRows = useMemo((): HunterStats[] => {
    if (!summary?.team) return []

    let rows = summary.team

    // Lider sees only their hunters
    if (isLider) {
      const myHunterIds = new Set(hunters.map((h) => h.id))
      rows = rows.filter((r) => myHunterIds.has(r.hunterId))
    }

    // Sort
    return [...rows].sort((a, b) => {
      const av = a[sortBy as keyof HunterStats]
      const bv = b[sortBy as keyof HunterStats]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc'
        ? Number(av ?? 0) - Number(bv ?? 0)
        : Number(bv ?? 0) - Number(av ?? 0)
    })
  }, [summary, isLider, hunters, sortBy, sortDir])

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = summary?.totals

  const showTyc = sourceFilter === 'SOB'

  // ── Columns ─────────────────────────────────────────────────────────────────
  const baseCols: { label: string; field: SortField }[] = [
    { label: 'Hunter',       field: 'hunterName' },
    { label: 'País',         field: 'country' },
    { label: 'Team',         field: 'team' },
    { label: 'Asignados',    field: 'totalLeads' },
    ...(showTyc ? [
      { label: 'Con TYC',   field: 'leadsConTyc' as SortField },
      { label: 'Sin TYC',   field: 'leadsSinTyc' as SortField },
    ] : []),
    { label: 'Gestionados',  field: 'leadsWithContactAttempt' },
    { label: 'C.Efectivos',  field: 'leadsWithEffectiveContact' },
    { label: 'OB',           field: 'obCount' },
    { label: 'R2S',          field: 'r2sCount' },
    { label: 'Productividad',field: 'productivity' },
    { label: 'Meta',         field: 'accumulatedTarget' },
    { label: 'Phasing%',     field: 'phasing' },
    { label: 'Gap',          field: 'gap' },
  ]

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="h-8 bg-gray-200 rounded w-64 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-200 animate-pulse space-y-2">
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-8 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-dark flex items-center gap-2">
              <TrendingUp size={22} className="text-primary" />
              Gestión Comercial
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">Rendimiento detallado del equipo Inbound</p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:text-primary hover:border-primary transition-colors disabled:opacity-50 self-end"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* Source toggle + Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <SourceToggle value={sourceFilter} onChange={setSourceFilter} />

          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value as PeriodKey)}
            className="h-8 px-2 rounded-xl border border-gray-200 text-xs bg-white cursor-pointer font-semibold"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          {isAdmin && (
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value as Country | '')}
              className="h-8 px-2 rounded-xl border border-gray-200 text-xs bg-white cursor-pointer"
            >
              <option value="">Todos los países</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{COUNTRY_FLAG[c]} {COUNTRY_NAME[c]}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          label="Total asignados"
          value={totals?.totalLeads ?? 0}
          sub="leads en el periodo"
          color="text-dark"
        />

        {showTyc ? (
          <>
            <Kpi
              label="Con TYC"
              value={totals?.leadsConTyc ?? 0}
              sub="con términos aceptados"
              color="text-success"
            />
            <Kpi
              label="Sin TYC"
              value={totals?.leadsSinTyc ?? 0}
              sub="sin términos aceptados"
              color="text-warning"
            />
          </>
        ) : (
          <Kpi
            label="Gestionados"
            value={totals?.leadsWithContactAttempt ?? 0}
            sub="con intento de contacto"
            color="text-info"
          />
        )}

        <Kpi
          label="C. Efectivos"
          value={totals?.leadsWithEffectiveContact ?? 0}
          sub={`${totals?.contactabilityRate?.toFixed(1) ?? '0.0'}% contactabilidad`}
          color="text-primary"
        />

        <Kpi
          label="OB + R2S"
          value={(totals?.obCount ?? 0) + (totals?.r2sCount ?? 0)}
          sub="productividad inbound"
          color="text-success"
          onClick={() => navigate('/leads?stage=OB')}
        />

        <Kpi
          label="Meta acumulada"
          value={totals?.accumulatedTarget ?? 0}
          sub="objetivo del periodo"
          color="text-gray-600"
        />

        <Kpi
          label="Gap"
          value={totals?.gap ?? 0}
          sub="diferencia vs meta"
          color={(totals?.gap ?? 0) >= 0 ? 'text-success' : 'text-danger'}
        />
      </div>

      {/* ── SOB TYC metrics panel ────────────────────────────────────────────── */}
      {showTyc && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-bold text-dark mb-3">Distribución TYC (SOB)</p>
            {(() => {
              const conTyc  = totals?.leadsConTyc  ?? 0
              const sinTyc  = totals?.leadsSinTyc  ?? 0
              const total   = conTyc + sinTyc
              const pctCon  = total > 0 ? (conTyc / total) * 100 : 0
              const pctSin  = total > 0 ? (sinTyc / total) * 100 : 0
              return (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Con TYC</span>
                      <span className="font-semibold text-dark">{conTyc} <span className="text-gray-400 font-normal">({pctCon.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-success" style={{ width: `${pctCon}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Sin TYC</span>
                      <span className="font-semibold text-dark">{sinTyc} <span className="text-gray-400 font-normal">({pctSin.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${pctSin}%` }} />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-bold text-dark mb-3">Productividad SOB</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">OB</span>
                <span className="text-2xl font-extrabold text-indigo-600">{totals?.obCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">OK R2S</span>
                <span className="text-2xl font-extrabold text-success">{totals?.r2sCount ?? 0}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total Productividad</span>
                <span className="text-2xl font-extrabold text-primary">
                  {(totals?.obCount ?? 0) + (totals?.r2sCount ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Hunter table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-dark">
            Rendimiento por hunter ({teamRows.length})
            {sourceFilter !== 'all' && (
              <span className={cn(
                'ml-2 px-2 py-0.5 rounded-full text-xs font-semibold',
                sourceFilter === 'SOB' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
              )}>
                {sourceFilter}
              </span>
            )}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {baseCols.map((col) => (
                  <SortTh
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={handleSort}
                  />
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {teamRows.length === 0 ? (
                <tr>
                  <td colSpan={baseCols.length} className="py-8 text-center text-sm text-gray-400">
                    Sin datos para este periodo
                  </td>
                </tr>
              ) : (
                teamRows.map((h) => (
                  <tr key={h.hunterId} className="hover:bg-gray-50 transition-colors">
                    {/* Hunter */}
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium text-dark truncate max-w-[150px]">{h.hunterName}</p>
                      <p className="text-[11px] text-gray-400 truncate max-w-[150px]">{h.hunterEmail}</p>
                    </td>

                    {/* Country */}
                    <td className="px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                      {COUNTRY_FLAG[h.country as Country]} {h.country}
                    </td>

                    {/* Team */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
                        h.team === 'SOB' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
                      )}>
                        {h.team}
                      </span>
                    </td>

                    {/* Asignados */}
                    <td className="px-3 py-2.5 text-sm font-semibold text-dark tabular-nums">
                      {h.totalLeads}
                    </td>

                    {/* Con TYC / Sin TYC — SOB only */}
                    {showTyc && (
                      <>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            'text-sm font-bold tabular-nums',
                            h.leadsConTyc > 0 ? 'text-success' : 'text-gray-400',
                          )}>
                            {h.leadsConTyc}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            'text-sm font-bold tabular-nums',
                            h.leadsSinTyc > 0 ? 'text-warning' : 'text-gray-400',
                          )}>
                            {h.leadsSinTyc}
                          </span>
                        </td>
                      </>
                    )}

                    {/* Gestionados */}
                    <td className="px-3 py-2.5 text-sm font-semibold text-info tabular-nums">
                      {h.leadsWithContactAttempt}
                    </td>

                    {/* C. Efectivos */}
                    <td className="px-3 py-2.5 text-sm font-semibold text-primary tabular-nums">
                      {h.leadsWithEffectiveContact}
                    </td>

                    {/* OB */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        h.obCount > 0 ? 'text-indigo-600' : 'text-gray-400',
                      )}>
                        {h.obCount}
                      </span>
                    </td>

                    {/* R2S */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        h.r2sCount > 0 ? 'text-success' : 'text-gray-400',
                      )}>
                        {h.r2sCount}
                      </span>
                    </td>

                    {/* Productividad (OB + R2S) */}
                    <td className="px-3 py-2.5 text-sm font-bold text-primary tabular-nums">
                      {h.obCount + h.r2sCount}
                    </td>

                    {/* Meta acumulada */}
                    <td className="px-3 py-2.5 text-sm text-gray-500 tabular-nums">
                      {h.accumulatedTarget}
                    </td>

                    {/* Phasing % */}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      <PhasingBar value={h.phasing} />
                    </td>

                    {/* Gap */}
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        h.gap >= 0 ? 'text-success' : 'text-danger',
                      )}>
                        {h.gap >= 0 ? '+' : ''}{h.gap}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Totals footer */}
            {teamRows.length > 1 && totals && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-3 py-3 text-xs font-bold text-gray-500 uppercase" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-3 text-sm font-bold text-dark tabular-nums">{totals.totalLeads}</td>
                  {showTyc && (
                    <>
                      <td className="px-3 py-3 text-sm font-bold text-success tabular-nums">{totals.leadsConTyc}</td>
                      <td className="px-3 py-3 text-sm font-bold text-warning tabular-nums">{totals.leadsSinTyc}</td>
                    </>
                  )}
                  <td className="px-3 py-3 text-sm font-bold text-info tabular-nums">{totals.leadsWithContactAttempt}</td>
                  <td className="px-3 py-3 text-sm font-bold text-primary tabular-nums">{totals.leadsWithEffectiveContact}</td>
                  <td className="px-3 py-3 text-sm font-bold text-indigo-600 tabular-nums">{totals.obCount}</td>
                  <td className="px-3 py-3 text-sm font-bold text-success tabular-nums">{totals.r2sCount}</td>
                  <td className="px-3 py-3 text-sm font-bold text-primary tabular-nums">{totals.obCount + totals.r2sCount}</td>
                  <td className="px-3 py-3 text-sm font-bold text-gray-500 tabular-nums">{totals.accumulatedTarget}</td>
                  <td className="px-3 py-3 text-sm font-bold text-gray-500 tabular-nums">—</td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      totals.gap >= 0 ? 'text-success' : 'text-danger',
                    )}>
                      {totals.gap >= 0 ? '+' : ''}{totals.gap}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  )
}
