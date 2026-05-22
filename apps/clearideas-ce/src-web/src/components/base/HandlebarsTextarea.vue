<script setup lang="ts">
import { useHandlebarsHighlight } from '../../composables/useHandlebarsHighlight'
import { parseMetadataSearchExpressions } from '../../utils/metadataSearch'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { VIcon } from 'vuetify/components'

interface Props {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  rows?: number | string
  maxRows?: number | string
  autoGrow?: boolean
  density?: 'default' | 'comfortable' | 'compact'
  clearable?: boolean
  clearIcon?: string
  variant?: string
  hideDetails?: boolean
  rules?: Array<(v: any) => boolean | string>
  class?: string | string[] | Record<string, boolean>
  maxlength?: number | string
  counter?: boolean | number | string
  persistentPlaceholder?: boolean
  persistentCounter?: boolean
  readonly?: boolean
  allowLineBreaks?: boolean
  definedVariables?: string[]
  availableTools?: string[]
  highlightMode?: 'handlebars' | 'metadataSearch'
  placeholderAlign?: 'center' | 'top'
  contentPaddingInline?: number | string
  contentPaddingTop?: number | string
  contentPaddingBottom?: number | string
  contentOffsetTop?: number | string
  placeholderOffsetInline?: number | string
  placeholderOffsetTop?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  rows: 1,
  maxRows: 10,
  autoGrow: false,
  density: 'default',
  clearable: false,
  clearIcon: 'fasl fa-xmark',
  variant: 'plain',
  hideDetails: true,
  rules: () => [],
  class: '',
  maxlength: undefined,
  counter: false,
  persistentPlaceholder: false,
  persistentCounter: false,
  readonly: false,
  allowLineBreaks: true,
  definedVariables: () => [],
  availableTools: () => [],
  highlightMode: 'handlebars',
  placeholderAlign: 'center',
  contentPaddingInline: 0,
  contentPaddingTop: 0,
  contentPaddingBottom: 0,
  contentOffsetTop: 0,
  placeholderOffsetInline: 0,
  placeholderOffsetTop: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  'click:clear': []
  keydown: [event: KeyboardEvent]
}>()

// Create reactive parser that updates when definedVariables or availableTools change
const parseHandlebarsExpressions = computed(() => {
  const { parseHandlebarsExpressions: parser } = useHandlebarsHighlight(
    props.definedVariables,
    props.availableTools,
  )
  return parser
})
const editorRef = ref<HTMLDivElement>()
const isFocused = ref(false)
const isUpdating = ref(false)
const lastKnownCursorOffset = ref(0)
const EMPTY_EDITOR_CONTENT = '\u200B'

// Computed for character count
const characterCount = computed(() => {
  return props.modelValue?.length || 0
})

const wrapperStyle = computed(() => {
  const fontSize =
    props.density === 'compact' ? '0.875rem' : props.density === 'comfortable' ? '1rem' : '1rem'

  return {
    '--handlebars-textarea-font-size': fontSize,
    '--handlebars-textarea-line-height': '1.5',
    '--handlebars-textarea-padding-inline':
      typeof props.contentPaddingInline === 'number'
        ? `${props.contentPaddingInline}px`
        : props.contentPaddingInline,
    '--handlebars-textarea-padding-top':
      typeof props.contentPaddingTop === 'number'
        ? `${props.contentPaddingTop}px`
        : props.contentPaddingTop,
    '--handlebars-textarea-padding-bottom':
      typeof props.contentPaddingBottom === 'number'
        ? `${props.contentPaddingBottom}px`
        : props.contentPaddingBottom,
    '--handlebars-textarea-content-offset-top':
      typeof props.contentOffsetTop === 'number'
        ? `${props.contentOffsetTop}px`
        : props.contentOffsetTop,
    '--handlebars-textarea-placeholder-offset-inline':
      typeof props.placeholderOffsetInline === 'number'
        ? `${props.placeholderOffsetInline}px`
        : props.placeholderOffsetInline,
    '--handlebars-textarea-placeholder-offset-top':
      typeof props.placeholderOffsetTop === 'number'
        ? `${props.placeholderOffsetTop}px`
        : props.placeholderOffsetTop,
  }
})

