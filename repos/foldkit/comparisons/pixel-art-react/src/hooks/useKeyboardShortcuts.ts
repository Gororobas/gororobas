import { useEffect } from 'react'

import type { Action } from '../reducer'

export const useKeyboardShortcuts = (
  dispatch: React.Dispatch<Action>,
): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (isModifier && event.shiftKey && key === 'z') {
        event.preventDefault()
        dispatch({ type: 'ClickedRedo' })
        return
      }

      if (isModifier && key === 'z') {
        event.preventDefault()
        dispatch({ type: 'ClickedUndo' })
        return
      }

      if (isModifier && key === 'y') {
        event.preventDefault()
        dispatch({ type: 'ClickedRedo' })
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      switch (key) {
        case 'b':
          dispatch({ type: 'SelectedTool', tool: 'Brush' })
          break
        case 'f':
          dispatch({ type: 'SelectedTool', tool: 'Fill' })
          break
        case 'e':
          dispatch({ type: 'SelectedTool', tool: 'Eraser' })
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dispatch])
}
