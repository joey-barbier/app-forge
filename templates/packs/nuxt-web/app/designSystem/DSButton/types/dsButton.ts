// Plain .ts, never .d.ts: runtime consts and their derived types live together,
// and .d.ts files emit no JavaScript (CONVENTIONS.md §1 gotcha).
export const DS_BUTTON_VARIANTS = ['primary', 'secondary', 'ghost'] as const

export type DSButtonVariant = (typeof DS_BUTTON_VARIANTS)[number]
