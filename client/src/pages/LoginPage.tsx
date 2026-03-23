import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'

const loginSchema = z.object({
  email:    z.string().min(1, 'El email es requerido').email('Ingresa un email válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { login }                       = useAuth()
  const navigate                        = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading,    setIsLoading]    = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      await login(data.email, data.password)
      navigate('/gestion', { replace: true })
    } catch {
      toast.error('Error al iniciar sesión. Verifica tus credenciales.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel izquierdo: Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-[#FF441F] relative overflow-hidden">
        <div className="absolute -top-20 -left-20 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-black/10" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <h1 className="text-7xl font-extrabold text-white tracking-tight">Rappi</h1>
          <div className="h-1 w-16 rounded-full bg-white/60" />
          <h2 className="text-2xl font-bold text-white">Lead Tracker</h2>
          <div className="px-4 py-1.5 rounded-full bg-white/20 border border-white/30">
            <span className="text-sm font-bold text-white tracking-widest uppercase">INBOUND</span>
          </div>
          <p className="max-w-sm text-base text-white/80 leading-relaxed">
            Gestiona, monitorea y convierte tus leads Inbound (SDR y SOB) de manera
            eficiente con la plataforma interna de Rappi.
          </p>
        </div>
      </div>

      {/* Panel derecho: Formulario */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-[#F5F5F5] px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden text-center">
            <h1 className="text-4xl font-extrabold text-[#FF441F]">Rappi</h1>
            <p className="text-sm text-gray-500 mt-1">Lead Tracker — Inbound</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-black">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-gray-500">
              Ingresa tus credenciales para acceder a la herramienta de gestión Inbound
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-all duration-200 bg-white ${
                  errors.email
                    ? 'border-[#FF4242] ring-2 ring-[#FF4242]/20'
                    : 'border-gray-200 focus-within:border-[#FF441F] focus-within:ring-2 focus-within:ring-[#FF441F]/20'
                }`}
              >
                <Mail className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  placeholder="tu@rappi.com"
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-black placeholder-gray-400 outline-none"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="mt-0.5 text-xs text-[#FF4242] font-medium">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-all duration-200 bg-white ${
                  errors.password
                    ? 'border-[#FF4242] ring-2 ring-[#FF4242]/20'
                    : 'border-gray-200 focus-within:border-[#FF441F] focus-within:ring-2 focus-within:ring-[#FF441F]/20'
                }`}
              >
                <Lock className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-transparent text-sm text-black placeholder-gray-400 outline-none"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="shrink-0 text-gray-400 hover:text-[#FF441F] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-0.5 text-xs text-[#FF4242] font-medium">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-xl bg-[#FF441F] py-3.5 text-sm font-bold text-white transition-all duration-200 hover:bg-[#e63a17] hover:shadow-lg hover:shadow-[#FF441F]/25 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Rappi Lead Tracker — Herramienta de gestión Inbound
          </p>
        </div>
      </div>
    </div>
  )
}
