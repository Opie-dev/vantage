/**
 * One commitment, whatever kind it is.
 *
 * ONE COMPONENT FOR THREE KINDS, DELIBERATELY. Commitments, Credit cards and
 * Loans are three screens now (money-redesign-plan.md §3), and the obvious move
 * was to split this into three rows to match. It would have been a mistake: the
 * three branches share the name, the dot, the monthly figure, the edit and the
 * remove, and only diverge in what they add. Three copies of that shared spine
 * is three places for it to drift.
 *
 * So the row stays whole and the SCREENS filter. Commitments renders every kind
 * because a commitment is a commitment; Credit cards renders REVOLVING and Loans
 * renders LOAN, each with the room the single screen could not give them.
 *
 * The card-only callbacks are optional. On Loans and Commitments they are simply
 * not passed, and the card branch never runs to miss them.
 */
import { FileTextIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fmt, pct1 } from '@/lib/format'

import { KIND_COLOR, Meta, RowAction } from './parts'

/**
 * The plans on a card, nested the way the statement nests them.
 *
 * The two totals below the list are kept apart because only one of them is a
 * choice: an instalment is due in full or it is a default, while the 5% sits under
 * a balance that could be cleared tomorrow. A single "card minimum" line would
 * hide which half is which, which is precisely what the old model did.
 */
function CardPlans({ r, onEditPlan, onRemovePlan }) {
  return (
    <div className="border-hairline mt-1 mb-3 ml-[33px] grid gap-2 border-l pl-3.5">
      {r.plans.map(p => (
        <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-[190px] flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
              <span>{p.name}</span>
              {p.merchant ? <span className="text-faint">· {p.merchant}</span> : null}
              {p.effective == null ? (
                <Badge variant="gain" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  genuinely 0%
                </Badge>
              ) : (
                <Badge variant="loss" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  {pct1(p.effective)} real
                </Badge>
              )}
              {!p.isSpending ? (
                <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
                  not spending
                </Badge>
              ) : null}
            </div>
            <Meta className="mt-0.5">
              <span className="num">{p.paid}</span> of <span className="num">{p.tenure}</span>
              {p.endsOn ? ` · ends ${p.endsOn.slice(0, 7)}` : ''}
              {p.status !== 'ACTIVE' ? ` · ${p.status.toLowerCase()}` : ''}
            </Meta>
          </div>
          <div className="w-[112px] shrink-0 text-right">
            <div className="num text-[12.5px]">{fmt(p.outstanding, r.cur)}</div>
            <Meta>left</Meta>
          </div>
          <div className="num w-[92px] shrink-0 text-right text-[12.5px] font-semibold">
            {fmt(p.monthlyOut, r.cur)}
          </div>
          <RowAction
            icon={PencilIcon}
            label={`Edit ${p.name}`}
            onClick={() => onEditPlan({ ...p.plan })}
          />
          <RowAction
            icon={TrashIcon}
            label={`Remove ${p.name}`}
            onClick={() => onRemovePlan(r.id, p.id)}
          />
        </div>
      ))}

      <div className="border-hairline flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2">
        <div className="min-w-[190px] flex-1">
          <span className="text-muted-foreground text-[12px]">5% of the revolving balance</span>{' '}
          <span className="text-faint text-[11px]">· instalments out of the base first</span>
        </div>
        <div className="num text-faint w-[112px] shrink-0 text-right text-[12.5px]">
          {fmt(r.revolving, r.cur)}
        </div>
        <div className="num w-[92px] shrink-0 text-right text-[12.5px]">
          {fmt(Math.max(r.minimum - r.instalments, 0), r.cur)}
        </div>
      </div>
    </div>
  )
}

/**
 * What is actually left on the limit, which no statement prints.
 *
 * A bill showing a third of the limit used can sit on an account with almost
 * nothing free, because the instalments not yet billed are still blocking it and
 * come back only as each month's principal is paid.
 */
function CardHeadroom({ r }) {
  const apparent = r.commitment.credit_limit - r.revolving - r.planOutstanding
  const hidden = r.availableRM != null && r.blocked > 0
  if (!hidden) return null
  return (
    <div className="mb-3 ml-[33px] rounded-md border border-[color:var(--chart-2)]/25 bg-[color:var(--chart-2)]/[0.06] px-3 py-2">
      <p className="text-muted-foreground m-0 text-[12px] leading-relaxed text-pretty">
        <b className="font-semibold text-[color:var(--chart-2)]">
          {fmt(r.availableRM, r.cur)} is what is actually left
        </b>{' '}
        on this limit. <span className="num">{fmt(r.blocked, r.cur)}</span> of instalment principal is
        still blocking it and is released only as each month&rsquo;s share is paid.
        {apparent > r.availableRM ? (
          <>
            {' '}
            <span className="text-faint">
              The balance alone would suggest {fmt(apparent, r.cur)}.
            </span>
          </>
        ) : null}
      </p>
    </div>
  )
}

