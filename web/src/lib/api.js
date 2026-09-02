/**
 * Thin fetch wrapper over the Express API in ../../server.js.
 *
 * Every call is same-origin ('/api/...'): the built bundle is served by Express
 * from public/, and `npm run dev` proxies /api to http://localhost:8123
 * (see vite.config.js). Never hard-code the host.
 *
 * Every function returns a Promise and THROWS an Error carrying the server's
 * `{ error }` message on a non-2xx response. Screens should not call these
 * directly for writes — use the mutators on useVantage() from '@/lib/store',
 * which also reload state and raise a toast. Reach for this module when you
 * need a one-off read or a call the store does not wrap.
 */

async function request(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    const err = new Error(body.error || res.statusText)
    // The store needs to tell "locked" (401) from "genuinely broken".
    err.status = res.status
    throw err
  }
  return res.json()
}

const send = (method, path, body) =>
  request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/* ── auth ─────────────────────────────────────────────────────────────────── */

/** Whether a PIN is configured server-side, and whether this browser is past it. */
export const authStatus = () => request('/api/auth/status')

/** Exchanges the PIN for a session cookie. Throws on a wrong PIN. */
export const login = pin => send('POST', '/api/auth/login', { pin })

export const logout = () => send('POST', '/api/auth/logout')

/* ── preferences ──────────────────────────────────────────────────────────── */

/** Partial merge — send only the keys you are changing. */
export const updatePreferences = patch => send('PATCH', '/api/preferences', patch)

/* ── reads ────────────────────────────────────────────────────────────────── */

/**
 * The whole app payload in one shot.
 * @returns {Promise<{instruments:Array, transactions:Array, cash:Array,
 *   prices:Array, goals:Array, snapshots:Array, fx:number, lastSync:string|null}>}
 */
export const getState = () => request('/api/state')

/** @returns {Promise<{ok:true}>} — used to tell "server down" from "db down". */
export const health = () => request('/api/health')

/* ── instruments ──────────────────────────────────────────────────────────── */

/**
 * @param {{ticker:string, name?:string, market:'MY'|'US', currency:'MYR'|'USD',
 *          yahoo_symbol?:string}} body
 *   `currency` is required by the server — derive it from market
 *   (MY -> MYR, US -> USD) exactly as the legacy modal did.
 */
export const addInstrument = body => send('POST', '/api/instruments', body)

/* ── transactions ─────────────────────────────────────────────────────────── */

/**
 * @param {{ticker:string, side:'BUY'|'SELL'|'DIV', qty:number, price:number,
 *          fees?:number, amount?:number|null, trade_date:string}} body
 *   trade_date is 'YYYY-MM-DD'. For a DIV row the legacy convention is
 *   qty 0, price 0 and the dividend value in `amount`.
 */
export const addTransaction = body => send('POST', '/api/transactions', body)

/** @param {number} id */
export const deleteTransaction = id => send('DELETE', `/api/transactions/${id}`)

/* ── cash ─────────────────────────────────────────────────────────────────── */

/**
 * @param {{type:'DEPOSIT'|'WITHDRAW'|'DIVIDEND'|'FEE', currency:'MYR'|'USD',
 *          amount:number, date:string}} body   date is 'YYYY-MM-DD'
 */
export const addCash = body => send('POST', '/api/cash', body)

/* ── goals ────────────────────────────────────────────────────────────────── */

/** @param {{ticker:string, target_qty:number, monthly_budget?:number|null}} body */
export const addGoal = body => send('POST', '/api/goals', body)

/**
 * Partial update — omitted fields keep their current value.
 * @param {number} id
 * @param {{target_qty?:number, monthly_budget?:number|null}} body
 */
export const updateGoal = (id, body) => send('PATCH', `/api/goals/${id}`, body)

/** @param {number} id */
export const deleteGoal = id => send('DELETE', `/api/goals/${id}`)

/* ── assets ───────────────────────────────────────────────────────────────── */

