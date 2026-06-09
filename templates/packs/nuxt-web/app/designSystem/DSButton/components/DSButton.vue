<script setup lang="ts">
import type { DSButtonVariant } from '../types/dsButton'

// L3 Core UI — domain-blind by contract: props are primitives/UI types only.
// If a prop ever needs a domain model, this component belongs in features/ (L4).
const props = withDefaults(
  defineProps<{
    variant?: DSButtonVariant
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'primary', disabled: false, type: 'button' },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

function onClick(event: MouseEvent) {
  if (props.disabled) return
  emit('click', event)
}
</script>

<template>
  <button
    class="ds-button"
    :class="`ds-button--${props.variant}`"
    :type="props.type"
    :disabled="props.disabled"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
/* Tokens only — a raw hex value in this file is a review blocker (CONVENTIONS.md §8). */
.ds-button {
  font: var(--ds-font-body);
  padding: var(--ds-space-2) var(--ds-space-4);
  border-radius: var(--ds-radius-m);
  border: var(--ds-border-width) solid transparent;
  cursor: pointer;
  transition: background-color 120ms ease, opacity 120ms ease;
}

.ds-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ds-button--primary {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
}

.ds-button--primary:hover:not(:disabled) {
  background: var(--ds-color-primary-hover);
}

.ds-button--secondary {
  background: var(--ds-color-surface);
  color: var(--ds-color-text);
  border-color: var(--ds-color-border);
}

.ds-button--ghost {
  background: transparent;
  color: var(--ds-color-primary);
}
</style>
