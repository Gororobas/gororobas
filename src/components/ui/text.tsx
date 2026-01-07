import * as React from 'react'
import { tv, type VariantProps } from 'tailwind-variants'
import { cn } from '@/utils/cn'

const textVariants = tv({
  variants: {
    level: {
      h1: 'text-3xl md:text-4xl',
      h2: 'text-xl md:text-2xl',
      h3: 'text-base md:text-lg',
      p: 'text-sm md:text-base',
      sm: 'text-xs md:text-sm',
    },
    weight: {
      semibold: 'font-semibold',
      medium: 'font-medium',
      normal: 'font-normal',
    },
  },
  defaultVariants: {
    level: 'p',
  },
  // When using a heading level with no weight defined, use the following weights:
  compoundVariants: [
    {
      level: 'h1',
      class: 'font-semibold',
    },
    {
      level: 'h2',
      class: 'font-medium',
    },
    {
      level: 'h3',
      class: 'font-medium',
    },
  ],
})

export interface TextProps
  extends
    React.ButtonHTMLAttributes<
      HTMLParagraphElement | HTMLHeadingElement | HTMLDivElement
    >,
    VariantProps<typeof textVariants> {
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div'
}

const Text = React.forwardRef<
  HTMLParagraphElement | HTMLHeadingElement | HTMLDivElement,
  TextProps
>(({ className, level, as, weight, ...props }, ref) => {
  const Comp = as || 'p'
  return (
    <Comp
      className={cn(textVariants({ level, weight, className }))}
      ref={ref}
      {...props}
    />
  )
})
Text.displayName = 'Text'

export { Text, textVariants }