export default function CommitmentRow({ r, onEdit, onRemove, onAddPlan, onRemovePlan, onAddStatement, onOpenSheet }) {
  const c = r.commitment

  return (
    <div className="border-hairline border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="size-[9px] shrink-0 rounded-full" style={{ background: KIND_COLOR[r.kind] }} />

      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {r.kind === 'REVOLVING' ? (
            <button
              type="button"
              onClick={() => onOpenSheet(r.id)}
              className="hover:text-primary text-left text-[13.5px] font-semibold underline-offset-4 transition-colors hover:underline"
            >
              {r.name}
            </button>
          ) : (
            <span className="text-[13.5px] font-semibold">{r.name}</span>
          )}
          {c.lender ? <Meta>{c.lender}</Meta> : null}
          {r.kind === 'LOAN' && r.flat ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="cash"
                  className="cursor-default px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase"
                >
                  {r.quoted}% flat = {pct1(r.effective)} real
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                A flat rate charges interest on the original amount for the whole term, so its true
                cost is close to double the number on the agreement. Converted by the Hire-Purchase
                Act&rsquo;s own Seventh Schedule formula.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {r.kind === 'REVOLVING' && r.staleDays != null && r.staleDays > 7 ? (
            <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px] tracking-[0.06em] uppercase">
              {r.staleDays}d old
            </Badge>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {r.kind === 'LOAN' ? (
            <>
              <Meta>
                {/* A loan recorded without its rate says so by omission rather
                    than by printing "null% reducing" — the progress and the due
                    day are the parts that were actually given. */}
                {r.rated ? `${r.quoted}% ${r.flat ? 'flat' : 'reducing'}` : 'rate not recorded'}
                {c.due_day ? ` · due ${c.due_day}` : ''} · <span className="num">{r.paid}</span> of{' '}
                <span className="num">{c.term_months}</span> paid
              </Meta>
              <div className="min-w-[110px] flex-1 sm:max-w-[170px]">
                <Progress
                  value={r.progressPct}
                  aria-label={`${pct1(r.progressPct)} of ${r.name} paid`}
                  className="h-1.5"
                />
              </div>
            </>
          ) : r.kind === 'REVOLVING' ? (
            <Meta>
              <span className="num">{fmt(r.owed, r.cur)}</span>
              {c.credit_limit ? (
                <>
                  {' '}
                  of <span className="num">{fmt(c.credit_limit, r.cur)}</span> ·{' '}
                  <span className="num">{pct1(r.utilisationPct)}</span> used
                </>
              ) : null}{' '}
              · <span className="num">{r.quoted}%</span> if carried
              {r.planOutstanding > 0 ? (
                <>
                  {' '}
                  · <span className="num">{fmt(r.revolving, r.cur)}</span> revolving,{' '}
                  <span className="num">{fmt(r.planOutstanding, r.cur)}</span> in{' '}
                  {r.plans.length} plan{r.plans.length === 1 ? '' : 's'}
                </>
              ) : null}
              {r.cycle ? (
                <>
                  {' '}
                  · closes {r.cycle.closesOn.slice(8)}
                  {r.cycle.daysOfFloat != null ? (
                    <>
                      , anything bought today is due{' '}
                      <span className="num">{r.cycle.dueOn}</span>
                    </>
                  ) : null}
                </>
              ) : null}
            </Meta>
          ) : (
            <Meta>
              <span className="num">{fmt(r.amount, r.cur)}</span>
              {r.everyMonths === 1 ? ' monthly' : ` every ${r.everyMonths} months`}
              {c.due_day ? ` · due ${c.due_day}` : ''} · no balance, pure expense
            </Meta>
          )}
        </div>
      </div>

      <div className="ml-auto text-right">
        <div className="num text-[13.5px] font-semibold">{fmt(r.monthlyOut, r.cur)}</div>
        {r.kind === 'LOAN' ? (
          <Meta>
            {r.owed > 0 ? (
              <>
                <span className="num">{fmt(r.owed, r.cur)}</span>{' '}
                {r.owedIsInstalments ? 'of instalments' : 'left'}
              </>
            ) : (
              'settled'
            )}
          </Meta>
        ) : r.kind === 'REVOLVING' ? (
          <Meta>minimum</Meta>
        ) : (
          <Meta>{r.everyMonths === 1 ? 'per month' : 'per month, spread'}</Meta>
        )}
      </div>
        {r.kind === 'REVOLVING' ? (
          <>
            <RowAction
              icon={PlusIcon}
              label={`Add an instalment plan to ${r.name}`}
              onClick={() => onAddPlan({ commitment_id: r.id })}
            />
            <RowAction
              icon={FileTextIcon}
              label={`Record a statement for ${r.name}`}
              onClick={() => onAddStatement({ commitment_id: r.id })}
            />
          </>
        ) : null}
        <RowAction icon={PencilIcon} label={`Edit ${r.name}`} onClick={() => onEdit(r.commitment)} />
        <RowAction icon={TrashIcon} label={`Remove ${r.name}`} onClick={() => onRemove(r.id)} />
      </div>

      {r.kind === 'REVOLVING' && r.plans?.length ? (
        <>
          <CardPlans r={r} onEditPlan={onAddPlan} onRemovePlan={onRemovePlan} />
          <CardHeadroom r={r} />
        </>
      ) : null}
      {r.kind === 'REVOLVING' && !r.cycle ? (
        <p className="text-faint mb-3 ml-[33px] text-[11.5px] leading-relaxed text-pretty">
          No statement day recorded, so this card cannot say when a purchase stops being
          interest-free — the period runs from the day the bill closes, not the day it is due.
        </p>
      ) : null}
    </div>
  )
}
