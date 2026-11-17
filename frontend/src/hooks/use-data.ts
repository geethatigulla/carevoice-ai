/** Reads — supabase-js under RLS, cached with TanStack Query, refreshed by Realtime. */
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { AGENT_META } from '@/lib/agents'
import { requireSupabase } from '@/lib/supabase'
import type {
  AgentRow,
  AppointmentRow,
  CallHistoryRow,
  Department,
  DoctorRow,
  LiveCallRow,
  Membership,
  PatientRow,
  SlotRow,
} from '@/lib/types'

export const ACTIVE_APPOINTMENT = ['booked', 'confirmed', 'checked_in', 'completed', 'no_show'] as const

export const queryKeys = {
  membership: ['membership'] as const,
  agents: ['agents'] as const,
  liveCalls: ['calls', 'live'] as const,
  departments: ['departments'] as const,
  doctors: ['doctors'] as const,
  slots: (dayIso: string) => ['slots', dayIso] as const,
  appointments: (dayIso: string) => ['appointments', 'day', dayIso] as const,
  patients: (search: string, lang: string) => ['patients', search, lang] as const,
  patient: (id: string) => ['patient', id] as const,
  patientAppointments: (id: string) => ['appointments', 'patient', id] as const,
  patientCalls: (id: string) => ['calls', 'patient', id] as const,
}

const APPOINTMENT_SELECT =
  'id, status, source, reason, starts_at, checked_in_at, patient_id, doctor_id, ' +
  'patient:patients(id, name, phone, preferred_language), ' +
  'doctor:doctors(id, name, department:departments(name)), slot:appointment_slots(ends_at)'

export function useMembership() {
  return useQuery({
    queryKey: queryKeys.membership,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('staff')
        .select('role, full_name, tenant:tenants(id, name, city)')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as unknown as Membership | null
    },
  })
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('agents').select('id, type, display_name, enabled, config')
      if (error) throw error
      return (data as AgentRow[]).sort((a, b) => (AGENT_META[a.type]?.order ?? 99) - (AGENT_META[b.type]?.order ?? 99))
    },
  })
}

export function useLiveCalls() {
  return useQuery({
    queryKey: queryKeys.liveCalls,
    refetchInterval: 60_000, // Realtime drives updates; this is a safety net if the socket drops
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('calls')
        .select(
          'id, direction, channel, agent_type, status, languages, intent, current_stage, from_number, to_number, started_at, patient:patients(name)',
        )
        .eq('status', 'live')
        .order('started_at', { ascending: true })
      if (error) throw error
      return data as unknown as LiveCallRow[]
    },
  })
}




// ---- Directory -------------------------------------------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.departments,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('departments').select('id, name, name_te, name_hi').eq('is_active', true).order('name')
      if (error) throw error
      return data as Department[]
    },
  })
}

export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('doctors')
        .select('id, name, name_te, name_hi, qualification, languages_spoken, fee, schedule, slot_minutes, is_active, department:departments(id, name, name_te, name_hi)')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as unknown as DoctorRow[]
    },
  })
}

/** All slots (any status) for one IST day, for availability bars and the calendar background. */
export function useDaySlots(day: Date) {
  const start = day.toISOString()
  return useQuery({
    queryKey: queryKeys.slots(start),
    queryFn: async () => {
      const end = new Date(day.getTime() + 86_400_000).toISOString()
      const { data, error } = await requireSupabase()
        .from('appointment_slots')
        .select('doctor_id, starts_at, ends_at, status')
        .gte('starts_at', start)
        .lt('starts_at', end)
        .order('starts_at')
        .limit(5000)
      if (error) throw error
      return data as SlotRow[]
    },
  })
}

export function useDayAppointments(day: Date) {
  const start = day.toISOString()
  return useQuery({
    queryKey: queryKeys.appointments(start),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const end = new Date(day.getTime() + 86_400_000).toISOString()
      const { data, error } = await requireSupabase()
        .from('appointments')
        .select(APPOINTMENT_SELECT)
        .gte('starts_at', start)
        .lt('starts_at', end)
        .not('status', 'in', '(rescheduled)')
        .order('starts_at')
      if (error) throw error
      return data as unknown as AppointmentRow[]
    },
  })
}

// ---- Patients --------------------------------------------------------------------

/** Keep only characters that are safe inside a PostgREST `or=(...)` filter. */
function sanitizeSearch(q: string) {
  return q.replace(/[^\p{L}\p{N}\s+-]/gu, '').trim()
}

export function usePatients(search: string, lang: string) {
  return useQuery({
    queryKey: queryKeys.patients(search, lang),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = requireSupabase()
        .from('patients')
        .select('id, mrn, name, phone, dob, gender, preferred_language, caregiver_name, caregiver_phone, opt_out, dnd, notes, created_at', {
          count: 'exact',
        })
        .order('name')
        .limit(200)
      const s = sanitizeSearch(search)
      if (s) {
        const digits = s.replace(/\D/g, '')
        const ors = [`name.ilike.%${s}%`, `mrn.ilike.%${s}%`]
        if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`)
        q = q.or(ors.join(','))
      }
      if (lang !== 'all') q = q.eq('preferred_language', lang)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: data as PatientRow[], total: count ?? data.length }
    },
  })
}

export function usePatientAppointments(patientId: string | null) {
  return useQuery({
    queryKey: queryKeys.patientAppointments(patientId ?? ''),
    enabled: Boolean(patientId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('appointments')
        .select(APPOINTMENT_SELECT)
        .eq('patient_id', patientId!)
        .order('starts_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as AppointmentRow[]
    },
  })
}

export function usePatientCalls(patientId: string | null) {
  return useQuery({
    queryKey: queryKeys.patientCalls(patientId ?? ''),
    enabled: Boolean(patientId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('calls')
        .select('id, direction, channel, agent_type, status, intent, outcome, languages, started_at, duration_sec')
        .eq('patient_id', patientId!)
        .order('started_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as CallHistoryRow[]
    },
  })
}
