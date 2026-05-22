/**
 * Composable for parsing and categorizing Handlebars expressions for syntax highlighting
 */

export type HandlebarsTokenType =
  | 'default-var'
  | 'defined-var'
  | 'undefined-var'
  | 'helper'
  | 'tool'
  | 'text'

export interface HandlebarsToken {
  type: HandlebarsTokenType
  content: string
  start: number
  end: number
}

/**
 * Set of default variables available in all contexts (both camelCase and snake_case)
 */
const DEFAULT_VARIABLES = new Set([
  // Universal defaults
  'date',
  'currentDate',
  'current_date',
  'year',
  'currentYear',
  'current_year',
  'month',
  'day',
  'currentDateTime',
  'current_date_time',
  // Chat-specific
  'chatName',
  'chat_name',
])

/**
 * Checks if a variable name is a default variable
 * Supports dot notation (e.g., "step-1.address.city" - checks root "step-1")
 */
function isDefaultVariable(varName: string): boolean {
  // Extract root variable name (before first dot)
  const rootVar = varName.split('.')[0]

  // Check if it's a step variable pattern (step-1, step-2, etc.)
  if (/^step-\d+$/.test(rootVar)) {
    return false // Step variables are custom (from step outputs)
  }

  // Check if it's a default variable
  return DEFAULT_VARIABLES.has(rootVar)
}

/**
 * Parses Handlebars expressions from content and categorizes them
 * @param content The text content to parse
 * @param definedVariables Optional array of defined variable keys (e.g., ['userName', 'companyName'])
 * @param availableTools Optional array of available AI tool names (e.g., ['retrieve_context', 'list_sites'])
 * @returns Array of tokens with type, content, and position information
 */
export function parseHandlebarsExpressions(
  content: string,
  definedVariables: string[] = [],
  availableTools: string[] = [],
): HandlebarsToken[] {
  const tokens: HandlebarsToken[] = []
  const normalizedDefinedVariables = new Set(
    definedVariables.map(variable => variable.trim().toLowerCase()).filter(Boolean),
  )

  // Regex to match Handlebars expressions, ignoring escaped ones with backticks
  // Matches: {{...}}, {{#...}}, {{/...}}, {{else}}, etc.
  const handlebarsRegex = /(?<!`){{\s*(#?\/?)([^{}]+?)\s*}}(?!`)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = handlebarsRegex.exec(content)) !== null) {
    const fullMatch = match[0]
    const start = match.index
    const end = start + fullMatch.length
    const prefix = match[1] // #, /, or empty
    const innerContent = match[2].trim()

    // Add text before this match, scanning for tools
    if (start > lastIndex) {
      const textBefore = content.substring(lastIndex, start)
      const textTokens = parseToolsInText(textBefore, lastIndex, availableTools)
      tokens.push(...textTokens)
    }

    // Determine token type
    let tokenType: HandlebarsTokenType = 'undefined-var'

    // Check if it's a helper (block helper or closing tag)
    if (prefix === '#' || prefix === '/' || innerContent === 'else') {
      tokenType = 'helper'
    } else {
      // Extract root variable name (before first dot)
      const rootVar = innerContent.split('.')[0]

      // Check if it's a default variable
      if (isDefaultVariable(innerContent)) {
        tokenType = 'default-var'
      } else if (normalizedDefinedVariables.has(rootVar.trim().toLowerCase())) {
        // Check if it's a defined variable (supports dot notation - if rootVar is defined, then rootVar.property is also defined)
        tokenType = 'defined-var'
      } else {
        // Otherwise it's undefined
        tokenType = 'undefined-var'
      }
    }

    tokens.push({
      type: tokenType,
      content: fullMatch,
      start,
      end,
    })

    lastIndex = end
  }

  // Add remaining text, scanning for tools
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex)
    const textTokens = parseToolsInText(remainingText, lastIndex, availableTools)
    tokens.push(...textTokens)
  }

  return tokens
}

// Cache for tool regexes keyed by sorted tool names
const toolRegexCache = new Map<string, RegExp>()

/**
 * Parses plain text for AI tool names and returns tokens
 */
function parseToolsInText(
  text: string,
  offset: number,
  availableTools: string[],
): HandlebarsToken[] {
  const tokens: HandlebarsToken[] = []

  if (!text || availableTools.length === 0) {
    if (text) {
      tokens.push({
        type: 'text',
        content: text,
        start: offset,
        end: offset + text.length,
      })
    }
    return tokens
  }

  // Create a regex that matches any of the available tools as whole words
  // Sort by length descending to match longer names first (e.g., 'retrieve_context' before 'retrieve')
  const sortedTools = [...availableTools].sort((a, b) => b.length - a.length)
  const toolsKey = sortedTools.join(',')

  // Check cache first
  let toolRegex = toolRegexCache.get(toolsKey)
  if (!toolRegex) {
    // Escape regex special characters in tool names
    const escapedTools = sortedTools.map(tool => tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Use lookarounds for word boundaries that allow punctuation after tool names
    toolRegex = new RegExp(`(?<!\\S)(${escapedTools.join('|')})(?=$|\\s|[.,;:!?()])`, 'g')
    toolRegexCache.set(toolsKey, toolRegex)
  }

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = toolRegex.exec(text)) !== null) {
    const toolName = match[0]
    const start = match.index
    const end = start + toolName.length

    // Add text before this tool match
    if (start > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.substring(lastIndex, start),
        start: offset + lastIndex,
        end: offset + start,
      })
    }

    // Add the tool token
    tokens.push({
      type: 'tool',
      content: toolName,
      start: offset + start,
      end: offset + end,
    })

    lastIndex = end
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.substring(lastIndex),
      start: offset + lastIndex,
      end: offset + text.length,
    })
  }

  return tokens
}

/**
 * Composable function for Handlebars syntax highlighting
 * @param definedVariables Array of defined variable names
 * @param availableTools Array of available AI tool names
 * @returns Object with parsing function and utility functions
 */
export function useHandlebarsHighlight(
  definedVariables: string[] = [],
  availableTools: string[] = [],
) {
  return {
    parseHandlebarsExpressions: (content: string) =>
      parseHandlebarsExpressions(content, definedVariables, availableTools),
    isDefaultVariable,
  }
}
