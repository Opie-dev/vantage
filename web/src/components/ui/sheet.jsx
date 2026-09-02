import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * A side panel, built on the same Radix Dialog as dialog.jsx.
 *
 * Every form in the app enters from the right instead of landing in the middle
 * of the screen. That is partly consistency and partly room: a centred dialog is
 * capped by the viewport height and starts scrolling inside itself on a laptop,
 * while a full-height panel has the whole window to work with — which the longer
 * forms (a commitment, a payroll payment) genuinely need.
 *
 * The exported names mirror dialog.jsx exactly so App.jsx can alias this module
 * in place of that one and convert every form at once, rather than eight
 * near-identical edits that could drift apart later.
 */

function Sheet({ ...props }) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetPortal({ ...props }) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetClose({ ...props }) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({ className, ...props }) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The panel itself.
 *
 * Two nested boxes on purpose. The outer one is the fixed, full-height panel and
 * takes the width class each form passes (`sm:max-w-[460px]` and friends), so
 * the forms keep the widths they were designed at. The inner one is the only
 * thing that scrolls, which is what keeps the close button pinned to the corner
 * instead of sliding away up the page on a long form.
 */
function SheetContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <SheetPortal data-slot="sheet-portal">
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-lg outline-none transition ease-in-out',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-200',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300',
          'sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-4 right-4 z-20 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">{children}</div>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-2 pr-8 text-left', className)}
      {...props}
    />
  )
}

/**
 * Pinned to the bottom of the panel, bleeding through the parent's padding so
 * the rule above it meets both edges. `mt-auto` holds it at the bottom when the
 * form is short; `sticky` keeps Save reachable without scrolling when it is not.
 */
function SheetFooter({ className, showCloseButton = false, children, ...props }) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'sticky bottom-0 z-10 -mx-6 -mb-6 mt-auto flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <SheetPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </SheetPrimitive.Close>
      )}
    </div>
  )
}

function SheetTitle({ className, ...props }) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