// Computed for max length validation

// Extract plain text from HTML content
function extractTextFromHTML(html: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = html
  const text = temp.textContent || temp.innerText || ''
  // Remove zero-width spaces that we added for cursor placement
  return text.replace(/\u200B/g, '')
}

// Build highlighted HTML from text content
function buildHighlightedHTML(text: string): string {
  if (!text) return ''

  const tokens =
    props.highlightMode === 'metadataSearch'
      ? parseMetadataSearchExpressions(text)
      : parseHandlebarsExpressions.value(text)

  // Build HTML ensuring there's always a text node after each token for cursor placement
  let result = ''
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'text') {
      // Escape HTML in text content
      result += token.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    } else {
      // Apply CSS classes based on token type
      let className = 'handlebars-token'
      if (token.type === 'default-var') {
        className += ' handlebars-default-var'
      } else if (token.type === 'defined-var') {
        className += ' handlebars-defined-var'
      } else if (token.type === 'undefined-var') {
        className += ' handlebars-undefined-var'
      } else if (token.type === 'helper') {
        className += ' handlebars-helper'
      } else if (token.type === 'tool') {
        className += ' handlebars-tool'
      } else if (token.type === 'metadata-search-token') {
        className += ' metadata-search-token'
      }

      // Escape HTML in the token content
      const escapedContent = token.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

      result += `<span class="${className}" data-token="${escapedContent}">${escapedContent}</span>`

      // Add zero-width space after token if there's no text token following
      // This ensures there's always a text node for cursor placement
      if (i === tokens.length - 1 || tokens[i + 1].type !== 'text') {
        result += '\u200B'
      }
    }
  }

  return result
}

function applyEditorHeight() {
  if (!editorRef.value) return

  if (props.autoGrow) {
    // Reset height to auto to get accurate scrollHeight
    editorRef.value.style.height = 'auto'

    // Calculate max height based on maxRows
    if (props.maxRows) {
      const lineHeight = parseFloat(getComputedStyle(editorRef.value).lineHeight) || 24
      const padding = parseFloat(getComputedStyle(editorRef.value).paddingTop) * 2 || 24
      const maxHeight = Number(props.maxRows) * lineHeight + padding
      editorRef.value.style.maxHeight = `${maxHeight}px`
    } else {
      editorRef.value.style.maxHeight = 'none'
    }

    // Set height to scrollHeight for auto-grow
    const scrollHeight = editorRef.value.scrollHeight
    editorRef.value.style.height = `${scrollHeight}px`
    editorRef.value.style.overflowY =
      scrollHeight > parseFloat(editorRef.value.style.maxHeight || '9999') ? 'auto' : 'hidden'
  } else if (props.rows) {
    // Set fixed height based on rows
    const lineHeight = parseFloat(getComputedStyle(editorRef.value).lineHeight) || 24
    const padding = parseFloat(getComputedStyle(editorRef.value).paddingTop) * 2 || 24
    const height = Number(props.rows) * lineHeight + padding
    editorRef.value.style.height = `${height}px`
  }
}

// Save cursor position with text offset (excluding zero-width spaces)
function saveCursorPositionWithOffset(): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editorRef.value) {
    return lastKnownCursorOffset.value
  }

  const range = selection.getRangeAt(0)
  if (!editorRef.value.contains(range.commonAncestorContainer)) {
    return lastKnownCursorOffset.value
  }

  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(editorRef.value)
  preCaretRange.setEnd(range.endContainer, range.endOffset)

  // Get text up to cursor and remove zero-width spaces for accurate offset
  const textUpToCursor = preCaretRange.toString().replace(/\u200B/g, '')
  lastKnownCursorOffset.value = textUpToCursor.length
  return lastKnownCursorOffset.value
}

