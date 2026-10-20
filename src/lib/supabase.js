import { createClient } from '@supabase/supabase-js'

const url =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL)

const key =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY)

if (!url || !key) {
  if (typeof window !== 'undefined') {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables (.env)')
  }
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key')
