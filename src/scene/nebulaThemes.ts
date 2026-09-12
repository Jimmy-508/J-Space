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
  brightness: 1,
  opacity: 1,
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
    preview: ['#1d2b45', '#8a6a42', '#e5dcc7'],
    nebulaColors: [0x1d2b45, 0x2f3950, 0x51422e, 0x6f5636, 0x7d6644, 0x425070, 0x8b7c63, 0x2f4962],
    flareColors: [0xe5dcc7, 0xb99b6b],
    brightness: 0.92,
    opacity: 0.86,
  },
  {
    id: 'aurora-teal',
    name: '極光青綠',
    preview: ['#17365d', '#2f8c86', '#bcebe6'],
    nebulaColors: [0x17365d, 0x1f4f68, 0x23676f, 0x2f8c86, 0x3f9d99, 0x2a6f8a, 0x3f6f94, 0x4ca99d],
    flareColors: [0xbcebe6, 0x86d6d0],
    brightness: 0.96,
    opacity: 0.9,
  },
  {
    id: 'stardust-violet',
    name: '星塵粉紫',
    preview: ['#2c234f', '#7a5c92', '#edd8ef'],
    nebulaColors: [0x2c234f, 0x42345f, 0x513b68, 0x6e5481, 0x7a5c92, 0x58476f, 0x8a658c, 0x684f82],
    flareColors: [0xedd8ef, 0xcba7d6],
    brightness: 0.9,
    opacity: 0.84,
  },
  {
    id: 'corona-amber',
    name: '日冕金橘',
    preview: ['#142743', '#9a6830', '#f2d38b'],
    nebulaColors: [0x142743, 0x293853, 0x5f4526, 0x8a572b, 0x9a6830, 0x5f5b45, 0x7e5438, 0x38516a],
    flareColors: [0xf2d38b, 0xd49a58],
    brightness: 0.94,
    opacity: 0.82,
  },
  {
    id: 'ice-mist',
    name: '冰霧藍白',
    preview: ['#18304f', '#75a9c8', '#e9f7ff'],
    nebulaColors: [0x18304f, 0x284865, 0x315d78, 0x588ca7, 0x75a9c8, 0x40708c, 0x8faec2, 0x5c93ad],
    flareColors: [0xe9f7ff, 0xb8d8ea],
    brightness: 0.9,
    opacity: 0.78,
  },
]

export const getNebulaTheme = (id: NebulaPresetId) =>
  NEBULA_THEMES.find((theme) => theme.id === id) ?? NEBULA_THEMES[0]

export const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)

export const getActiveNebulaTheme = (settings: NebulaSettings): NebulaTheme => {
  if (settings.selectedPreset !== 'custom') return getNebulaTheme(settings.selectedPreset)
  const custom = settings.custom
  return {
    id: DEFAULT_NEBULA_PRESET,
    name: '自訂',
    preview: [custom.primary, custom.secondary, custom.accent],
    nebulaColors: [
      hexToNumber(custom.primary),
      hexToNumber(custom.secondary),
      hexToNumber(custom.primary),
      hexToNumber(custom.secondary),
      hexToNumber(custom.secondary),
      hexToNumber(custom.primary),
      hexToNumber(custom.accent),
      hexToNumber(custom.secondary),
    ],
    flareColors: [hexToNumber(custom.accent), hexToNumber(custom.secondary)],
    brightness: custom.brightness,
    opacity: custom.opacity,
  }
}
