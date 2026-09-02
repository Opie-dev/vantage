/**
 * Shown instead of the app when /api/state answers 401 — i.e. the server has a
 * VANTAGE_PIN set and this browser has no valid session cookie yet.
 *
 * Deliberately plain: no header, no tabs, nothing that hints at the data behind
 * it. The bundle itself is public, so this is a gate on the API, not a secret.
 */
import { useState } from 'react'
import { Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onUnlock(pin)
    setBusy(false)
    if (ok) return
    setFailed(true)
    setPin('')
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-5">
      <Card className="w-full max-w-[340px]">
        <CardContent className="px-6 py-2">
          <div className="flex flex-col items-center gap-1.5 pb-5">
            <div className="bg-muted text-muted-foreground mb-1 flex size-9 items-center justify-center rounded-full">
              <Lock className="size-4" aria-hidden="true" />
            </div>
            <div className="text-[15px] font-semibold">Vantage</div>
            <div className="text-faint text-[12px]">Enter your PIN to continue</div>
          </div>

          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pin" className="sr-only">
                PIN
              </Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value)}
                aria-invalid={failed || undefined}
                aria-describedby={failed ? 'pin-error' : undefined}
                className="num text-center tracking-[0.3em]"
              />
              {/* aria-live so a screen reader announces the rejection */}
              <p id="pin-error" role="status" aria-live="polite" className="text-loss min-h-4 text-center text-[11.5px]">
                {failed ? 'Wrong PIN' : ''}
              </p>
            </div>
            <Button type="submit" disabled={!pin || busy} className="w-full">
              {busy ? 'Checking…' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
