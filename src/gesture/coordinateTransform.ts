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

export type ViewportSize = {
  width: number
  height: number
}

export const normalizedToCoverViewport = (
  point: NormalizedPoint,
  video: ViewportSize,
  viewport: ViewportSize,
  mirrored: boolean,
): { x: number; y: number } => {
  if (!video.width || !video.height || !viewport.width || !viewport.height) {
    return { x: point.x * viewport.width, y: point.y * viewport.height }
  }
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  const renderedWidth = video.width * scale
  const renderedHeight = video.height * scale
  const offsetX = (viewport.width - renderedWidth) / 2
  const offsetY = (viewport.height - renderedHeight) / 2
  const visualX = mirrored ? 1 - point.x : point.x
  return {
    x: offsetX + visualX * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  }
}

export const clampPoint = (point: NormalizedPoint): NormalizedPoint => ({
  x: Math.max(0, Math.min(1, point.x)),
  y: Math.max(0, Math.min(1, point.y)),
})
