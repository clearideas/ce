<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { computed } from 'vue'

interface Props {
  content: string
  stripFrontMatter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  stripFrontMatter: true,
})

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    const value = language === 'plaintext'
      ? markdown.utils.escapeHtml(str)
      : hljs.highlight(str, { language, ignoreIllegals: true }).value
    return `<pre class="hljs"><code class="language-${language}">${value}</code></pre>`
  },
})

function stripFrontMatter(content: string) {
  if (!content.trim()) return content
  const lines = content.split('\n')
  if (lines.length < 2 || lines[0].trim() !== '---') return content

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      return lines.slice(index + 1).join('\n').trim()
    }
  }

  return content
}

const renderedContent = computed(() => {
  const content = props.stripFrontMatter ? stripFrontMatter(props.content ?? '') : props.content ?? ''
  return markdown.render(content)
})
</script>
<template>
  <div class="w-100">
    <div class="markdown-content chart-container" v-html="renderedContent" />
  </div>
</template>
