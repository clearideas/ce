#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = findRepoRoot(process.cwd())
const routesRoot = path.join(root, 'apps/clearideas-ce/src/routes')
const appFile = path.join(root, 'apps/clearideas-ce/src/app.ts')
const failures = []

const PUBLIC_ROUTES = new Map([
  [key('core.routes.ts', 'GET', '/health'), 'health check'],
  [key('auth.routes.ts', 'POST', '/code/send'), 'auth email-code bootstrap'],
  [key('auth.routes.ts', 'POST', '/code/verify'), 'auth email-code bootstrap'],
  [key('auth.routes.ts', 'ALL', '/{*any}'), 'Better Auth public/internal auth endpoints'],
  [key('mcp.routes.ts', 'GET', '/mcp'), 'MCP status only'],
  [key('mcp.routes.ts', 'OPTIONS', '/mcp'), 'MCP CORS preflight'],
  [key('app.ts', 'GET', '/api/app-config'), 'browser bootstrap configuration'],
])

const QUERY_VALIDATED_ROUTES = new Set([
  key('core.routes.ts', 'GET', '/site/:siteId/file/:fileId/token'),
  key('analytics.routes.ts', 'GET', '/analytics/dashboard'),
])

const BODY_VALIDATION_EXEMPTIONS = new Map()

const SESSION_AUTH = ['attachAuthContext', 'requireAuthContext']
const TOKEN_AUTH = ['accessKeyAuth', 'requireViewToken', 'requireDownloadToken', 'requireUploadToken']
const SITE_ROLE_MIDDLEWARE = [
  'requireSiteAdmin',
  'requireSiteRead',
  'requireSiteUploader',
  'requireSiteEditor',
  'requireUploadTargetUploader',
  'requireActivityTargetRead',
  'attachReadableSiteIds',
  'attachAdminSiteIds',
  'requireViewToken',
  'requireDownloadToken',
  'requireUploadToken',
  'accessKeyAuth',
]
const SITE_ROLE_EXEMPTIONS = new Map([
  [key('core.routes.ts', 'GET', '/sites'), 'list is scoped by service query'],
  [key('core.routes.ts', 'GET', '/sites/suppressed'), 'own suppressed site list'],
  [key('core.routes.ts', 'POST', '/sites'), 'creates owned site'],
  [key('core.routes.ts', 'PATCH', '/site/:siteId/invitation/accept'), 'own invitation state'],
  [key('core.routes.ts', 'PATCH', '/site/:siteId/invitation/decline'), 'own invitation state'],
  [key('core.routes.ts', 'PATCH', '/site/:siteId/invitation/suppress'), 'own invitation state'],
])

const routes = [
  ...parseRouteFiles(routesRoot),
  ...parseAppRoutes(appFile),
]

for (const route of routes) validateRoute(route)

printReport(routes)

if (failures.length > 0) {
  console.error('\nCE route validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nCE route validation OK')

function validateRoute(route) {
  const routeKey = key(route.file, route.method, route.path)
  const publicReason = PUBLIC_ROUTES.get(routeKey)
  const middlewareText = route.middlewares.join(' ')
  const isPublic = Boolean(publicReason)
  const hasSessionAuth = SESSION_AUTH.every(name => route.middlewares.includes(name))
  const hasTokenAuth = TOKEN_AUTH.some(name => route.middlewares.includes(name))

  if (!isPublic && !hasSessionAuth && !hasTokenAuth) {
    failures.push(`${route.label} is neither explicitly public nor protected by session/access/file/upload token middleware`)
  }

  if (route.parameters.length > 0 && !hasMiddleware(route, 'validateParams')) {
    failures.push(`${route.label} has path params (${route.parameters.join(', ')}) but no validateParams(...) middleware`)
  }

  if (QUERY_VALIDATED_ROUTES.has(routeKey) && !hasMiddleware(route, 'validateQuery')) {
    failures.push(`${route.label} is expected to validate query params but has no validateQuery(...) middleware`)
  }

  if (requiresBodyValidation(route) && !hasMiddleware(route, 'validateBody')) {
    failures.push(`${route.label} accepts a body but has no validateBody(...) middleware`)
  }

  if (requiresSiteRole(route) && !SITE_ROLE_MIDDLEWARE.some(name => route.middlewares.includes(name))) {
    failures.push(`${route.label} is site/resource scoped but has no site-role/scope middleware`)
  }
}

function findRepoRoot(start) {
  let dir = start
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'apps/clearideas-ce/src/routes'))) return dir
    dir = path.dirname(dir)
  }
  return start
}