/**
 * Holdings outside moomoo — ASB, Tabung Haji, EPF. Nothing here touches the
 * broker tables; see the assets section in calc.js.
 * @param {{name:string, slug:string, rate_basis:'MIN_MONTHLY'|'MADB',
 *          institution?:string, unit_label?:string, unit_cap?:number|null,
 *          rate_quote?:'PERCENT'|'SEN_PER_UNIT', last_rate?:number|null,
 *          last_bonus?:number|null, fiscal_year?:string, sort_order?:number}} body
 *   `rate_basis` is required and has no default: MIN_MONTHLY is ASB and Tabung
 *   Haji, MADB is EPF, and the wrong one produces a plausible wrong estimate.
 * @returns {Promise<object>} the created asset row
 */
export const addAsset = body => send('POST', '/api/assets', body)

/**
 * Partial update — omitted fields keep their current value, so `{last_rate: 5.75}`
 * is all you send when a rate is declared.
 * @param {number} id
 * @param {{name?:string, last_rate?:number|null, last_bonus?:number|null,
 *          unit_cap?:number|null, archived?:boolean}} body
 */
export const updateAsset = (id, body) => send('PATCH', `/api/assets/${id}`, body)

/** Refused once the asset has entries — archive it instead. @param {number} id */
export const deleteAsset = id => send('DELETE', `/api/assets/${id}`)

/**
 * @param {number} assetId
 * @param {{type:'DEPOSIT'|'WITHDRAW'|'DISTRIBUTION'|'FEE', date:string,
 *          amount:number, note?:string}} body   date is 'YYYY-MM-DD',
 *   amount always POSITIVE — `type` carries the direction.
 */
export const addAssetEntry = (assetId, body) => send('POST', `/api/assets/${assetId}/entries`, body)

/** @param {number} assetId @param {number} entryId */
export const deleteAssetEntry = (assetId, entryId) =>
  send('DELETE', `/api/assets/${assetId}/entries/${entryId}`)

/* ── commitments ──────────────────────────────────────────────────────────── */

/**
 * What you owe and what leaves each month. The repayment schedule is NOT sent —
 * it is derived from these five fields (see calc.js).
 * @param {{kind:'LOAN'|'REVOLVING'|'RECURRING', name:string,
 *          principal?:number, rate?:number, rate_type?:'FLAT'|'REDUCING',
 *          term_months?:number, started_on?:string, instalment?:number|null,
 *          apr?:number, balance?:number, balance_as_of?:string, credit_limit?:number,
 *          amount?:number, every_months?:number, due_day?:number|null}} body
 *   `rate_type` has no default and cannot be inferred — FLAT charges interest on
 *   the original amount, REDUCING on what is left, and Malaysian marketing calls
 *   the second one "fixed". Take it from the agreement.
 * @returns {Promise<object>} the created commitment row
 */
export const addCommitment = body => send('POST', '/api/commitments', body)

/**
 * Partial update — omitted fields keep their value, so refreshing a card is
 * `{balance, balance_as_of}` alone. `kind` cannot be changed.
 * @param {number} id @param {object} body
 */
export const updateCommitment = (id, body) => send('PATCH', `/api/commitments/${id}`, body)

/** Refused once payments are recorded against it — end it instead. @param {number} id */
export const deleteCommitment = id => send('DELETE', `/api/commitments/${id}`)

/**
 * A payment the schedule would not predict: an overpayment, a missed month, a
 * settlement. Routine on-time instalments are never entered — they are derived.
 * @param {number} commitmentId
 * @param {{date:string, amount:number, extra_principal?:number, note?:string}} body
 */
export const addCommitmentPayment = (commitmentId, body) =>
  send('POST', `/api/commitments/${commitmentId}/payments`, body)

/** @param {number} commitmentId @param {number} paymentId */
export const deleteCommitmentPayment = (commitmentId, paymentId) =>
  send('DELETE', `/api/commitments/${commitmentId}/payments/${paymentId}`)

