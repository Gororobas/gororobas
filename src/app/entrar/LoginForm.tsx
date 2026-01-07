'use client'

import { Text } from '@/components/ui/text'

export default function LoginForm(_props: {
  redirectTo?: string | undefined
}) {

  return (
    <div className="px-page-x py-page-y">
      <Text level="h1" className="mt-6">O Gororobas está em reforma</Text>
      <Text level="h3" className='mt-2 max-w-xl'>
        No momento, estamos reescrevendo o aplicativo e por problemas técnicos ninguém pode acessar sua conta. Lamentamos e nos colocamos a disposição pra te ouvir e ajudar: <strong>ola@gororobas.com</strong>
      </Text>
    </div>
  )

}
