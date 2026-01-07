import { Slot as SlotPrimitive } from 'radix-ui'
import * as React from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

import { cn } from '@/utils/cn'

const buttonVariants = tv({
  base: 'inline-flex gap-[0.5em] items-center justify-center whitespace-nowrap rounded-md text-sm leading-none font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border',
  variants: {
    tone: {
      primary: '',
      secondary: '',
      neutral: '',
      destructive: '',
    },
    mode: {
      default: '',
      outline: '',
      bleed: '',
    },
    size: {
      default: 'h-10 px-4 py-2',
      xs: 'h-8 text-xs rounded-md px-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10',
    },
  },
  defaultVariants: {
    tone: 'primary',
    mode: 'default',
    size: 'default',
  },
  compoundVariants: [
    {
      tone: 'primary',
      mode: 'default',
      class:
        'bg-primary-700 border-primary-700 text-primary-50 hover:bg-primary-600',
    },
    {
      tone: 'primary',
      mode: 'outline',
      class:
        'text-primary-800 border-primary-200 bg-primary-100 hover:bg-primary-50',
    },
    {
      tone: 'primary',
      mode: 'bleed',
      class:
        'text-primary-800 border-transparent hover:bg-primary-100 hover:text-primary-900 hover:border-primary-100',
    },
    {
      tone: 'secondary',
      mode: 'default',
      class:
        'bg-secondary-700 border-secondary-700 text-secondary-50 hover:bg-secondary-600',
    },
    {
      tone: 'secondary',
      mode: 'outline',
      class:
        'text-secondary-800 border-secondary-200 bg-secondary-100 hover:bg-secondary-50',
    },
    {
      tone: 'secondary',
      mode: 'bleed',
      class:
        'text-secondary-800 border-transparent hover:bg-secondary-100 hover:border-secondary-100',
    },
    {
      tone: 'neutral',
      mode: 'default',
      class: 'bg-stone-700 border-stone-700 text-stone-50 hover:bg-stone-600',
    },
    {
      tone: 'neutral',
      mode: 'outline',
      class: 'text-stone-800 border-stone-200 bg-stone-100 hover:bg-stone-50',
    },
    {
      tone: 'neutral',
      mode: 'bleed',
      class:
        'text-stone-800 border-transparent hover:bg-stone-100 hover:border-stone-100',
    },
    {
      tone: 'destructive',
      mode: 'default',
      class:
        'bg-destructive border-destructive text-destructive-foreground hover:bg-destructive/90',
    },
    {
      tone: 'destructive',
      mode: 'outline',
      class:
        'text-destructive border-destructive bg-destructive-foreground hover:bg-destructive/20',
    },
    {
      tone: 'destructive',
      mode: 'bleed',
      class:
        'text-destructive border-transparent hover:bg-destructive/10 hover:border-destructive/10',
    },
  ],
})

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, tone, mode, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? SlotPrimitive.Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ tone, mode, size, className }))}
        ref={ref}
        // In most contexts, we want to use type="button" to avoid form submission
        type={type || 'button'}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
