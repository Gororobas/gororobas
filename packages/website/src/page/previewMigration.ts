import { docPage } from '../markdown'
import raw from './previewMigration.md'

export const { view, tableOfContents } = docPage(raw, 'preview-migration')
