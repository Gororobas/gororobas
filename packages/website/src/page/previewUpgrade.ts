import { docPage } from '../markdown'
import raw from './previewUpgrade.md'

export const { view, tableOfContents } = docPage(raw, 'preview-upgrade')
