export type NebulaPresetId = 'deep-blue-violet' | 'galactic-true' | 'aurora-teal' | 'stardust-violet' | 'corona-amber' | 'ice-mist'

export type NebulaTheme = {
  id: NebulaPresetId
  name: string
  preview: [string, string, string]
  nebulaColors: number[]
  flareColors: [number, number]
  atmosphereColors: [number, number, number]
  atmosphereOpacity: number
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
  min: 0.18,
  max: 1.62,
}

export const CUSTOM_OPACITY_RANGE = {
  min: 0.05,
  max: 1.85,
}

export const NEBULA_THEMES: NebulaTheme[] = [
  {
    id: 'deep-blue-violet',
    name: '深空藍紫',
    preview: ['#27456f', '#516f96', '#f1f7ff'],
    nebulaColors: [0x27456f, 0x3b527d, 0x2f4068, 0x496082, 0x516f96, 0x345d87, 0x5a4f86, 0x2d6d8d],
    flareColors: [0xf1f7ff, 0xbfd8ff],
    atmosphereColors: [0x27456f, 0x516f96, 0xf1f7ff],
    atmosphereOpacity: 0,
    brightness: 1,
    opacity: 1,
  },
  {
    id: 'galactic-true',
    name: '銀河原色',
    preview: ['#121e34', '#9a6531', '#ead9b2'],
    nebulaColors: [0x101a2f, 0xa0602e, 0x172a49, 0xb87a3a, 0xe0b566, 0x2d3e5e, 0xead9b2, 0x754b29],
    flareColors: [0xead9b2, 0xd1974d],
    atmosphereColors: [0x7d4b29, 0xd19b55, 0xead9b2],
    atmosphereOpacity: 0.88,
    brightness: 1.24,
    opacity: 1.62,
  },
  {
    id: 'aurora-teal',
    name: '極光青綠',
    preview: ['#10294a', '#2e9e91', '#b9f0e4'],
    nebulaColors: [0x0e284c, 0x2b9f93, 0x143d63, 0x36b7a3, 0x75d4c5, 0x1d718c, 0xb9f0e4, 0x2a8f87],
    flareColors: [0xb9f0e4, 0x6ecfc3],
    atmosphereColors: [0x1a6c87, 0x34b9a5, 0xb9f0e4],
    atmosphereOpacity: 0.94,
    brightness: 1.28,
    opacity: 1.54,
  },
  {
    id: 'stardust-violet',
    name: '星塵粉紫',
    preview: ['#281b4f', '#a0669f', '#f0cde9'],
    nebulaColors: [0x281850, 0x9a5aa2, 0x3b2369, 0xbc76b1, 0xd59bcf, 0x653d82, 0xf0cde9, 0x90539a],
    flareColors: [0xf0cde9, 0xd69acb],
    atmosphereColors: [0x613884, 0xbe77b3, 0xf0cde9],
    atmosphereOpacity: 0.9,
    brightness: 1.22,
    opacity: 1.58,
  },
  {
    id: 'corona-amber',
    name: '日冕金橘',
    preview: ['#101f38', '#b76b2e', '#f4cf78'],
    nebulaColors: [0x0f1d36, 0xa95827, 0x1a2d4a, 0xc87530, 0xecaa47, 0x4e4055, 0xf4cf78, 0x824928],
    flareColors: [0xf4cf78, 0xe08a3c],
    atmosphereColors: [0x78422a, 0xd17932, 0xf4cf78],
    atmosphereOpacity: 0.86,
    brightness: 1.3,
    opacity: 1.5,
  },
  {
    id: 'ice-mist',
    name: '冰霧藍白',
    preview: ['#142b4a', '#77b9d8', '#f0fbff'],
    nebulaColors: [0x112848, 0x5ca8cd, 0x1b456b, 0x86ccef, 0xc0e6f4, 0x347ca5, 0xf0fbff, 0x73b6d4],
    flareColors: [0xf0fbff, 0xb5e1f2],
    atmosphereColors: [0x3f8eb8, 0x9dd7ef, 0xf0fbff],
    atmosphereOpacity: 0.92,
    brightness: 1.24,
    opacity: 1.46,
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
    atmosphereColors: [primary, secondary, accent],
    atmosphereOpacity: 0.9,
    brightness: mapCustomControl(custom.brightness, CUSTOM_BRIGHTNESS_RANGE),
    opacity: mapCustomControl(custom.opacity, CUSTOM_OPACITY_RANGE),
  }
}
