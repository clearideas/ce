const baseUrl = process.env.CE_SMOKE_BASE_URL ?? 'http://127.0.0.1:4100'
const apiBasePath = process.env.CE_SMOKE_API_BASE_PATH ?? '/api'
const email = process.env.CE_SMOKE_EMAIL ?? `smoke-${Date.now()}@clearideas.local`
const code = process.env.CE_SMOKE_CODE

let cookie = ''

function toApiPath(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (cleanPath === apiBasePath || cleanPath.startsWith(`${apiBasePath}/`)) return cleanPath
  return `${apiBasePath}${cleanPath}`
}

async function api(path: string, options: RequestInit = {}) {
  const apiPath = toApiPath(path)
  const response = await fetch(`${baseUrl}${apiPath}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(',').map(x => x.split(';')[0]).join('; ')

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${apiPath} failed: ${JSON.stringify(body)}`)
  }
  return body
}

await api('/health')
await api('/auth/code/send', {
  method: 'POST',
  body: JSON.stringify({ email }),
})
if (!code) {
  throw new Error('CE_SMOKE_CODE is required after /auth/code/send. Read the code from the log email output and rerun smoke with CE_SMOKE_CODE=<code>.')
}
await api('/auth/code/verify', {
  method: 'POST',
  body: JSON.stringify({ email, code, name: 'CE Smoke' }),
})

const siteResponse = await api('/sites', {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke Site' }),
})
const siteId = siteResponse.site.id

const folderResponse = await api(`/sites/${siteId}/folders`, {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke Folder' }),
})
const folderId = folderResponse.folder.id

await api(`/site/${siteId}/content/${folderId}`, { method: 'DELETE' })
const afterDeleteSites = await api('/sites')
const afterDeleteSite = afterDeleteSites.sites.find((site: any) => site.id === siteId)
if (afterDeleteSite?.folders?.some((folder: any) => folder.id === folderId)) {
  throw new Error('Deleted smoke folder is still present')
}

const targetResponse = await api('/files/upload-target', {
  method: 'POST',
  body: JSON.stringify({
    siteId,
    fileName: 'smoke.txt',
    contentType: 'text/plain',
    size: 'hello from smoke'.length,
  }),
})

const upload = await fetch(`${baseUrl}${targetResponse.target.url}`, {
  method: targetResponse.target.method ?? 'PUT',
  body: 'hello from smoke',
  headers: {
    'content-type': 'text/plain',
    ...(targetResponse.target.headers ?? {}),
  },
})
if (!upload.ok) throw new Error(`PUT upload failed: ${upload.status}`)

const searchResponse = await api(`/site/${siteId}/search`, {
  method: 'POST',
  body: JSON.stringify({ q: 'smoke' }),
})
const uploadedFile = searchResponse.results?.find((item: any) => item.name === 'smoke.txt')
if (!uploadedFile?.id) throw new Error('Uploaded file was not searchable')

const fileResponse = await api(`/site/${siteId}/file/${uploadedFile.id}`)
if (!fileResponse.file?.viewUrl) throw new Error('File view URL missing')

const view = await fetch(`${baseUrl}${fileResponse.file.viewUrl}`, {
  headers: { cookie },
})
if (!view.ok) throw new Error(`GET file view failed: ${view.status} ${await view.text()}`)

const accessKeyResponse = await api('/account/access-keys', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Smoke MCP Key',
    keyType: 'mcp',
    scopes: ['mcp:read'],
  }),
})

const mcpPath = toApiPath('/mcp')
const mcp = await fetch(`${baseUrl}${mcpPath}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${accessKeyResponse.key}`,
  },
  body: JSON.stringify({ tool: 'clearideas.search_content', args: { q: 'smoke' } }),
})
if (!mcp.ok) throw new Error(`POST ${mcpPath} failed: ${mcp.status} ${await mcp.text()}`)

await api('/activities', {
  method: 'POST',
  body: JSON.stringify({
    action: 'viewed',
    target: siteId,
    onModel: 'Site',
    parent: siteId,
    parentOnModel: 'Site',
    attributes: { source: 'ce-smoke' },
  }),
})

await api('/analytics/dashboard')
await api('/analytics/monthly-active-users', { method: 'POST', body: JSON.stringify({}) })

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      email,
      siteId,
      folderId,
    },
    null,
    2,
  ),
)

export {}
