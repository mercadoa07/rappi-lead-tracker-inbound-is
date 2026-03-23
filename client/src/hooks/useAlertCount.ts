import { useQuery } from '@tanstack/react-query'
import { alertsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

export function useAlertCount() {
  const { isAuthenticated } = useAuth()

  const { data } = useQuery({
    queryKey: ['alerts', 'count'],
    queryFn:  alertsApi.getUnreadCount,
    enabled:  isAuthenticated,
    refetchInterval: 60_000, // cada minuto
  })

  return data ?? 0
}
