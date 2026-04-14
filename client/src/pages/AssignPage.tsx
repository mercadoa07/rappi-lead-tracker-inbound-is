import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Search, X, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { supabase } from '../lib/supabase'
import { leadsApi, profilesApi } from '../services/api'
import { cn } from '../utils/cn'
import { COUNTRIES, STAGE_LABEL } from '../utils/constants'
import type { Country, Lead, LeadSource, FunnelStage, User } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRY_NAME: Record<Country, string> = {
  CO: 'Colombia', MX: 'México', AR: 'Argentina',
  PE: 'Perú', CL: 'Chile', EC: 'Ecuador',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceFilter = 'SDR' | 'SOB' | 'Todos'

// ─── useMyHunters ─────────────────────────────────────────────────────────────

function useMyHunters(source: SourceFilter) {
  const { user } = useAuth()

  return useQuery<User[]>({
    queryKey: ['my-hunters-inbound', user?.id, source],
    queryFn: async () => {
      if (!user?.id) return []

      const sourceFilter: LeadSource | undefined =
        source === 'Todos' ? undefined : source

      let query = supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .eq('role', 'HUNTER')
        .order('full_name')

      if (sourceFilter) query = query.eq('team', sourceFilter)

      // LIDER ve todos los hunters de su mismo país (no solo leader_id)
      // ADMIN ve todos sin restricción
      if (user.role === 'LIDER' && user.country) {
        query = query.eq('country', user.country)
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((p) => ({
        id:          p.id,
        email:       p.email,
        fullName:    p.full_name,
        role:        p.role,
        country:     p.country as Country,
        team:        p.team ?? 'SDR',
        dailyTarget: p.daily_target ?? 4,
        isActive:    p.is_active ?? true,
        leaderId:    p.leader_id ?? undefined,
      } as User))
    },
    staleTime: 60_000,
    enabled: !!user,
  })
}

// ─── useOwners (hunters + supervisores) ───────────────────────────────────────

function useOwners() {
  const { user } = useAuth()

  return useQuery<User[]>({
    queryKey: ['owners-for-filter', user?.id],
    queryFn: async () => {
      if (!user?.id) return []

      // Trae HUNTER y LIDER activos
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .in('role', ['HUNTER', 'LIDER'])
        .order('full_name')

      // LIDER ve todos los del mismo país + sí mismo; ADMIN ve todos
      if (user.role === 'LIDER' && user.country) {
        query = query.or(`country.eq.${user.country},id.eq.${user.id}`)
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((p) => ({
        id:          p.id,
        email:       p.email,
        fullName:    p.full_name,
        role:        p.role,
        country:     p.country as Country,
        team:        p.team ?? 'SDR',
        dailyTarget: p.daily_target ?? 4,
        isActive:    p.is_active ?? true,
        leaderId:    p.leader_id ?? undefined,
      } as User))
    },
    staleTime: 60_000,
    enabled: !!user,
  })
}

// ─── TYC badge ────────────────────────────────────────────────────────────────

function TycBadge({ tyc }: { tyc?: string }) {
  if (!tyc) return null
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 ml-1">
      TYC
    </span>
  )
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold',
        source === 'SDR'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-amber-100 text-amber-700',
      )}
    >
      {source}
    </span>
  )
}

// ─── AssignPage ───────────────────────────────────────────────────────────────

