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
import { EMPTY_STATE, incomeOutlook, netWorth } from './calc'
import { setPrivate as setFormatPrivate } from './format'

export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'history', label: 'History' },
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
 *   saveDeclaredRate: (body: object) => Promise<boolean>,
 *   deleteDeclaredRate: (id: number) => Promise<boolean>,
 *   updateAsset: (id: number, body: object) => Promise<boolean>,
 *   deleteAsset: (id: number) => Promise<boolean>,
 *   addAssetEntry: (assetId: number, body: object) => Promise<boolean>,
 *   deleteAssetEntry: (assetId: number, entryId: number) => Promise<boolean>,
 *   openAsset: (prefill?: object) => void,
 *   openAssetEntry: (prefill?: object) => void,
 *   openCommitment: (prefill?: object) => void,
 *   openIncome: (prefill?: object) => void,
 *   updateIncomeSource: (id: number, body: object) => Promise<boolean>,
 *   openGoal: () => void,
 *   openIncomeEvent: (prefill?: object) => void,
 *   addIncomeSource: (body: object) => Promise<boolean>,
 *   deleteIncomeSource: (id: number) => Promise<boolean>,
 *   addIncomeEvent: (sourceId: number, body: object) => Promise<boolean>,
 *   addCommitment: (body: object) => Promise<boolean>,
 *   addExpense: (body: object) => Promise<boolean>,
 *   updateExpense: (id: number, body: object) => Promise<boolean>,
 *   deleteExpense: (id: number) => Promise<boolean>,
 *   openExpense: (prefill?: object) => void,
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

/**
 * Tab ids that were retired, and where they went.
 *
 * '#expenses' was a second door into Money for as long as spending had its own
 * screen. The screens are one now and the rail says so, but a bookmark or an
 * open window still carries the old hash, and falling through to the Dashboard
 * would answer a request for the spending log with a portfolio summary.
 *
 * The same is true three times over of Positions, Instruments and Wallet, which
 * are one Portfolio screen now. An old link lands on the screen that answers it
 * rather than on a summary of something else.
 */
const RETIRED_TABS = {
  expenses: 'money',
  positions: 'portfolio',
  instruments: 'portfolio',
  wallet: 'portfolio',
}

