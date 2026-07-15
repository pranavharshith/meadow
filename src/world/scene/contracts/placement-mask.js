import { isBadPropSpot, PLAZA_GRASS_CLEAR_R } from '../../noise'
import { isInsidePlot } from '../../plot-utils'

export function isInsideAnyPlot(plots, x, z) {
  if (!plots) return false
  for (let i = 0; i < plots.length; i++) {
    if (isInsidePlot(plots[i], x, z)) return true
  }
  return false
}

/** Shared exclusion contract for every decorative ground-cover layer. */
export function isNatureExcluded(plots, x, z, plazaMargin = 0) {
  return Math.hypot(x, z) < PLAZA_GRASS_CLEAR_R + plazaMargin
    || isInsideAnyPlot(plots, x, z)
    || isBadPropSpot(x, z)
}
