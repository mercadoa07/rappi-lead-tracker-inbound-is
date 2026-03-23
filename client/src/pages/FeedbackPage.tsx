import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquarePlus, Lightbulb, BarChart3, Bug, HelpCircle,
  Send, Loader2, CheckCircle2, Clock, Eye, XCircle, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedbackType   = 'SUGERENCIA' | 'METRICA' | 'ERROR' | 'OTRO'
type FeedbackStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESCARTADO'

interface FeedbackEntry {
  id:          string
  userId:      string
  type:        FeedbackType
  title:       string
  description: string
  status:      FeedbackStatus
  adminNotes?: string
  createdAt:   string
  userName?:   string
  userRole?:   string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  SUGERENCIA: { label: 'Sugerencia',     icon: Lightbulb,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
  METRICA:    { label: 'Nueva metrica',  icon: BarChart3,  color: 'text-purple-600', bg: 'bg-purple-50' },
  ERROR:      { label: 'Reportar error', icon: Bug,        color: 'text-danger',     bg: 'bg-red-50'    },
  OTRO:       { label: 'Otro',           icon: HelpCircle, color: 'text-gray-600',   bg: 'bg-gray-50'   },
}

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  PENDIENTE:   { label: 'Pendiente',   icon: Clock,        color: 'text-warning',  bg: 'bg-warning/10' },
  EN_REVISION: { label: 'En revision', icon: Eye,          color: 'text-info',     bg: 'bg-info/10'    },
  RESUELTO:    { label: 'Resuelto',    icon: CheckCircle2, color: 'text-success',  bg: 'bg-success/10' },
  DESCARTADO:  { label: 'Descartado',  icon: XCircle,      color: 'text-gray-400', bg: 'bg-gray-100'   },
}

const ALL_TYPES:    FeedbackType[]   = ['SUGERENCIA', 'METRICA', 'ERROR', 'OTRO']
const ALL_STATUSES: FeedbackStatus[] = ['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESCARTADO']

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useFeedbackList() {
  return useQuery<FeedbackEntry[]>({
    queryKey: ['feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('*, profiles!user_id(full_name, role)')
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data ?? []).map((row: Record<string, unknown>) => {
        const profile = row.profiles as Record<string, unknown> | null
        return {
          id:          row.id as string,
          userId:      row.user_id as string,
          type:        row.type as FeedbackType,
          title:       row.title as string,
          description: row.description as string,
          status:      row.status as FeedbackStatus,
          adminNotes:  (row.admin_notes as string) ?? undefined,
          createdAt:   row.created_at as string,
          userName:    (profile?.full_name as string) ?? 'Usuario',
          userRole:    (profile?.role as string) ?? '',
        }
      })
    },
    staleTime: 30_000,
  })
}

function useCreateFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { type: FeedbackType; title: string; description: string }) => {
      const { data: session } = await supabase.auth.getUser()
      const userId = session.user?.id
      if (!userId) throw new Error('No autenticado')

      const { error } = await supabase.from('feedback').insert({
        user_id:     userId,
        type:        body.type,
        title:       body.title,
        description: body.description,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

function useUpdateFeedbackStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: FeedbackStatus; adminNotes?: string }) => {
      const patch: Record<string, unknown> = { status }
      if (adminNotes !== undefined) patch.admin_notes = adminNotes
      const { error } = await supabase.from('feedback').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

// ─── New feedback form ────────────────────────────────────────────────────────

function NewFeedbackForm({ onSuccess }: { onSuccess: () => void }) {
  const [type,        setType]        = useState<FeedbackType>('SUGERENCIA')
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const mutation = useCreateFeedback()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      toast.error('Completa todos los campos')
      return
    }
    try {
      await mutation.mutateAsync({ type, title: title.trim(), description: description.trim() })
      toast.success('Enviado correctamente')
      setTitle('')
      setDescription('')
      setType('SUGERENCIA')
      onSuccess()
    } catch {
      toast.error('Error al enviar')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-medium shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-bold text-dark flex items-center gap-2">
        <MessageSquarePlus size={16} className="text-primary" />
        Nuevo comentario
      </h2>

      {/* Type selector */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Tipo</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_TYPES.map((t) => {
            const cfg  = TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all',
                  type === t
                    ? `border-current ${cfg.color} ${cfg.bg}`
                    : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                <Icon size={16} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">
          Titulo
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Agregar filtro por fecha en reportes"
          className="w-full h-9 px-3 rounded-xl border border-gray-medium text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">
          Descripcion
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe con detalle que necesitas, que problema encontraste, o que metrica te gustaria ver..."
          className="w-full px-3 py-2.5 rounded-xl border border-gray-medium text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        />
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || !title.trim() || !description.trim()}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        Enviar
      </button>
    </form>
  )
}

// ─── Feedback card ────────────────────────────────────────────────────────────

function FeedbackCard({ entry, isAdmin }: { entry: FeedbackEntry; isAdmin: boolean }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const updateStatus = useUpdateFeedbackStatus()
  const typeCfg      = TYPE_CONFIG[entry.type]
  const statusCfg    = STATUS_CONFIG[entry.status]
  const TypeIcon     = typeCfg.icon
  const StatusIcon   = statusCfg.icon

  const handleStatusChange = async (newStatus: FeedbackStatus) => {
    setShowStatusMenu(false)
    try {
      await updateStatus.mutateAsync({ id: entry.id, status: newStatus })
      toast.success(`Estado actualizado a ${STATUS_CONFIG[newStatus].label}`)
    } catch {
      toast.error('Error al actualizar estado')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-medium shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', typeCfg.bg)}>
            <TypeIcon size={18} className={typeCfg.color} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dark">{entry.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', typeCfg.bg, typeCfg.color)}>
                {typeCfg.label}
              </span>
              <span className="text-xs text-gray-400">
                {entry.userName} ({entry.userRole})
              </span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(parseISO(entry.createdAt), { addSuffix: true, locale: es })}
              </span>
            </div>
          </div>
        </div>

        {/* Status badge / dropdown */}
        <div className="relative shrink-0">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowStatusMenu((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                statusCfg.bg, statusCfg.color,
              )}
            >
              <StatusIcon size={12} />
              {statusCfg.label}
              <ChevronDown size={10} />
            </button>
          ) : (
            <span className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              statusCfg.bg, statusCfg.color,
            )}>
              <StatusIcon size={12} />
              {statusCfg.label}
            </span>
          )}

          {showStatusMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-medium rounded-xl shadow-xl z-40 py-1 w-40">
              {ALL_STATUSES.map((s) => {
                const sCfg  = STATUS_CONFIG[s]
                const SIcon = sCfg.icon
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left',
                      entry.status === s && 'font-bold',
                    )}
                  >
                    <SIcon size={14} className={sCfg.color} />
                    {sCfg.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
        {entry.description}
      </p>

      {entry.adminNotes && (
        <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Respuesta del admin</p>
          <p className="text-sm text-gray-600">{entry.adminNotes}</p>
        </div>
      )}
    </div>
  )
}

// ─── FeedbackPage ─────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const { user } = useAuth()
  const { data: entries = [], isLoading } = useFeedbackList()
  const [showForm,      setShowForm]      = useState(false)
  const [filterStatus,  setFilterStatus]  = useState<FeedbackStatus | ''>('')

  const isAdmin = user?.role === 'ADMIN'

  const filtered = filterStatus
    ? entries.filter((e) => e.status === filterStatus)
    : entries

  const countByStatus = {
    total:      entries.length,
    pendiente:  entries.filter((e) => e.status === 'PENDIENTE').length,
    enRevision: entries.filter((e) => e.status === 'EN_REVISION').length,
    resuelto:   entries.filter((e) => e.status === 'RESUELTO').length,
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-dark flex items-center gap-2">
            <MessageSquarePlus size={22} className="text-primary" />
            Buzzon de sugerencias — Inbound
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Comparte ideas, solicita metricas o reporta problemas de la herramienta
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-dark transition-colors"
        >
          <MessageSquarePlus size={16} />
          {showForm ? 'Cerrar' : 'Nuevo'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: countByStatus.total,      color: 'text-dark'    },
          { label: 'Pendientes',  value: countByStatus.pendiente,  color: 'text-warning' },
          { label: 'En revision', value: countByStatus.enRevision, color: 'text-info'    },
          { label: 'Resueltos',   value: countByStatus.resuelto,   color: 'text-success' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-medium p-3 text-center">
            <p className="text-xs text-gray-400">{label}</p>
            <p className={cn('text-2xl font-extrabold mt-0.5', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* New feedback form */}
      {showForm && (
        <NewFeedbackForm onSuccess={() => setShowForm(false)} />
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
            !filterStatus
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-white border-gray-medium text-gray-500 hover:border-gray-400',
          )}
        >
          Todos
        </button>
        {ALL_STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s]
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                filterStatus === s
                  ? `${cfg.bg} border-current ${cfg.color}`
                  : 'bg-white border-gray-medium text-gray-500 hover:border-gray-400',
              )}
            >
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-medium p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-48" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-medium py-16 text-center">
          <MessageSquarePlus size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">
            {entries.length === 0
              ? 'Aun no hay comentarios. Se el primero en compartir una idea!'
              : 'No hay comentarios con este filtro'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <FeedbackCard key={entry.id} entry={entry} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}
