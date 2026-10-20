import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Loads data with `fetcher` and reloads it automatically whenever the
 * `tokens` or `doctors` tables change (Supabase Realtime). A slow poll
 * is kept as a safety net in case the realtime connection drops.
 */
export function useLive(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    try {
      setData(await fetcherRef.current())
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load data')
    }
  }, deps)

  useEffect(() => {
    load()
    let timer
    const trigger = () => {
      clearTimeout(timer)
      timer = setTimeout(load, 150) // merge bursts of changes into one reload
    }
    const channel = supabase
      .channel('live-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, trigger)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = setInterval(load, 20000)
    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [load])

  return { data, error, live, reload: load }
}

/** Wraps an async action with busy + error state for buttons. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      return await fn()
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [])
  return { run, busy, error, clearError: () => setError('') }
}