// Restore cursor position using text offset
function restoreCursorPositionWithOffset(offset: number) {
  if (!editorRef.value) return

  try {
    const selection = window.getSelection()
    if (!selection) return

    const text = extractTextFromHTML(editorRef.value.innerHTML)
    const targetOffset = Math.min(offset, text.length)

    // Note: We don't use a walker here, we manually traverse childNodes

    let currentOffset = 0
    let targetNode: Node | null = null
    let targetNodeOffset = 0
    let isAfterElement = false

    // Get all child nodes (text nodes and token spans) in order
    const childNodes: Node[] = []
    if (editorRef.value) {
      for (let i = 0; i < editorRef.value.childNodes.length; i++) {
        childNodes.push(editorRef.value.childNodes[i])
      }
    }

    // Walk through nodes in order
    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i]

      if (node.nodeType === Node.TEXT_NODE) {
        // Calculate length excluding zero-width spaces
        const nodeText = node.textContent || ''
        const nodeLength = nodeText.replace(/\u200B/g, '').length

        if (currentOffset + nodeLength >= targetOffset) {
          // Find the actual offset in the text node accounting for zero-width spaces
          let actualOffset = 0
          let textOffset = 0
          for (let j = 0; j < nodeText.length; j++) {
            if (nodeText[j] !== '\u200B') {
              if (currentOffset + textOffset >= targetOffset) {
                break
              }
              textOffset++
            }
            actualOffset++
          }

          targetNode = node
          targetNodeOffset = actualOffset
          break
        }

        currentOffset += nodeLength
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).classList.contains('handlebars-token')
      ) {
        // It's a token span
        const element = node as HTMLElement
        const elementText = element.textContent || ''
        const elementLength = elementText.length // Token text doesn't contain zero-width spaces

        if (currentOffset + elementLength >= targetOffset) {
          // Check if cursor is exactly at the end of the token
          if (targetOffset === currentOffset + elementLength) {
            // Cursor is at the end of the token
            // Check if there's a text node after this token
            let nextNode: Node | null = null
            if (i + 1 < childNodes.length) {
              nextNode = childNodes[i + 1]
            }

            if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
              // Place cursor at start of next text node
              // If it's just a zero-width space, cursor will be at start and typing will replace it
              targetNode = nextNode
              targetNodeOffset = 0
            } else {
              // No text node after, place cursor after the span
              targetNode = element
              targetNodeOffset = 0
              isAfterElement = true
            }
          } else {
            // Cursor is inside the token, find the text node inside
            const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
            let textNode: Node | null = null
            let textOffset = targetOffset - currentOffset

            while ((textNode = textWalker.nextNode())) {
              const textLength = textNode.textContent?.length || 0
              if (textOffset <= textLength) {
                targetNode = textNode
                targetNodeOffset = textOffset
                break
              }
              textOffset -= textLength
            }
          }
          break
        }

        currentOffset += elementLength
      }
    }

    // If we didn't find a node, place cursor at end
    if (!targetNode && editorRef.value.lastChild) {
      const lastChild = editorRef.value.lastChild
      if (lastChild.nodeType === Node.TEXT_NODE) {
        targetNode = lastChild
        targetNodeOffset = lastChild.textContent?.length || 0
      } else if (lastChild.nodeType === Node.ELEMENT_NODE) {
        // Last child is an element (token span), place cursor after it
        targetNode = lastChild
        targetNodeOffset = 0
        isAfterElement = true
      }
    }

    if (targetNode) {
      const range = document.createRange()

      if (isAfterElement && targetNode.nodeType === Node.ELEMENT_NODE) {
        // Place cursor after the element
        range.setStartAfter(targetNode)
        range.setEndAfter(targetNode)
      } else if (targetNode.nodeType === Node.TEXT_NODE) {
        const maxOffset = targetNode.textContent?.length || 0
        range.setStart(targetNode, Math.min(targetNodeOffset, maxOffset))
        range.setEnd(targetNode, Math.min(targetNodeOffset, maxOffset))
      } else if (targetNode.nodeType === Node.ELEMENT_NODE) {
        // Find text node inside element
        const textWalker = document.createTreeWalker(targetNode, NodeFilter.SHOW_TEXT, null)
        const firstTextNode = textWalker.nextNode()
        if (firstTextNode) {
          const maxOffset = firstTextNode.textContent?.length || 0
          range.setStart(firstTextNode, Math.min(targetNodeOffset, maxOffset))
          range.setEnd(firstTextNode, Math.min(targetNodeOffset, maxOffset))
        } else {
          range.setStart(targetNode, 0)
          range.setEnd(targetNode, 0)
        }
      }

      selection.removeAllRanges()
      selection.addRange(range)
      lastKnownCursorOffset.value = targetOffset
    }
  } catch {
    // Fallback: place cursor at end
    const selection = window.getSelection()
    if (selection && editorRef.value) {
      const range = document.createRange()
      range.selectNodeContents(editorRef.value)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
      lastKnownCursorOffset.value = extractTextFromHTML(editorRef.value.innerHTML).length
    }
  }
}

