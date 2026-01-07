import { tv, type VariantProps } from 'tailwind-variants'
import { cn } from '@/utils/cn'

const badgeVariants = tv({
  base: 'inline-flex items-center rounded-full border leading-none whitespace-nowrap text-ellipsis font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
  variants: {
    variant: {
      default: 'border-transparent bg-primary-100 text-primary-800',
      note: 'border-amber-200 bg-amber-100 text-amber-800',
      outline: 'border-current text-stone-700 bg-white',
    },
    size: {
      default: 'text-sm px-3 py-2',
      sm: 'text-xs px-2 py-1',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