const hashTab = () => {
  const h = String(window.location.hash || '').replace(/^#\/?/, '')
  if (TABS.some(t => t.id === h)) return h
  return RETIRED_TABS[h] || TABS[0].id
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

  /**
   * Private mode — every figure renders as '••••'.
   *
   * Read synchronously from localStorage rather than in an effect, because a
   * balance shown for one frame before the effect runs is precisely the failure
   * this is for. Per device, not per owner: it answers "who can see this
   * screen", which is a property of where you are sitting, not of the account —
   * so unlike the display preferences it stays out of the server.
   */
  const [isPrivate, setIsPrivate] = useState(() => {
    try {
      return localStorage.getItem('vantage.private') === '1'
    } catch {
      // Private windows and storage-blocking browsers throw on access. Failing
      // open is right: the toggle still works for the session, and the owner is
      // never locked out of their own figures by a storage policy.
      return false
    }
  })

  // Written during render, not in an effect: children format numbers as they
  // render, and an effect fires after that — which would paint one frame of real
  // figures on every toggle. The write is idempotent and derived purely from
  // state, so re-running it costs nothing.
  setFormatPrivate(isPrivate)

  const togglePrivate = useCallback(() => {
    setIsPrivate(prev => {
      const next = !prev
      try {
        localStorage.setItem('vantage.private', next ? '1' : '0')
      } catch {
        // Nothing to do — the toggle still holds for this session.
      }
      return next
    })
  }, [])

  // Mutators need the newest instrument list without re-creating themselves.
  const latest = useRef(state)
  latest.current = state

  /**
   * Record today's owned side, so the equity curve can become a net-worth curve.
   *
   * WHY THE CLIENT WRITES THIS. An asset balance is a running sum the server
   * could manage in SQL, but a liability is an amortisation schedule derived
   * from five fields, and calc.js is the single source of truth for that math.
   * A second implementation on the server would be a second answer to "what do
   * you owe", and the two would drift.
   *
   * NOTHING RECORDED IS NOT ZERO. With no accounts and no commitments the honest
   * value is "not known", which is what the nullable columns mean — so this
   * writes nothing rather than asserting a confident RM 0 on both sides.
   *
   * Fire-and-forget, and silent on failure. A missing point leaves a gap in a
   * chart; a toast about one would interrupt the owner over something they did
   * not ask for and cannot act on.
   */
  const recordOwned = useCallback(next => {
    if (!next.assets?.length && !next.commitments?.length) return
    const n = netWorth(next)
    const p2 = v => String(v).padStart(2, '0')
    const d = new Date()
    const today = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    const row = (next.snapshots || []).find(s => s.date === today)
    // A cent of tolerance: re-posting an identical figure on every refresh would
    // be a request per reload for a row that already says the right thing.
    const near = (a, b) => a != null && Math.abs(a - b) < 0.01
    if (row && near(row.assets_rm, n.assetsRM) && near(row.liabilities_rm, n.owedRM)) return
    api.saveOwnedSnapshot({ assets_rm: n.assetsRM, liabilities_rm: n.owedRM }).catch(() => {})
  }, [])

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await api.getState()
      setState(next)
      setError(null)
      setLocked(false)
      recordOwned(next)
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
    // recordOwned is stable, so reload's identity does not change — which matters
    // because the value memo below depends on it.
  }, [recordOwned])

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
        toast.warning('Add an instrument first', { description: 'Add one from the Portfolio screen.' })
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
      isPrivate,
      togglePrivate,
      fx: state.fx,
      reload,

      tab,
      setTab,

      modal,
      closeModal: () => setModal(null),
      openInstrument: () => setModal({ kind: 'instrument', prefill: {} }),
      openTransaction,
      openCash: (prefill = {}) => setModal({ kind: 'cash', prefill }),
      // With a row, the form edits it; without, it adds one.
      openAsset: (prefill = {}) => setModal({ kind: 'asset', prefill }),
      // With a row, the form edits it; without, it adds one.
      openCommitment: (prefill = {}) => setModal({ kind: 'commitment', prefill }),
      // With a row, the form edits it; without, it adds one.
      openExpense: (prefill = {}) => setModal({ kind: 'expense', prefill }),
      // With a row, the form edits it; without, it adds one.
      openIncome: (prefill = {}) => setModal({ kind: 'income', prefill }),
      openGoal: () => setModal({ kind: 'goal', prefill: {} }),
      openIncomeEvent,
      openAssetEntry,

      addInstrument: body => mutate(() => api.addInstrument(body), `${body.ticker} added`),
      addTransaction: body => mutate(() => api.addTransaction(body), 'Transaction saved'),
      deleteTransaction: id => mutate(() => api.deleteTransaction(id), 'Transaction removed'),
      addCash: body => mutate(() => api.addCash(body), 'Cash movement saved'),
      addGoal: body => mutate(() => api.addGoal(body), 'Goal added'),
      addAsset: body => mutate(() => api.addAsset(body), `${body.name} added`),
      saveDeclaredRate: body =>
        mutate(() => api.saveDeclaredRate(body), `${body.year} rate saved`),
      deleteDeclaredRate: id =>
        mutate(() => api.deleteDeclaredRate(id), 'Reverted to the built-in figure'),
      addCommitment: body => mutate(() => api.addCommitment(body), `${body.name} added`),
      addExpense: body => mutate(() => api.addExpense(body), 'Expense recorded'),
      updateExpense: (id, body) => mutate(() => api.updateExpense(id, body), 'Expense updated'),
      deleteExpense: id => mutate(() => api.deleteExpense(id), 'Expense removed'),
      addIncomeSource: body => mutate(() => api.addIncomeSource(body), `${body.name} added`),
      updateIncomeSource: (id, body) =>
        mutate(() => api.updateIncomeSource(id, body), `${body.name} updated`),
      deleteIncomeSource: id => mutate(() => api.deleteIncomeSource(id), 'Income source removed'),
      addIncomeEvent: (sourceId, body) => mutate(() => api.addIncomeEvent(sourceId, body), 'Payment recorded'),
      deleteIncomeEvent: (sourceId, eventId) =>
        mutate(() => api.deleteIncomeEvent(sourceId, eventId), 'Payment removed'),
      updateCommitment: (id, body) =>
        mutate(() => api.updateCommitment(id, body), `${body.name} updated`),
      deleteCommitment: id => mutate(() => api.deleteCommitment(id), 'Commitment removed'),
      updateAsset: (id, body) => mutate(() => api.updateAsset(id, body), `${body.name} updated`),
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
  }, [state, loading, refreshing, error, locked, unlock, lock, setPreference, reload, tab, setTab, modal, mutate, pricesPending, syncPending, isPrivate, togglePrivate])

  return <VantageContext.Provider value={value}>{children}</VantageContext.Provider>
}
