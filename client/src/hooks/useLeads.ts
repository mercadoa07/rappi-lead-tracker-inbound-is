import { useQuery } from '@tanstack/react-query'
import { leadsApi } from '../services/api'
import type { FunnelStage, Country, LeadSource } from '../types'

interface UseLeadsParams {
  search?:    string
  stage?:     FunnelStage[]
  country?:   Country
  source?:    LeadSource
  opsZone?:   string
  assigned?:  'all' | 'assigned' | 'unassigned'
  dateFrom?:  string
  dateTo?:    string
  page?:      number
  limit?:     number
  sortBy?:    string
  sortOrder?: 'asc' | 'desc'
}

export function useLeads(params: UseLeadsParams = {}) {
  const { page = 1, limit = 50, ...rest } = params

  return useQuery({
    queryKey: ['leads', { ...rest, page, limit }],
    queryFn:  () => leadsApi.getLeads({ ...rest, page, limit }),
    staleTime: 30_000,
  })
}
