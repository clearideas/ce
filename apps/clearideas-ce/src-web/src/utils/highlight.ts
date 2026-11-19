/**
 * Shared highlight.js instance with a curated language set.
 *
 * Importing `highlight.js` (the full bundle) pulls ~190 grammars (~1 MB minified) into the
 * markdown chunk. The UI only ever highlights the languages below: code files the viewer supports
 * (`useContentTypes().CodeContentTypes`), agent manifests (JSON) and fenced blocks in docs/AI output.
 * Add a grammar here if a new content type or doc language needs it.
 */
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

// Common aliases used in fenced code blocks.
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['js', 'mjs', 'cjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'xhtml', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['text', 'txt', 'csv', 'log'], { languageName: 'plaintext' })
hljs.registerAliases(['py'], { languageName: 'python' })

export { hljs }
