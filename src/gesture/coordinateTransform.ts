import type { NormalizedPoint } from './gestureTypes'

export const toMirroredPreviewPoint = (point: NormalizedPoint): NormalizedPoint => ({
  x: 1 - point.x,
  y: point.y,
})

export const toScreenPoint = (
  point: NormalizedPoint,
  width: number,
  height: number,
  previewMirrored: boolean,
): { x: number; y: number } => {
  const visual = previewMirrored ? toMirroredPreviewPoint(point) : point
  return {
    x: visual.x * width,
    y: visual.y * height,
  }
}

export const clampPoint = (point: NormalizedPoint): NormalizedPoint => ({
  x: Math.max(0, Math.min(1, point.x)),
  y: Math.max(0, Math.min(1, point.y)),
})