export default function AssignPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const isAdmin   = user?.role === 'ADMIN'

  const [search,           setSearch]           = useState('')
  const [country,          setCountry]          = useState<Country | ''>('')
  const [sourceFilter,     setSourceFilter]     = useState<SourceFilter>('Todos')
  const [page,             setPage]             = useState(1)
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'unassigned' | 'assigned'>('unassigned')
  const [ownerFilter,      setOwnerFilter]      = useState('')

  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [bulkHunter,  setBulkHunter]  = useState('')
  const [assigning,   setAssigning]   = useState(false)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, country, sourceFilter, assignmentFilter, ownerFilter])

  const { data, isLoading } = useLeads({
    search:       search  || undefined,
    country:      country || undefined,
    source:       sourceFilter !== 'Todos' ? sourceFilter : undefined,
    assigned:     assignmentFilter === 'all' ? undefined : assignmentFilter,
    assignedToId: ownerFilter || undefined,
    page,
    limit:        20,
    sortBy:       'assignedAt',
    sortOrder:    'desc',
  })

  const { data: hunters = [] } = useMyHunters(sourceFilter)
  const { data: owners  = [] } = useOwners()

  const leads      = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map((l) => l.id)))
    }
  }

  const assignSingle = async (leadId: string, hunterId: string) => {
    try {
      await leadsApi.updateLead(leadId, { assignedToId: hunterId, assignedAt: new Date().toISOString() })
      toast.success('Lead asignado correctamente')
      qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? 'Error al asignar')
    }
  }

  const assignBulk = async () => {
    if (!bulkHunter || selected.size === 0) return
    setAssigning(true)
    let ok   = 0
    let fail = 0
    for (const leadId of selected) {
      try {
        await leadsApi.updateLead(leadId, { assignedToId: bulkHunter, assignedAt: new Date().toISOString() })
        ok++
      } catch {
        fail++
      }
    }
    setAssigning(false)
    qc.invalidateQueries({ queryKey: ['leads'] })
    setSelected(new Set())
    setBulkHunter('')
    if (fail === 0) {
      toast.success(`${ok} lead${ok !== 1 ? 's' : ''} asignado${ok !== 1 ? 's' : ''} correctamente`)
    } else {
      toast.warning(`${ok} asignados, ${fail} error${fail !== 1 ? 'es' : ''}`)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

      <div>
        <h1 className="text-2xl font-extrabold text-dark flex items-center gap-2">
          <Users size={22} className="text-primary" />
          Asignar Leads
          <span className="text-base font-semibold text-gray-400">
            ({leads.length}{data?.total != null && data.total !== leads.length ? ` de ${data.total}` : ''})
          </span>
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Asigna y reasigna leads entre hunters del equipo Inbound
        </p>
      </div>

      {/* Assignment filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'unassigned', 'assigned'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setAssignmentFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              assignmentFilter === f
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-white border-gray-medium text-gray-500 hover:border-gray-400',
            )}
          >
            {f === 'all' ? 'Todos' : f === 'unassigned' ? 'Sin asignar' : 'Asignados'}
          </button>
        ))}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Source filter */}
        {(['Todos', 'SDR', 'SOB'] as SourceFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              sourceFilter === s
                ? s === 'SDR'
                  ? 'bg-blue-100 border-blue-400 text-blue-700'
                  : s === 'SOB'
                  ? 'bg-amber-100 border-amber-400 text-amber-700'
                  : 'bg-primary/10 border-primary text-primary'
                : 'bg-white border-gray-medium text-gray-500 hover:border-gray-400',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Search + country + owner */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ID…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-gray-medium text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {isAdmin && (
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as Country | '')}
            className="h-9 px-3 rounded-xl border border-gray-medium text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Todos los países</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{COUNTRY_NAME[c]}</option>
            ))}
          </select>
        )}

        {/* Owner filter */}
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-gray-medium text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Todos los propietarios</option>
          {owners.filter(o => o.role === 'LIDER').length > 0 && (
            <>
              <option disabled>── Supervisores ──</option>
              {owners.filter(o => o.role === 'LIDER').map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({o.country})
                </option>
              ))}
            </>
          )}
          {owners.filter(o => o.role === 'HUNTER').length > 0 && (
            <>
              <option disabled>── Comerciales ──</option>
              {owners.filter(o => o.role === 'HUNTER').map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({o.country})
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-medium shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selected.size === leads.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">País</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Fuente</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Etapa</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Estado asig.</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Asignar a</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-gray-200 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
                : leads.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                      No se encontraron leads
                    </td>
                  </tr>
                )
                : leads.map((lead: Lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      'border-b border-gray-100 hover:bg-gray-50 transition-colors',
                      selected.has(lead.id) && 'bg-primary/5',
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {lead.leadIdExternal}
                      </button>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-medium text-dark truncate">{lead.name}</span>
                        {lead.source === 'SOB' && <TycBadge tyc={lead.tyc} />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{lead.country}</td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-gray-600">
                        {STAGE_LABEL[lead.currentStage as FunnelStage] ?? lead.currentStage}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.assignedTo
                        ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 truncate max-w-[120px]">
                            {lead.assignedTo.fullName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
                            Sin asignar
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) assignSingle(lead.id, e.target.value)
                        }}
                        className="h-8 px-2 rounded-lg border border-gray-medium text-xs text-dark bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-[150px]"
                      >
                        <option value="">{lead.assignedTo ? 'Reasignar…' : 'Asignar…'}</option>
                        {hunters.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.fullName} ({h.country}) [{h.team}]
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-medium text-gray-500 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-medium text-gray-500 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk assignment toolbar */}
      {selected.size > 0 && (() => {
        const selectedLeads = leads.filter((l: Lead) => selected.has(l.id))
        const hasAssigned   = selectedLeads.some((l: Lead) => !!l.assignedTo)
        const hasUnassigned = selectedLeads.some((l: Lead) => !l.assignedTo)
        const bulkLabel     = hasAssigned && hasUnassigned
          ? 'Asignar / Reasignar'
          : hasAssigned ? 'Reasignar' : 'Asignar'
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-dark text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4 min-w-[500px] max-w-[90vw]">
            <div className="flex items-center gap-2 shrink-0">
              <Check size={16} className="text-primary" />
              <span className="text-sm font-semibold">
                {selected.size} lead{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2">
              <span className="text-sm text-white/60 shrink-0">Asignar a:</span>
              <select
                value={bulkHunter}
                onChange={(e) => setBulkHunter(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl border border-white/20 bg-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="" className="text-dark bg-white">Seleccionar hunter…</option>
                {hunters.map((h) => (
                  <option key={h.id} value={h.id} className="text-dark bg-white">
                    {h.fullName} ({h.country}) [{h.team}]
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={assignBulk}
              disabled={!bulkHunter || assigning}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {assigning && <Loader2 size={13} className="animate-spin" />}
              {bulkLabel}
            </button>

            <button
              onClick={() => setSelected(new Set())}
              className="text-white/40 hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )
      })()}
    </div>
  )
}