function rememberCursorPosition() {
  lastKnownCursorOffset.value = saveCursorPositionWithOffset()
}

// Update content with highlighting
async function updateContent() {
  if (!editorRef.value || isUpdating.value) return

  isUpdating.value = true

  const text = extractTextFromHTML(editorRef.value.innerHTML)
  const offset = saveCursorPositionWithOffset()

  // Build highlighted HTML
  const highlightedHTML = buildHighlightedHTML(text)

  // Update innerHTML
  editorRef.value.innerHTML = highlightedHTML || EMPTY_EDITOR_CONTENT

  // Handle auto-grow
  applyEditorHeight()

  // Restore cursor position
  await nextTick()
  restoreCursorPositionWithOffset(offset)

  // Emit update
  emit('update:modelValue', text)

  isUpdating.value = false
}

// Handle input events
function handleInput(_event: Event) {
  if (isUpdating.value) return
  rememberCursorPosition()

  // Check maxlength
  if (props.maxlength) {
    const text = extractTextFromHTML(editorRef.value?.innerHTML || '')
    if (text.length > Number(props.maxlength)) {
      // Truncate to maxlength
      const truncated = text.substring(0, Number(props.maxlength))
      if (editorRef.value) {
        editorRef.value.innerHTML = buildHighlightedHTML(truncated) || EMPTY_EDITOR_CONTENT
        const selection = window.getSelection()
        if (selection && editorRef.value) {
          const range = document.createRange()
          range.selectNodeContents(editorRef.value)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
      emit('update:modelValue', truncated)
      return
    }
  }

  updateContent()
}

// Insert text at cursor position (used by external components)
function insertTextAtCursor(text: string) {
  // editorRef is a template ref to the contenteditable div element
  const editorEl = editorRef.value
  if (!editorEl) return

  const offsetBeforeFocus = saveCursorPositionWithOffset()

  // Ensure editor has focus
  editorEl.focus()
  restoreCursorPositionWithOffset(offsetBeforeFocus)

  const selection = window.getSelection()
  if (!selection) return

  // If no selection or range, place cursor at end
  if (selection.rangeCount === 0) {
    if (!editorRef.value) return
    const textNode = document.createTextNode(text)
    editorRef.value.appendChild(textNode)
    const range = document.createRange()
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  } else {
    const range = selection.getRangeAt(0)
    range.deleteContents()

    const textNode = document.createTextNode(text)
    range.insertNode(textNode)

    // Move cursor after inserted text
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  // Update content after insert
  nextTick(() => {
    updateContent()
    // Ensure focus is maintained after update
    editorRef.value?.focus()
  })
}

// Handle paste events
function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  insertTextAtCursor(text)
}

// Find token element at cursor position
function findTokenAtCursor(): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  let node: Node | null = range.startContainer

  // Walk up the DOM tree to find token span
  while (node && node !== editorRef.value) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.classList.contains('handlebars-token')) {
        return element
      }
    }
    node = node.parentNode
  }

  return null
}

// Find token before cursor position (for backspace)
function findTokenBeforeCursor(): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  let node: Node | null = range.startContainer

  // If cursor is in a text node, check if there's a token element right before it
  if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
    // Cursor is at the start of a text node, check previous sibling
    const prevSibling = node.previousSibling
    if (
      prevSibling &&
      prevSibling.nodeType === Node.ELEMENT_NODE &&
      (prevSibling as HTMLElement).classList.contains('handlebars-token')
    ) {
      return prevSibling as HTMLElement
    }
  }

  // Check if cursor is at the end of a token (inside the token but at the end)
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    const parent = textNode.parentElement
    if (
      parent &&
      parent.classList.contains('handlebars-token') &&
      range.startOffset === textNode.textContent?.length
    ) {
      return parent
    }
  }

  // Walk up the DOM tree to find token span
  while (node && node !== editorRef.value) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.classList.contains('handlebars-token')) {
        // Check if cursor is at the end of this token
        const range = selection.getRangeAt(0)
        const textContent = element.textContent || ''
        if (range.startOffset === textContent.length) {
          return element
        }
      }
    }
    node = node.parentNode
  }

  return null
}