function hasMiddleware(route, name) {
  return route.middlewares.some(middleware => middleware === name || middleware.startsWith(`${name}(`))
}

function requiresBodyValidation(route) {
  if (!['POST', 'PUT', 'PATCH'].includes(route.method)) return false
  return !BODY_VALIDATION_EXEMPTIONS.has(key(route.file, route.method, route.path))
}

function requiresSiteRole(route) {
  const routeKey = key(route.file, route.method, route.path)
  if (PUBLIC_ROUTES.has(routeKey) || SITE_ROLE_EXEMPTIONS.has(routeKey)) return false
  if (route.path.includes(':siteId')) return true
  return [
    '/search',
    '/activities',
    '/files/upload-target',
    '/files/upload/:fileId',
    '/files/view/:fileId',
    '/files/download/:fileId',
    '/analytics/',
    '/mcp',
  ].some(pattern => route.path === pattern || route.path.startsWith(pattern))
}

function parseRouteFiles(dir) {
  const routes = []
  for (const filePath of listFiles(dir).filter(file => file.endsWith('.ts'))) {
    const file = path.basename(filePath)
    const text = fs.readFileSync(filePath, 'utf8')
    routes.push(...extractCalls(text, file, /\brouter\.(get|post|put|patch|delete|head|options|all)\s*\(/g))
  }
  return routes
}

function parseAppRoutes(filePath) {
  if (!fs.existsSync(filePath)) return []
  const text = fs.readFileSync(filePath, 'utf8')
  return extractCalls(text, 'app.ts', /\bapp\.(get|post|put|patch|delete|head|options|all)\s*\(/g)
    .filter(route => route.path.startsWith('/api'))
}

function extractCalls(text, file, pattern) {
  const routes = []
  for (const match of text.matchAll(pattern)) {
    const method = match[1].toUpperCase()
    const openParen = match.index + match[0].length - 1
    const closeParen = findMatchingParen(text, openParen)
    if (closeParen < 0) continue
    const args = splitTopLevelArgs(text.slice(openParen + 1, closeParen))
    const routePath = normalizePath(args[0])
    if (!routePath) continue
    const middlewares = args.slice(1, -1).map(arg => normalizeMiddleware(arg)).filter(Boolean)
    const line = text.slice(0, match.index).split(/\r?\n/).length
    routes.push({
      file,
      method,
      path: routePath,
      parameters: [...routePath.matchAll(/:([A-Za-z0-9_]+)/g)].map(param => param[1]),
      middlewares,
      line,
      label: `${file}:${line} ${method} ${routePath}`,
    })
  }
  return routes
}

function normalizePath(arg) {
  const trimmed = arg.trim()
  const stringMatch = trimmed.match(/^['"`]([^'"`]+)['"`]$/)
  return stringMatch?.[1] ?? ''
}

function normalizeMiddleware(arg) {
  const trimmed = arg.trim()
  if (!trimmed) return ''
  const direct = trimmed.match(/^([A-Za-z_$][\w$]*)\b/)
  if (direct) return direct[1]
  const asyncHandler = trimmed.match(/^asyncHandler\(([^)]+)\)/)
  if (asyncHandler) return `asyncHandler(${asyncHandler[1].trim()})`
  return trimmed.replace(/\s+/g, ' ').slice(0, 120)
}

function splitTopLevelArgs(source) {
  const args = []
  let current = ''
  let depth = 0
  let quote = ''
  let escape = false
  for (const char of source) {
    if (quote) {
      current += char
      if (escape) {
        escape = false
      } else if (char === '\\') {
        escape = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth++
    if (char === ')' || char === ']' || char === '}') depth--
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function findMatchingParen(text, openIndex) {
  let depth = 0
  let quote = ''
  let escape = false
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (escape) {
        escape = false
      } else if (char === '\\') {
        escape = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth++
    if (char === ')') {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}

function key(file, method, routePath) {
  return `${file}:${method}:${routePath}`
}

function printReport(routes) {
  const publicCount = routes.filter(route => PUBLIC_ROUTES.has(key(route.file, route.method, route.path))).length
  console.log('CE Route Validation')
  console.log('====================')
  console.log(`Routes analyzed: ${routes.length}`)
  console.log(`Explicit public routes: ${publicCount}`)
  console.log(`Protected routes: ${routes.length - publicCount}`)
}
