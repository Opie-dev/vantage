/**
 * The single source of app state.
 *
 * main.jsx wraps <App/> in <VantageProvider/>. Every screen reads the world
 * through `useVantage()` — there is one /api/state payload, one loading flag,
 * and every write goes through a mutator here so the state reload and the toast
 * happen in exactly one place (the legacy app's `post()` helper, promoted).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as api from './api'
import { EMPTY_STATE, incomeOutlook } from './calc'

export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'positions', label: 'Positions' },
  { id: 'instruments', label: 'Instruments' },
  { id: 'history', label: 'History' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'goals', label: 'Goals' },
  { id: 'assets', label: 'Assets' },
  { id: 'money', label: 'Money' },
  { id: 'settings', label: 'Settings' },
]

const VantageContext = createContext(null)

/**
 * @returns {{
 *   state: object, loading: boolean, refreshing: boolean, error: string|null,
 *   fx: number, ready: boolean, reload: () => Promise<void>,
 *   tab: string, setTab: (id: string) => void,
 *   modal: {kind: string, prefill: object}|null, closeModal: () => void,
 *   openInstrument: () => void,
 *   openTransaction: (prefill?: object) => void,
 *   openCash: (prefill?: object) => void,
 *   addInstrument: (body: object) => Promise<boolean>,
 *   addTransaction: (body: object) => Promise<boolean>,
 *   deleteTransaction: (id: number) => Promise<boolean>,
 *   addCash: (body: object) => Promise<boolean>,
 *   addGoal: (body: object) => Promise<boolean>,
 *   addAsset: (body: object) => Promise<boolean>,
 *   updateAsset: (id: number, body: object) => Promise<boolean>,
 *   deleteAsset: (id: number) => Promise<boolean>,
 *   addAssetEntry: (assetId: number, body: object) => Promise<boolean>,
 *   deleteAssetEntry: (assetId: number, entryId: number) => Promise<boolean>,
 *   openAsset: () => void,
 *   openAssetEntry: (prefill?: object) => void,
 *   openCommitment: () => void,
 *   openIncome: () => void,
 *   openIncomeEvent: (prefill?: object) => void,
 *   addIncomeSource: (body: object) => Promise<boolean>,
 *   addIncomeEvent: (sourceId: number, body: object) => Promise<boolean>,
 *   addCommitment: (body: object) => Promise<boolean>,
 *   updateCommitment: (id: number, body: object) => Promise<boolean>,
 *   deleteCommitment: (id: number) => Promise<boolean>,
 *   updateGoal: (id: number, body: object) => Promise<boolean>,
 *   deleteGoal: (id: number) => Promise<boolean>,
 *   setManualPrice: (body: object) => Promise<boolean>,
 *   refreshPrices: () => Promise<boolean>,
 *   pricesPending: boolean,
 *   syncMoomoo: () => Promise<boolean>,
 *   syncPending: boolean,
 * }}
 */
export function useVantage() {
  const ctx = useContext(VantageContext)
  if (!ctx) throw new Error('useVantage() must be used inside <VantageProvider>')
  return ctx
}

