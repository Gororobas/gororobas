import {createImageUrlBuilder} from '@sanity/image-url'
import { SANITY_BASE_CONFIG } from './config'

export const imageBuilder = createImageUrlBuilder(SANITY_BASE_CONFIG)
