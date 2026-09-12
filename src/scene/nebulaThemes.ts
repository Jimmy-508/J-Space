export type NebulaPresetId = 'deep-blue-violet' | 'galactic-true' | 'aurora-teal' | 'stardust-violet' | 'corona-amber' | 'ice-mist'

export type NebulaTheme = {
  id: NebulaPresetId
  name: string
  preview: [string, string, string]
  nebulaColors: number[]
  flareColors: [number, number]
  brightness: number
  opacity: number
}

export type CustomNebulaTheme = {
  primary: string
  secondary: string
  accent: string
  brightness: number
  opacity: number
}

export type NebulaSettings = {
  selectedPreset: NebulaPresetId | 'custom'
  custom: CustomNebulaTheme
}

export const DEFAULT_NEBULA_PRESET: NebulaPresetId = 'deep-blue-violet'

export const DEFAULT_CUSTOM_NEBULA: CustomNebulaTheme = {
  primary: '#2f5f87',
  secondary: '#526f96',
  accent: '#dcecff',
  brightness: 0.5,
  opacity: 0.5,
}

export const CUSTOM_BRIGHTNESS_RANGE = {
  min: 0.24,
  max: 1.42,
}

export const CUSTOM_OPACITY_RANGE = {
  min: 0.08,
  max: 1.55,
}

export const NEBULA_THEMES: NebulaTheme[] = [
  {
    id: 'deep-blue-violet',
    name: '深空藍紫',
    preview: ['#27456f', '#516f96', '#f1f7ff'],
    nebulaColors: [0x27456f, 0x3b527d, 0x2f4068, 0x496082, 0x516f96, 0x345d87, 0x5a4f86, 0x2d6d8d],
    flareColors: [0xf1f7ff, 0xbfd8ff],
    brightness: 1,
    opacity: 1,
  },
  {
    id: 'galactic-true',
    name: '銀河原色',
    preview: ['#121e34', '#9a6531', '#ead9b2'],
    nebulaColors: [0x121e34, 0x8f5c2f, 0x1c304d, 0xa16f3c, 0xd6b06c, 0x30405f, 0xe5d2a8, 0x6e4d2d],
    flareColors: [0xead9b2, 0xd1974d],
    brightness: 1.1,
    opacity: 1.34,
  },
  {
    id: 'aurora-teal',
    name: '極光青綠',
    preview: ['#10294a', '#2e9e91', '#b9f0e4'],
    nebulaColors: [0x10294a, 0x267b78, 0x173d62, 0x2e9e91, 0x5fc2b4, 0x1f6683, 0xb9f0e4, 0x348f8b],
    flareColors: [0xb9f0e4, 0x6ecfc3],
    brightness: 1.16,
    opacity: 1.28,
  },
  {
    id: 'stardust-violet',
    name: '星塵粉紫',
    preview: ['#281b4f', '#a0669f', '#f0cde9'],
    nebulaColors: [0x281b4f, 0x7d4c8f, 0x3a2567, 0xa0669f, 0xc083b9, 0x5b3a7d, 0xf0cde9, 0x8a5a96],
    flareColors: [0xf0cde9, 0xd69acb],
    brightness: 1.08,
    opacity: 1.3,
  },
  {
    id: 'corona-amber',
    name: '日冕金橘',
    preview: ['#101f38', '#b76b2e', '#f4cf78'],
    nebulaColors: [0x101f38, 0x894a25, 0x1c2f4c, 0xb76b2e, 0xe0a044, 0x51455a, 0xf4cf78, 0x7a4c2d],
    flareColors: [0xf4cf78, 0xe08a3c],
    brightness: 1.14,
    opacity: 1.25,
  },
  {
    id: 'ice-mist',
    name: '冰霧藍白',
    preview: ['#142b4a', '#77b9d8', '#f0fbff'],
    nebulaColors: [0x142b4a, 0x4b8aac, 0x1e4262, 0x77b9d8, 0xa9d8ea, 0x376f96, 0xf0fbff, 0x6fa8c4],
    flareColors: [0xf0fbff, 0xb5e1f2],
    brightness: 1.12,
    opacity: 1.22,
  },
]

export const getNebulaTheme = (id: NebulaPresetId) =>
  NEBULA_THEMES.find((theme) => theme.id === id) ?? NEBULA_THEMES[0]

export const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const mapCustomControl = (value: number, range: { min: number; max: number }) =>
  range.min + clamp(value, 0, 1) * (range.max - range.min)

export const getActiveNebulaTheme = (settings: NebulaSettings): NebulaTheme => {
  if (settings.selectedPreset !== 'custom') return getNebulaTheme(settings.selectedPreset)
  const custom = settings.custom
  const primary = hexToNumber(custom.primary)
  const secondary = hexToNumber(custom.secondary)
  const accent = hexToNumber(custom.accent)
  return {
    id: DEFAULT_NEBULA_PRESET,
    name: '自訂',
    preview: [custom.primary, custom.secondary, custom.accent],
    nebulaColors: [
      primary,
      secondary,
      primary,
      secondary,
      secondary,
      primary,
      accent,
      secondary,
    ],
    flareColors: [accent, secondary],
    brightness: mapCustomControl(custom.brightness, CUSTOM_BRIGHTNESS_RANGE),
    opacity: mapCustomControl(custom.opacity, CUSTOM_OPACITY_RANGE),
  }
}