const hashTab = () => {
  const h = String(window.location.hash || '').replace(/^#\/?/, '')
  return TABS.some(t => t.id === h) ? h : TABS[0].id
}

/**
 * Payments the funds have declared whose day has arrived without moomoo booking
 * them — the state a sync cannot fix and must not paper over.
 *
 * The broker updates a balance the moment money lands but only publishes the
 * cash-flow row at clearing, hours later. A sync in that window imports nothing,
 * and "already up to date" is the wrong thing to say when the owner is looking
 * at the payment in their moomoo app. Derived from state rather than from a
 * balance delta, so it stays true across repeated syncs instead of only the
 * first one after the money moved.
 */
function declaredButUnbooked(S) {
  if (!S) return []
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return incomeOutlook(S, now.getFullYear(), now.getMonth())
    .dates.filter(d => d.declared && d.date <= today)
}

export function VantageProvider({ children }) {
  const [state, setState] = useState(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(false)
  const [modal, setModal] = useState(null)
  const [pricesPending, setPricesPending] = useState(false)
  const [syncPending, setSyncPending] = useState(false)
  const [tab, setTabState] = useState(hashTab)

  // Mutators need the newest instrument list without re-creating themselves.
  const latest = useRef(state)
  latest.current = state

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await api.getState()
      setState(next)
      setError(null)
      setLocked(false)
      return next
    } catch (e) {
      // A 401 is not a failure to report — it means the app is locked and the
      // owner needs to type the PIN, so it gets its own screen, not an error one.
      if (e.status === 401) {
        setLocked(true)
        setError(null)
      } else {
        setError(e.message)
      }
      throw e
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  // Deep-link each tab so a refresh keeps the owner where they were.
  useEffect(() => {
    const onHash = () => setTabState(hashTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setTab = useCallback(id => {
    setTabState(id)
    if (hashTab() !== id) window.location.hash = `/${id}`
  }, [])

  /** Run a write, reload state, toast the outcome. Returns true on success. */
  const mutate = useCallback(
    async (fn, successMessage) => {
      try {
        await fn()
        await reload()
        if (successMessage) toast.success(successMessage)
        return true
      } catch (e) {
        toast.error(e.message)
        return false
      }
    },
    [reload],
  )

  /**
   * Merge a display preference and reload. The server owns preferences so they
   * follow the owner between browsers, rather than living in localStorage.
   */
  const setPreference = useCallback(
    patch => mutate(() => api.updatePreferences(patch), null),
    [mutate],
  )

  /** Exchange a PIN for a session, then load. False (and a toast) if rejected. */
  const unlock = useCallback(
    async pin => {
      try {
        await api.login(pin)
        setLocked(false)
        await reload()
        return true
      } catch (e) {
        if (e.status !== 401) toast.error(e.message)
        return false
      }
    },
    [reload],
  )

  /** Drop the session cookie and show the lock screen again. */
  const lock = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setLocked(true)
    }
  }, [])

  const value = useMemo(() => {
    const openTransaction = (prefill = {}) => {
      if (!latest.current.instruments.length) {
        toast.warning('Add an instrument first', { description: 'Use + Instrument, top right.' })
        return
      }
      setModal({ kind: 'transaction', prefill })
    }

    // Same guard as openTransaction: an entry needs something to attach to, and
    // an empty select is a worse answer than being told what is missing.
    const openAssetEntry = (prefill = {}) => {
      if (!latest.current.assets.length) {
        toast.warning('Add an account first', { description: 'ASB, Tabung Haji or EPF, from the Assets screen.' })
        return
      }
      setModal({ kind: 'assetEntry', prefill })
    }

    // Same guard as openAssetEntry: a payment needs something to attach to,
    // and an empty select is a worse answer than being told what is missing.
    const openIncomeEvent = (prefill = {}) => {
      if (!latest.current.incomeSources.length) {
        toast.warning('Add an income source first', {
          description: 'A salary or a client, from the Money screen.',
        })
        return
      }
      setModal({ kind: 'incomeEvent', prefill })
    }

    const syncMoomoo = async () => {
      setSyncPending(true)
      const id = toast.loading('Asking moomoo…', {
        description: 'Positions, deals, dividends and quotes. This takes a moment.',
      })
      try {
        const { counts } = await api.syncMoomoo()
        const fresh = await reload()
        // Say what actually arrived. "Synced" alone is what you show when you do
        // not know, and after a dividend lands the owner wants the number.
        const news = [
          [counts.dividends, 'dividend'],
          [counts.orders, 'new trade'],
          [counts.cash, 'cash movement'],
          [counts.distributions, 'declaration'],
        ]
          .filter(([n]) => n > 0)
          .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
        // Nothing new does not mean nothing is owed. Two ways to know moomoo is
        // behind its own ledger, in order of how specific they are.
        const overdue = news.length ? [] : declaredButUnbooked(fresh)
        const drift = counts.unexplainedCash || []
        if (overdue.length) {
          const who = [...new Set(overdue.flatMap(d => d.parts.map(x => x.ticker)))].join(', ')
          toast.info(`${who} has paid you — moomoo has not published it yet`, {
            id,
            duration: 12000,
            description:
              'It is in your cash balance and on the dashboard as declared, but the ledger row ' +
              'moomoo fills in at clearing has not appeared, so it cannot reach History yet. ' +
              'Nothing is lost; sync again later and it will land.',
          })
        } else if (drift.length) {
          toast.info('Your cash moved, but moomoo has not published it yet', {
            id,
            duration: 12000,
            description:
              `${drift.map(d => `${d.currency} ${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)}`).join(', ')} ` +
              'is in your balance with no ledger entry behind it — moomoo fills that in at ' +
              'clearing, usually later the same day. Sync again then and it will land.',
          })
        } else {
          toast.success(news.length ? news.join(', ') : 'Already up to date', {
            id,
            description: `${counts.positions} positions and ${counts.quotes} quotes refreshed`,
          })
        }
        return true
      } catch (e) {
        // A 503 is the agent being off, which is a thing to go and fix, not a
        // failure of the sync — so it keeps its own wording and stays on screen.
        toast.error(e.status === 503 ? 'moomoo sync is not listening' : 'Sync failed', {
          id,
          description: e.message,
          duration: e.status === 503 ? 12000 : 6000,
        })
        return false
      } finally {
        setSyncPending(false)
      }
    }

    const refreshPrices = async () => {
      setPricesPending(true)
      const id = toast.loading('Fetching quotes…')
      try {
        const { results } = await api.refreshPrices()
        const ok = results.filter(r => r.ok)
        const bad = results.filter(r => !r.ok)
        await reload()
        if (!results.length) {
          toast.warning('No instrument has a Yahoo symbol yet', { id })
        } else if (bad.length) {
          toast.warning(`${ok.length} updated`, { id, description: `Failed: ${bad.map(b => b.ticker).join(', ')}` })
        } else {
          toast.success(`${ok.length} quote${ok.length === 1 ? '' : 's'} updated`, { id })
        }
        return true
      } catch (e) {
        toast.error(e.message, { id })
        return false
      } finally {
        setPricesPending(false)
      }
    }

    return {
      state,
      loading,
      refreshing,
      error,
      locked,
      unlock,
      lock,
      setPreference,
      ready: !loading && !error && !locked,
      fx: state.fx,
      reload,

      tab,
      setTab,

      modal,
      closeModal: () => setModal(null),
      openInstrument: () => setModal({ kind: 'instrument', prefill: {} }),
      openTransaction,
      openCash: (prefill = {}) => setModal({ kind: 'cash', prefill }),
      openAsset: () => setModal({ kind: 'asset', prefill: {} }),
      openCommitment: () => setModal({ kind: 'commitment', prefill: {} }),
      openIncome: () => setModal({ kind: 'income', prefill: {} }),
      openIncomeEvent,
      openAssetEntry,

      addInstrument: body => mutate(() => api.addInstrument(body), `${body.ticker} added`),
      addTransaction: body => mutate(() => api.addTransaction(body), 'Transaction saved'),
      deleteTransaction: id => mutate(() => api.deleteTransaction(id), 'Transaction removed'),
      addCash: body => mutate(() => api.addCash(body), 'Cash movement saved'),
      addGoal: body => mutate(() => api.addGoal(body), 'Goal added'),
      addAsset: body => mutate(() => api.addAsset(body), `${body.name} added`),
      addCommitment: body => mutate(() => api.addCommitment(body), `${body.name} added`),
      addIncomeSource: body => mutate(() => api.addIncomeSource(body), `${body.name} added`),
      addIncomeEvent: (sourceId, body) => mutate(() => api.addIncomeEvent(sourceId, body), 'Payment recorded'),
      deleteIncomeEvent: (sourceId, eventId) =>
        mutate(() => api.deleteIncomeEvent(sourceId, eventId), 'Payment removed'),
      updateCommitment: (id, body) => mutate(() => api.updateCommitment(id, body), null),
      deleteCommitment: id => mutate(() => api.deleteCommitment(id), 'Commitment removed'),
      updateAsset: (id, body) => mutate(() => api.updateAsset(id, body), null),
      deleteAsset: id => mutate(() => api.deleteAsset(id), 'Account removed'),
      addAssetEntry: (assetId, body) => mutate(() => api.addAssetEntry(assetId, body), 'Entry saved'),
      deleteAssetEntry: (assetId, entryId) =>
        mutate(() => api.deleteAssetEntry(assetId, entryId), 'Entry removed'),
      updateGoal: (id, body) => mutate(() => api.updateGoal(id, body), null),
      deleteGoal: id => mutate(() => api.deleteGoal(id), 'Goal removed'),
      setManualPrice: body => mutate(() => api.setManualPrice(body), 'Price updated'),
      refreshPrices,
      pricesPending,
      syncMoomoo,
      syncPending,
    }
  }, [state, loading, refreshing, error, locked, unlock, lock, setPreference, reload, tab, setTab, modal, mutate, pricesPending, syncPending])

  return <VantageContext.Provider value={value}>{children}</VantageContext.Provider>
}