// Handle keydown for token deletion
function handleKeyDown(event: KeyboardEvent) {
  if (props.disabled) return

  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    emit('keydown', event)
    if (event.defaultPrevented) return

    if (!props.allowLineBreaks) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    insertTextAtCursor('\n')
    return
  }

  // Handle Backspace
  if (event.key === 'Backspace' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    // First check if cursor is inside a token (at any position)
    const tokenAtCursor = findTokenAtCursor()
    if (tokenAtCursor) {
      event.preventDefault()
      tokenAtCursor.remove()
      updateContent()
      return
    }

    // Check if cursor is right after a token (at start of text node after token)
    const tokenBeforeCursor = findTokenBeforeCursor()
    if (tokenBeforeCursor) {
      event.preventDefault()
      tokenBeforeCursor.remove()
      updateContent()
      return
    }
  }

  // Handle Delete
  if (event.key === 'Delete' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const token = findTokenAtCursor()

    if (token && range.startOffset === 0) {
      event.preventDefault()
      token.remove()
      updateContent()
      return
    }
  }

  emit('keydown', event)
}

// Handle focus
function handleFocus(event: FocusEvent) {
  isFocused.value = true
  rememberCursorPosition()
  emit('focus', event)
}

// Handle blur
function handleBlur(event: FocusEvent) {
  rememberCursorPosition()
  isFocused.value = false
  emit('blur', event)
}

function focusEditorAtEnd() {
  if (!editorRef.value) return

  editorRef.value.focus()

  const selection = window.getSelection()
  if (!selection) return

  const textLength = extractTextFromHTML(editorRef.value.innerHTML).length
  restoreCursorPositionWithOffset(textLength)
}

function handleWrapperClick(event: MouseEvent) {
  if (props.disabled || props.readonly) return
  const target = event.target
  if (target instanceof Element && target.closest('.clear-icon')) return
  if (target instanceof Node && editorRef.value?.contains(target)) return
  focusEditorAtEnd()
}

// Handle clear button click
function handleClear() {
  if (editorRef.value) {
    editorRef.value.innerHTML = EMPTY_EDITOR_CONTENT
    emit('update:modelValue', '')
    emit('click:clear')
  }
}

// Watch modelValue changes from outside
watch(
  () => props.modelValue,
  newValue => {
    if (!editorRef.value || isUpdating.value) return

    const currentText = extractTextFromHTML(editorRef.value.innerHTML)
    if (currentText !== newValue) {
      isUpdating.value = true
      editorRef.value.innerHTML = buildHighlightedHTML(newValue) || EMPTY_EDITOR_CONTENT
      applyEditorHeight()
      isUpdating.value = false
    }
  },
)

// Initialize content on mount
onMounted(() => {
  if (editorRef.value) {
    if (props.modelValue) {
      editorRef.value.innerHTML = buildHighlightedHTML(props.modelValue) || EMPTY_EDITOR_CONTENT
    } else {
      editorRef.value.innerHTML = EMPTY_EDITOR_CONTENT
    }

    applyEditorHeight()
  }
})

// Computed classes
const editorClasses = computed(() => {
  const classes: string[] = ['handlebars-textarea-editor']

  if (props.density === 'compact') {
    classes.push('density-compact')
  } else if (props.density === 'comfortable') {
    classes.push('density-comfortable')
  }

  if (props.variant === 'plain') {
    classes.push('variant-plain')
  }

  if (isFocused.value) {
    classes.push('focused')
  }

  if (props.disabled) {
    classes.push('disabled')
  }

  if (props.readonly) {
    classes.push('readonly')
  }

  return classes.join(' ')
})

