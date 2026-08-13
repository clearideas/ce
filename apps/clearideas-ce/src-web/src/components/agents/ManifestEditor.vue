<script setup lang="ts">
import hljs from 'highlight.js'
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  error?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const highlightedCode = ref<HTMLElement | null>(null)
const lineCount = computed(() => Math.max(1, props.modelValue.split('\n').length))
const highlightedManifest = computed(() => {
  const source = props.modelValue || ' '
  return `${hljs.highlight(source, { language: 'json', ignoreIllegals: true }).value}\n`
})

function syncScroll(event: Event) {
  const textarea = event.currentTarget as HTMLTextAreaElement
  if (!highlightedCode.value) return
  highlightedCode.value.scrollTop = textarea.scrollTop
  highlightedCode.value.scrollLeft = textarea.scrollLeft
}

function updateValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function insertIndent(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const textarea = event.currentTarget as HTMLTextAreaElement
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = `${props.modelValue.slice(0, start)}  ${props.modelValue.slice(end)}`
  emit('update:modelValue', value)
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 2
  })
}
</script>

<template>
  <div class="manifest-field" :class="{ 'manifest-field--error': error }">
    <div class="manifest-field__label">Agent manifest (JSON)</div>
    <div class="manifest-editor">
      <pre ref="highlightedCode" class="manifest-editor__highlight hljs" aria-hidden="true"><code class="language-json" v-html="highlightedManifest" /></pre>
      <textarea
        class="manifest-editor__input"
        :value="modelValue"
        aria-label="Agent manifest (JSON)"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        @input="updateValue"
        @scroll="syncScroll"
        @keydown="insertIndent"
      />
    </div>
    <div class="manifest-field__details">
      <span :class="error ? 'text-error' : 'text-medium-emphasis'">
        {{ error ? 'Manifest must be valid JSON.' : 'CE supports prompt steps, conditions, variables, and read-only Site tools.' }}
      </span>
      <span class="text-medium-emphasis">JSON · {{ lineCount }} lines</span>
    </div>
  </div>
</template>

<style scoped>
.manifest-field {
  position: relative;
  padding-top: 7px;
}

.manifest-field__label {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 12px;
  padding: 0 5px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: rgb(var(--v-theme-surface));
  font-size: 12px;
  line-height: 14px;
}

.manifest-editor {
  position: relative;
  height: clamp(320px, 48vh, 520px);
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.manifest-field:focus-within .manifest-editor {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.manifest-field--error .manifest-editor {
  border-color: rgb(var(--v-theme-error));
}

.manifest-field--error:focus-within .manifest-editor {
  box-shadow: 0 0 0 1px rgb(var(--v-theme-error));
}

.manifest-editor__highlight,
.manifest-editor__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 20px 18px;
  overflow: auto;
  border: 0;
  tab-size: 2;
  white-space: pre;
  overflow-wrap: normal;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  font-variant-ligatures: none;
  line-height: 1.6;
}

.manifest-editor__highlight {
  pointer-events: none;
}

.manifest-editor__input {
  z-index: 1;
  resize: none;
  outline: none;
  color: transparent;
  background: transparent;
  caret-color: rgb(var(--v-theme-on-surface));
  -webkit-text-fill-color: transparent;
}

.manifest-editor__input::selection {
  background: rgba(var(--v-theme-primary), 0.24);
}

.manifest-field__details {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 12px 0;
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 600px) {
  .manifest-editor {
    height: 360px;
  }

  .manifest-field__details {
    display: block;
  }

  .manifest-field__details span {
    display: block;
  }
}
</style>