/* ── income ───────────────────────────────────────────────────────────────── */

/**
 * Where money arrives from.
 * @param {{kind:'EMPLOYMENT'|'FREELANCE'|'RENTAL'|'OTHER', name:string,
 *          cadence:'MONTHLY'|'IRREGULAR', pay_day?:number|null,
 *          gross_default?:number|null, epf_asset_id?:number|null}} body
 *   A monthly source needs `pay_day` (-1 = last working day); an irregular one
 *   must not have it, because storing one invents a certainty it does not have.
 */
export const addIncomeSource = body => send('POST', '/api/income', body)

/** Partial update. `kind` and `cadence` are fixed. @param {number} id @param {object} body */
export const updateIncomeSource = (id, body) => send('PATCH', `/api/income/${id}`, body)

/** Refused once payments are recorded — end it instead. @param {number} id */
export const deleteIncomeSource = id => send('DELETE', `/api/income/${id}`)

/**
 * One payment. The two groups are separate on purpose: `*_employee` and friends
 * come OUT of your pay and decide net, while `*_employer` is paid alongside it
 * and never touches net. Sending employer contributions in the first group is
 * rejected by name once they push deductions past gross.
 *
 * An employment payment with EPF on it also books the FULL contribution — both
 * halves — into the linked EPF asset, in the same database transaction.
 * @param {number} sourceId
 * @param {{date:string, gross:number, epf_employee?:number, socso_employee?:number,
 *          eis_employee?:number, skbbk?:number, pcb?:number, zakat?:number,
 *          other_deducted?:number, epf_employer?:number, socso_employer?:number,
 *          eis_employer?:number, note?:string}} body
 */
export const addIncomeEvent = (sourceId, body) => send('POST', `/api/income/${sourceId}/events`, body)

/** @param {number} sourceId @param {number} eventId */
export const deleteIncomeEvent = (sourceId, eventId) =>
  send('DELETE', `/api/income/${sourceId}/events/${eventId}`)

/* ── prices & snapshots ───────────────────────────────────────────────────── */

/**
 * Pulls a quote from Yahoo for every instrument that has a yahoo_symbol.
 * Partial failure is normal and is reported per ticker, not thrown.
 * @returns {Promise<{results: Array<{ticker:string, price?:number, ok:boolean, error?:string}>}>}
 */
export const refreshPrices = () => send('POST', '/api/prices/refresh')

/* ── moomoo sync ──────────────────────────────────────────────────────────── */

/**
 * Pulls positions, deals, dividends, cash and quotes from moomoo.
 *
 * The app proxies this to sync/moomoo_sync.py --serve on the host, which is where
 * OpenD lives. Slow by nature — a run scans a fortnight of clearing dates one
 * call at a time — so give the caller a spinner, not a timeout.
 * @returns {Promise<{ok:true, counts:{positions:number, orders:number,
 *   dividends:number, cash:number, quotes:number, fundProfiles:number,
 *   distributions:number}}>}
 */
export const syncMoomoo = () => send('POST', '/api/sync')

/** @param {{ticker:string, price:number}} body */
export const setManualPrice = body => send('POST', '/api/prices/manual', body)

/**
 * Records today's equity-curve point. The sync worker normally does this.
 * @param {{value_rm:number, cash_rm:number}} body  both already RM-combined
 */
export const saveSnapshot = body => send('POST', '/api/snapshot', body)

export default {
  getState,
  health,
  addInstrument,
  addTransaction,
  deleteTransaction,
  addCash,
  addGoal,
  updateGoal,
  deleteGoal,
  addAsset,
  updateAsset,
  deleteAsset,
  addAssetEntry,
  deleteAssetEntry,
  addCommitment,
  updateCommitment,
  deleteCommitment,
  addCommitmentPayment,
  deleteCommitmentPayment,
  addIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  addIncomeEvent,
  deleteIncomeEvent,
  refreshPrices,
  setManualPrice,
  saveSnapshot,
}