// Expose methods for parent component
// Save cursor position for later restoration
function saveCursorPosition(): number {
  return saveCursorPositionWithOffset()
}

// Restore cursor position
function restoreCursorPosition(offset: number) {
  restoreCursorPositionWithOffset(offset)
}

defineExpose({
  focus: focusEditorAtEnd,
  blur: () => editorRef.value?.blur(),
  insertTextAtCursor,
  saveCursorPosition,
  restoreCursorPosition,
  getPlainText: () => extractTextFromHTML(editorRef.value?.innerHTML || ''),
  getCursorPosition: () => saveCursorPositionWithOffset(),
  getEditorElement: () => editorRef.value,
})
</script>

<template>
  <div
    class="handlebars-textarea-wrapper"
    :class="props.class"
    :style="wrapperStyle"
    @click="handleWrapperClick"
  >
    <div
      ref="editorRef"
      :contenteditable="!disabled && !readonly"
      :class="editorClasses"
      @input="handleInput"
      @paste="handlePaste"
      @keydown="handleKeyDown"
      @keyup="rememberCursorPosition"
      @mouseup="rememberCursorPosition"
      @focus="handleFocus"
      @blur="handleBlur"
    ></div>
    <div
      v-if="placeholder && !modelValue && (!isFocused || persistentPlaceholder)"
      class="handlebars-textarea-placeholder"
      :class="{
        'handlebars-textarea-placeholder--top': props.placeholderAlign === 'top',
      }"
    >
      {{ placeholder }}
    </div>
    <VIcon
      v-if="clearable && modelValue && !disabled && !readonly"
      :icon="clearIcon"
      class="clear-icon"
      v-tippy="{ content: 'Clear' }"
      @click="handleClear"
    />
    <div v-if="counter && !hideDetails" class="counter-text">
      {{ characterCount }}{{ maxlength ? ` / ${maxlength}` : '' }}
    </div>
  </div>
</template>

<style scoped>
.handlebars-textarea-wrapper {
  position: relative;
  width: 100%;
}

.handlebars-textarea-editor {
  width: 100%;
  min-height: 40px;
  padding-top: calc(
    var(--handlebars-textarea-padding-top) + var(--handlebars-textarea-content-offset-top)
  );
  padding-right: calc(var(--handlebars-textarea-padding-inline) + 30px) !important;
  padding-bottom: var(--handlebars-textarea-padding-bottom);
  padding-left: var(--handlebars-textarea-padding-inline);
  font-size: var(--handlebars-textarea-font-size);
  line-height: var(--handlebars-textarea-line-height);
  color: rgb(var(--v-theme-on-surface));
  background-color: transparent;
  border: none;
  outline: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  overflow-y: auto;
  resize: none;
  box-sizing: border-box;
}

.handlebars-textarea-placeholder {
  position: absolute;
  top: 50%;
  left: calc(
    var(--handlebars-textarea-padding-inline) + var(--handlebars-textarea-placeholder-offset-inline)
  );
  right: 30px;
  transform: translateY(calc(-50% + var(--handlebars-textarea-placeholder-offset-top)));
  font-size: var(--handlebars-textarea-font-size);
  line-height: var(--handlebars-textarea-line-height);
  color: rgba(var(--v-theme-on-surface), 0.38);
  pointer-events: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.handlebars-textarea-placeholder--top {
  top: calc(
    var(--handlebars-textarea-padding-top) + var(--handlebars-textarea-placeholder-offset-top)
  );
  transform: none;
}

.handlebars-textarea-editor:focus {
  outline: none;
}

.handlebars-textarea-editor.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.density-compact {
  min-height: 32px;
}

.density-comfortable {
  min-height: 48px;
}

.variant-plain {
  padding: 0;
  min-height: auto;
}

.clear-icon {
  position: absolute;
  top: calc(50% - 12px);
  right: 0px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
  height: 24px;
}

.clear-icon:hover {
  opacity: 1;
}

.counter-text {
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  pointer-events: none;
}

.handlebars-textarea-editor.readonly {
  opacity: 0.7;
  cursor: default;
}

/* Token styling is in global handlebars.scss */
</style>
