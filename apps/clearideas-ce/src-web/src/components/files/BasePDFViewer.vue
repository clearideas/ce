<script setup lang="ts">
import ScrollCue from '../base/ScrollCue.vue'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  type ComponentPublicInstance,
  computed,
  type HTMLAttributes,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useSlots,
  watch,
} from 'vue'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

type ViewMode = 'single' | 'spread'
type ScrollMode = 'paged' | 'continuous'
type FitMode = 'manual' | 'page' | 'width'
type InteractionMode = 'text' | 'hand'

type SearchTextItem = {
  text: string
  start: number
  end: number
  x: number
  y: number
  width: number
  height: number
}

type SearchMatch = {
  id: string
  pageNumber: number
  itemIndexes: number[]
  start: number
  end: number
}

type PageMeta = {
  pageNumber: number
  width: number
  height: number
  text: string
  textItems: SearchTextItem[]
  thumbnailUrl: string
  searchReady: boolean
  thumbnailReady: boolean
}

interface Props {
  pdfUrl?: string
  pdfData?: Uint8Array | ArrayBuffer | null
  loadingLabel: string
  noPagesLabel: string
  failedLoadLabel: string
  failedRenderLabel: string
  borderWidth?: number
  borderRadius?: string
  pageChrome?: boolean
  toolbarDivider?: boolean
  toolbarBottomInset?: number
  initialPage?: number
  searchEnabled?: boolean
  rotateEnabled?: boolean
  printEnabled?: boolean
  qaAnchorsEnabled?: boolean
  analyticsSiteId?: string | null
  analyticsContentId?: string | null
  pageClass?: (pageNumber: number) => HTMLAttributes['class']
  withCredentials?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  borderWidth: 1,
  borderRadius: '6px',
  pageChrome: true,
  toolbarDivider: true,
  toolbarBottomInset: 0,
  initialPage: 1,
  searchEnabled: true,
  rotateEnabled: false,
  printEnabled: false,
  qaAnchorsEnabled: false,
  analyticsSiteId: null,
  analyticsContentId: null,
  pageClass: undefined,
  withCredentials: false,
  pdfUrl: '',
  pdfData: null,
})
const slots = useSlots()

const suppressViewerEvent = (..._args: any[]) => undefined

const t = (key: string, params?: Record<string, any>) => {
  const labels: Record<string, string> = {
    'files.sharedPdfViewer.controls.documentViewport': 'PDF document viewport',
    'files.sharedPdfViewer.controls.pages': 'Pages',
    'files.sharedPdfViewer.navigator.title': 'Pages',
    'files.sharedPdfViewer.search.search': 'Search',
    'files.sharedPdfViewer.search.placeholder': 'Search document',
    'files.sharedPdfViewer.search.previousMatch': 'Previous match',
    'files.sharedPdfViewer.search.nextMatch': 'Next match',
    'files.sharedPdfViewer.search.noMatches': 'No matches',
    'files.sharedPdfViewer.search.matchCount': `${params?.current ?? 0} of ${params?.total ?? 0}`,
    'files.sharedPdfViewer.search.pageLabel': `Page ${params?.page ?? ''}`,
    'files.sharedPdfViewer.interaction.title': 'Interaction mode',
    'files.sharedPdfViewer.interaction.selectTextMode': 'Select text',
    'files.sharedPdfViewer.interaction.panMode': 'Pan',
    'files.sharedPdfViewer.interaction.copySelection': 'Copy selection',
    'files.sharedPdfViewer.interaction.searchSelection': 'Search selection',
    'files.sharedPdfViewer.controls.rotatePage': 'Rotate page',
    'files.sharedPdfViewer.controls.print': 'Print',
    'files.sharedPdfViewer.controls.pageNumber': 'Page number',
    'files.sharedPdfViewer.controls.previousPage': 'Previous page',
    'files.sharedPdfViewer.controls.nextPage': 'Next page',
    'files.sharedPdfViewer.controls.viewOptions': 'View options',
    'files.sharedPdfViewer.view.singlePage': 'Single page',
    'files.sharedPdfViewer.view.twoPage': 'Two page',
    'files.sharedPdfViewer.view.paged': 'Paged',
    'files.sharedPdfViewer.view.scrolling': 'Scrolling',
    'files.sharedPdfViewer.view.fitPage': 'Fit page',
    'files.sharedPdfViewer.view.fitWidth': 'Fit width',
    'files.sharedPdfViewer.controls.zoomOut': 'Zoom out',
    'files.sharedPdfViewer.controls.zoomIn': 'Zoom in',
  }
  return labels[key] ?? key
}
const copyToClipboard = (value: string) => void navigator.clipboard?.writeText(value)

const MIN_SCALE = 0.55
const MAX_SCALE = 2.5
const SCALE_STEP = 0.15
const PAGE_GAP = 20
const FIT_MARGIN = 11

const stageRef = ref<HTMLElement | null>(null)
const shellRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLElement | null>(null)
const searchResultsRef = ref<HTMLElement | null>(null)
const resizeObserverRef = ref<ResizeObserver | null>(null)
const pdfDocument = shallowRef<any | null>(null)
const activeDocumentLoadingTask = shallowRef<any | null>(null)
const renderTasks = new Map<number, any>()
const renderQueues = new Map<number, Promise<void>>()
const renderRequestIds = new Map<number, number>()
const pageCanvases = new Map<number, HTMLCanvasElement>()
const pageElements = new Map<number, HTMLElement>()
const textLayerContainers = new Map<number, HTMLElement>()
const textLayers = new Map<number, any>()
const pages = ref<PageMeta[]>([])
const loading = ref(false)
const error = ref('')
const errorDescription = ref('')
const currentPage = ref(1)
const pageInput = ref('1')
const scale = ref(1)
const viewMode = ref<ViewMode>('single')
const scrollMode = ref<ScrollMode>('paged')
const fitMode = ref<FitMode>('width')
const interactionMode = ref<InteractionMode>('text')
const manualZoomAlignment = ref<Exclude<FitMode, 'manual'> | null>('width')
const searchQuery = ref('')
const searchMatches = ref<SearchMatch[]>([])
const activeSearchIndex = ref(-1)
const pageRotations = ref<Record<number, number>>({})
const renderGeneration = ref(0)
const scrollFrame = ref<number | null>(null)
const searchFrame = ref<number | null>(null)
const lastTrackedPage = ref<number | null>(null)
const didLogDocumentOpen = ref(false)
const showViewMenu = ref(false)
const showSearchMenu = ref(false)
const showPagesMenu = ref(false)
const showInteractionMenu = ref(false)
const printing = ref(false)
const SEARCH_DEBOUNCE_MS = 250
const searchResultsScrollState = ref({ up: false, down: false })
const isPanning = ref(false)
const selectionMenu = ref<{
  text: string
  x: number
  y: number
  page: number
  rects: Array<{ page: number; x: number; y: number; width: number; height: number }>
} | null>(null)
const panState = ref<{
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
  canPanX: boolean
  canPanY: boolean
} | null>(null)
const recentActivityLogTimes = new Map<string, number>()

const ACTIVITY_DEDUP_WINDOW_MS: Partial<Record<string, number>> = {
  'viewer-document-open': 3000,
  'viewer-page-view': 1200,
  'viewer-zoom-level': 800,
  'viewer-text-search': 800,
}

const hasToolbarTopSlot = computed(() => Boolean(slots['toolbar-top']))
const hasAnalyticsContext = computed(() =>
  Boolean(props.analyticsSiteId && props.analyticsContentId),
)

const currentPageMeta = computed(
  () => pages.value.find(page => page.pageNumber === currentPage.value) ?? null,
)

const visiblePageNumbers = computed(() => {
  if (scrollMode.value === 'continuous') return pages.value.map(page => page.pageNumber)
  if (viewMode.value === 'spread') {
    const secondPage = currentPage.value + 1
    return secondPage <= pages.value.length ? [currentPage.value, secondPage] : [currentPage.value]
  }
  return [currentPage.value]
})

const visiblePages = computed(
  () =>
    visiblePageNumbers.value
      .map(pageNumber => pages.value.find(page => page.pageNumber === pageNumber))
      .filter(Boolean) as PageMeta[],
)

const effectivePagedFitMode = computed<FitMode>(() => {
  if (fitMode.value !== 'manual') return fitMode.value
  return manualZoomAlignment.value ?? 'manual'
})

const shouldCenterPagedFitWidth = computed(
  () => scrollMode.value === 'paged' && effectivePagedFitMode.value === 'width',
)

const shouldCenterPagedFitPage = computed(
  () => scrollMode.value === 'paged' && effectivePagedFitMode.value === 'page',
)

const shouldCenterContinuousFit = computed(
  () =>
    scrollMode.value === 'continuous' &&
    (effectivePagedFitMode.value === 'width' || effectivePagedFitMode.value === 'page'),
)

const renderedSearchMatches = computed(() => {
  const activeMatch =
    activeSearchIndex.value >= 0 ? searchMatches.value[activeSearchIndex.value] : null
  const highlightsByPage = new Map<number, Array<SearchMatch & { active: boolean }>>()

  for (const match of searchMatches.value) {
    const list = highlightsByPage.get(match.pageNumber) ?? []
    list.push({ ...match, active: activeMatch?.id === match.id })
    highlightsByPage.set(match.pageNumber, list)
  }

  return highlightsByPage
})

const searchResultEntries = computed(() =>
  searchMatches.value.map((match, index) => ({
    ...match,
    index,
    contextParts: searchMatchContext(match),
  })),
)

function normalizeErrorText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function extractPdfErrorReasons(error: unknown) {
  if (!error) {
    return []
  }

  if (typeof error === 'string') {
    return [error.trim()].filter(Boolean)
  }

  if (typeof error !== 'object') {
    return [String(error)].filter(Boolean)
  }

  const source = error as Record<string, unknown>
  const reasons = [
    normalizeErrorText(source.name),
    normalizeErrorText(source.message),
    normalizeErrorText(source.details),
    normalizeErrorText(source.statusText),
    normalizeErrorText(source.code),
  ]

  if (typeof source.status === 'number') {
    reasons.push(`HTTP ${source.status}`)
  }

  const stringValue = normalizeErrorText(String(error))
  if (stringValue && stringValue !== '[object Object]') {
    reasons.push(stringValue)
  }

  const cause = source.cause
  if (cause && cause !== error) {
    reasons.push(...extractPdfErrorReasons(cause))
  }

  return Array.from(new Set(reasons.filter(Boolean)))
}

function describePdfLoadError(primaryError: unknown, fallbackError?: unknown) {
  const primaryReasons = extractPdfErrorReasons(primaryError)
  const fallbackReasons = extractPdfErrorReasons(fallbackError)

  if (primaryReasons.length === 0 && fallbackReasons.length === 0) {
    return props.failedLoadLabel
  }

  const allReasons = Array.from(new Set([...primaryReasons, ...fallbackReasons]))
  return `${props.failedLoadLabel} ${allReasons.join(' | ')}`
}

function formatLoadError(error: unknown) {
  return {
    summary: props.failedLoadLabel,
    description: extractPdfErrorReasons(error).join(' | '),
  }
}

function clearErrorState() {
  error.value = ''
  errorDescription.value = ''
}

function setLoadError(errorValue: unknown) {
  const formatted = formatLoadError(errorValue)
  error.value = formatted.summary
  errorDescription.value = formatted.description
}

function syncPageInput() {
  pageInput.value = String(currentPage.value)
}

function clampPage(pageNumber: number) {
  return Math.min(Math.max(pageNumber, 1), pages.value.length || 1)
}

function logViewerActivity(_action: string, _attributes?: Record<string, any>) {
  // CE logs file views at /api/files/view/:fileId. The viewer itself does not emit analytics.
}

function toolbarTippy(content: string) {
  return {
    content,
    placement: 'left',
  }
}

function selectionMenuStyle() {
  if (!selectionMenu.value) return undefined
  return {
    left: `${selectionMenu.value.x}px`,
    top: `${selectionMenu.value.y}px`,
  }
}

const viewerRootStyle = computed(() => ({
  '--ci-pdf-viewer-border-width': `${Math.max(0, props.borderWidth)}px`,
  '--ci-pdf-viewer-border-radius': props.borderRadius,
}))

const toolbarStyle = computed(() => ({
  paddingBottom: `${10 + Math.max(0, props.toolbarBottomInset)}px`,
}))

function hideSelectionMenu(options?: { clearSelection?: boolean }) {
  selectionMenu.value = null
  if (!options?.clearSelection) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
}

function normalizeSelectionText(text: string) {
  return text.normalize('NFKC').trim()
}

function selectionTextWithinViewer() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const text = normalizeSelectionText(selection.toString())
  if (!text) return null

  const range = selection.getRangeAt(0)
  const ancestor = range.commonAncestorContainer
  const ancestorElement = ancestor instanceof Element ? ancestor : ancestor.parentElement
  if (!ancestorElement?.closest('.ci-pdf-viewer__text-layer')) return null

  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) return null

  const selectionRects = Array.from(range.getClientRects()).filter(
    item => item.width > 0 && item.height > 0,
  )
  const pageEntry = [...pageElements.entries()].find(([, element]) =>
    element.contains(ancestorElement),
  )
  const pageNumber = pageEntry?.[0] ?? currentPage.value
  const rects = selectionRects
    .map(selectionRect => {
      const matchingPageEntry =
        [...pageElements.entries()].find(([, element]) => {
          const pageRect = element.getBoundingClientRect()
          return (
            selectionRect.left < pageRect.right &&
            selectionRect.right > pageRect.left &&
            selectionRect.top < pageRect.bottom &&
            selectionRect.bottom > pageRect.top
          )
        }) ?? pageEntry
      const page = matchingPageEntry?.[0] ?? pageNumber
      const pageElement = matchingPageEntry?.[1] ?? pageElements.get(page)
      const pageRect = pageElement?.getBoundingClientRect()
      if (!pageRect || pageRect.width <= 0 || pageRect.height <= 0) return null

      const left = Math.max(selectionRect.left, pageRect.left)
      const top = Math.max(selectionRect.top, pageRect.top)
      const right = Math.min(selectionRect.right, pageRect.right)
      const bottom = Math.min(selectionRect.bottom, pageRect.bottom)
      if (right <= left || bottom <= top) return null

      return {
        page,
        x: Math.max(0, Math.min(1, (left - pageRect.left) / pageRect.width)),
        y: Math.max(0, Math.min(1, (top - pageRect.top) / pageRect.height)),
        width: Math.max(0, Math.min(1, (right - left) / pageRect.width)),
        height: Math.max(0, Math.min(1, (bottom - top) / pageRect.height)),
      }
    })
    .filter(
      (item): item is { page: number; x: number; y: number; width: number; height: number } =>
        item != null,
    )

  return {
    text,
    rect,
    page: pageNumber,
    rects,
  }
}

function toDomElement(element: Element | ComponentPublicInstance | null): Element | null {
  return element instanceof Element ? element : null
}

function setSearchInputRef(element: Element | ComponentPublicInstance | null) {
  const domElement = toDomElement(element)
  searchInputRef.value = domElement instanceof HTMLElement ? domElement : null
}

function setSearchResultsRef(element: Element | ComponentPublicInstance | null) {
  const domElement = toDomElement(element)
  searchResultsRef.value = domElement instanceof HTMLElement ? domElement : null
}

function emitZoomState() {
  const payload = {
    scale: Number(scale.value.toFixed(2)),
    viewMode: viewMode.value,
    scrollMode: scrollMode.value,
    fitMode: fitMode.value,
  }
  suppressViewerEvent('zoom-change', payload)
  logViewerActivity('viewer-zoom-level', payload)
}

function normalizedRotation(pageNumber: number) {
  const rotation = pageRotations.value[pageNumber] ?? 0
  return ((rotation % 360) + 360) % 360
}

function pageDisplayDimensions(page: PageMeta) {
  const rotation = normalizedRotation(page.pageNumber)
  const quarterTurn = rotation === 90 || rotation === 270
  return {
    width: quarterTurn ? page.height : page.width,
    height: quarterTurn ? page.width : page.height,
  }
}

function getZoomViewportSnapshot(pageNumber: number) {
  const stage = stageRef.value
  const pageElement = getPageElement(pageNumber)
  if (!stage || !pageElement) return null

  const viewportCenterX = stage.scrollLeft + stage.clientWidth / 2
  const viewportCenterY = stage.scrollTop + stage.clientHeight / 2
  const pageLeft = pageElement.offsetLeft
  const pageTop = pageElement.offsetTop

  return {
    pageNumber,
    pageXRatio:
      pageElement.offsetWidth > 0 ? (viewportCenterX - pageLeft) / pageElement.offsetWidth : 0.5,
    pageYRatio:
      pageElement.offsetHeight > 0 ? (viewportCenterY - pageTop) / pageElement.offsetHeight : 0.5,
  }
}

function restoreZoomViewportSnapshot(
  snapshot: { pageNumber: number; pageXRatio: number; pageYRatio: number } | null,
) {
  const stage = stageRef.value
  const pageElement = snapshot ? getPageElement(snapshot.pageNumber) : null
  if (!stage || !snapshot || !pageElement) return

  const clampedXRatio = Math.min(Math.max(snapshot.pageXRatio, 0), 1)
  const clampedYRatio = Math.min(Math.max(snapshot.pageYRatio, 0), 1)
  const nextScrollLeft =
    pageElement.offsetLeft + pageElement.offsetWidth * clampedXRatio - stage.clientWidth / 2
  const nextScrollTop =
    pageElement.offsetTop + pageElement.offsetHeight * clampedYRatio - stage.clientHeight / 2
  const maxScrollLeft = Math.max(0, stage.scrollWidth - stage.clientWidth)
  const maxScrollTop = Math.max(0, stage.scrollHeight - stage.clientHeight)

  stage.scrollLeft = Math.min(Math.max(0, nextScrollLeft), maxScrollLeft)
  stage.scrollTop = Math.min(Math.max(0, nextScrollTop), maxScrollTop)
}

function updateCurrentPage(
  pageNumber: number,
  options?: {
    silentScroll?: boolean
    trackPageView?: boolean
    scrollBehavior?: ScrollBehavior
  },
) {
  const nextPage = clampPage(pageNumber)
  if (!nextPage) return

  const changed = currentPage.value !== nextPage
  currentPage.value = nextPage
  syncPageInput()

  if (changed) {
    suppressViewerEvent('page-change', nextPage)
    if (options?.trackPageView !== false && lastTrackedPage.value !== nextPage) {
      logViewerActivity('viewer-page-view', { pageNumber: nextPage })
      lastTrackedPage.value = nextPage
    }
  }

  if (!options?.silentScroll) {
    void nextTick(() => scrollPageIntoView(nextPage, options?.scrollBehavior))
  }
}

function handlePageInputCommit() {
  const parsed = Number.parseInt(pageInput.value, 10)
  if (!Number.isFinite(parsed)) {
    syncPageInput()
    return
  }
  updateCurrentPage(parsed)
}

function goToPreviousPage() {
  updateCurrentPage(currentPage.value - 1)
}

function goToNextPage() {
  const step = scrollMode.value === 'paged' && viewMode.value === 'spread' ? 2 : 1
  updateCurrentPage(currentPage.value + step)
}

function setCanvasRef(pageNumber: number, element: Element | ComponentPublicInstance | null) {
  const domElement = toDomElement(element)
  if (domElement instanceof HTMLCanvasElement) pageCanvases.set(pageNumber, domElement)
  else pageCanvases.delete(pageNumber)
}

function setPageElementRef(pageNumber: number, element: Element | ComponentPublicInstance | null) {
  const domElement = toDomElement(element)
  if (domElement instanceof HTMLElement) pageElements.set(pageNumber, domElement)
  else pageElements.delete(pageNumber)
}

function setTextLayerRef(pageNumber: number, element: Element | ComponentPublicInstance | null) {
  const domElement = toDomElement(element)
  if (domElement instanceof HTMLElement) textLayerContainers.set(pageNumber, domElement)
  else {
    textLayerContainers.delete(pageNumber)
    clearTextLayer(pageNumber)
  }
}

function getPageElement(pageNumber: number) {
  return pageElements.get(pageNumber) ?? null
}

function pageStyle(page: PageMeta) {
  const dimensions = pageDisplayDimensions(page)
  return {
    width: `${dimensions.width * scale.value}px`,
    height: `${dimensions.height * scale.value}px`,
    '--user-unit': '1',
    '--scale-factor': String(scale.value),
    '--total-scale-factor': String(scale.value),
    '--scale-round-x': '1px',
    '--scale-round-y': '1px',
  }
}

function searchHighlightStyle(page: PageMeta, match: SearchMatch) {
  const firstItem = page.textItems[match.itemIndexes[0]]
  const lastItem = page.textItems[match.itemIndexes[match.itemIndexes.length - 1]]
  if (!firstItem || !lastItem) return null

  const x = Math.min(...match.itemIndexes.map(index => page.textItems[index]?.x ?? 0))
  const y = Math.min(...match.itemIndexes.map(index => page.textItems[index]?.y ?? 0))
  const right = Math.max(
    ...match.itemIndexes.map(index => {
      const item = page.textItems[index]
      return (item?.x ?? 0) + (item?.width ?? 0)
    }),
  )
  const bottom = Math.max(
    ...match.itemIndexes.map(index => {
      const item = page.textItems[index]
      return (item?.y ?? 0) + (item?.height ?? 0)
    }),
  )

  const rotation = normalizedRotation(page.pageNumber)
  const sourceWidth = page.width
  const sourceHeight = page.height
  const rectWidth = right - x
  const rectHeight = bottom - y

  let left = x
  let top = y
  let width = rectWidth
  let height = rectHeight
  let targetWidth = sourceWidth
  let targetHeight = sourceHeight

  if (rotation === 90) {
    left = sourceHeight - (y + rectHeight)
    top = x
    width = rectHeight
    height = rectWidth
    targetWidth = sourceHeight
    targetHeight = sourceWidth
  } else if (rotation === 180) {
    left = sourceWidth - (x + rectWidth)
    top = sourceHeight - (y + rectHeight)
  } else if (rotation === 270) {
    left = y
    top = sourceWidth - (x + rectWidth)
    width = rectHeight
    height = rectWidth
    targetWidth = sourceHeight
    targetHeight = sourceWidth
  }

  return {
    left: `${(left / targetWidth) * 100}%`,
    top: `${(top / targetHeight) * 100}%`,
    width: `${(width / targetWidth) * 100}%`,
    height: `${(height / targetHeight) * 100}%`,
  }
}

function searchMatchContext(match: SearchMatch) {
  const page = pages.value.find(item => item.pageNumber === match.pageNumber)
  if (!page?.text) {
    return {
      before: '',
      match: '',
      after: '',
    }
  }

  const contextPadding = 28
  const start = Math.max(0, match.start - contextPadding)
  const end = Math.min(page.text.length, match.end + contextPadding)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < page.text.length ? '...' : ''
  const before = `${prefix}${page.text.slice(start, match.start)}`.trimStart()
  const matchedText = page.text.slice(match.start, match.end)
  const after = `${page.text.slice(match.end, end)}${suffix}`.trimEnd()

  return {
    before,
    match: matchedText,
    after,
  }
}

function updateSearchResultsScrollState() {
  const element = searchResultsRef.value
  if (!element) {
    searchResultsScrollState.value = { up: false, down: false }
    return
  }

  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  searchResultsScrollState.value = {
    up: element.scrollTop > 4,
    down: element.scrollTop < maxScrollTop - 4,
  }
}

function cancelRenderTask(pageNumber: number) {
  const task = renderTasks.get(pageNumber)
  if (!task) return

  try {
    task.cancel()
  } catch {
    // Ignore stale render cancellations.
  }
  renderTasks.delete(pageNumber)
}

function cancelAllRenderTasks() {
  for (const pageNumber of renderTasks.keys()) cancelRenderTask(pageNumber)
  renderQueues.clear()
  renderRequestIds.clear()
}

function clearTextLayer(pageNumber: number) {
  const textLayer = textLayers.get(pageNumber)
  if (textLayer) {
    try {
      textLayer.cancel()
    } catch {
      // Ignore stale text layer cancellation failures.
    }
    textLayers.delete(pageNumber)
  }

  const container = textLayerContainers.get(pageNumber)
  if (container) {
    container.replaceChildren()
  }
}

function clearAllTextLayers() {
  for (const pageNumber of textLayers.keys()) {
    clearTextLayer(pageNumber)
  }
  for (const container of textLayerContainers.values()) {
    container.replaceChildren()
  }
}

async function cancelActiveDocumentLoading() {
  const task = activeDocumentLoadingTask.value
  if (!task) return

  activeDocumentLoadingTask.value = null
  try {
    await task.destroy()
  } catch {
    // Ignore stale document loading cancellation failures.
  }
}

function normalizeTextContent(pageHeight: number, textContent: any) {
  const items: SearchTextItem[] = []
  let fullText = ''

  for (const item of textContent.items ?? []) {
    const text = String(item?.str ?? '')
    if (!text.trim()) continue

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
    const x = Number(transform[4] ?? 0)
    const height = Math.abs(Number(item.height ?? transform[3] ?? 0))
    const width = Math.abs(Number(item.width ?? 0))
    const top = Math.max(0, pageHeight - Number(transform[5] ?? 0))
    const y = Math.max(0, top - height)
    const separator = fullText.length > 0 ? ' ' : ''
    const start = fullText.length + separator.length

    fullText += separator + text
    items.push({
      text,
      start,
      end: start + text.length,
      x,
      y,
      width,
      height: Math.max(height, 8),
    })
  }

  return {
    text: fullText,
    textItems: items,
  }
}

async function renderThumbnail(pdf: any, pageNumber: number, width: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const scaleRatio = Math.min(0.26, width > 0 ? 116 / width : 0.26)
  const thumbnailViewport = page.getViewport({ scale: scaleRatio })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return ''

  canvas.width = Math.ceil(thumbnailViewport.width)
  canvas.height = Math.ceil(thumbnailViewport.height)
  await page.render({ canvasContext: context, viewport: thumbnailViewport }).promise
  return canvas.toDataURL('image/png')
}

async function getPageSearchData(page: any, pageHeight: number) {
  if (!props.searchEnabled) {
    return {
      text: '',
      textItems: [] as SearchTextItem[],
    }
  }

  try {
    const textContent = await page.getTextContent()
    return normalizeTextContent(pageHeight, textContent)
  } catch {
    return {
      text: '',
      textItems: [] as SearchTextItem[],
    }
  }
}

async function ensurePageSearchData(pageNumber: number) {
  const pageMeta = pages.value.find(page => page.pageNumber === pageNumber)
  const pdf = pdfDocument.value
  if (!pageMeta || !pdf || pageMeta.searchReady) return pageMeta

  try {
    const page = await pdf.getPage(pageNumber)
    const normalized = await getPageSearchData(page, pageMeta.height)
    pageMeta.text = normalized.text
    pageMeta.textItems = normalized.textItems
  } catch {
    pageMeta.text = ''
    pageMeta.textItems = []
  } finally {
    pageMeta.searchReady = true
  }

  return pageMeta
}

async function ensureThumbnail(pageNumber: number) {
  const pageMeta = pages.value.find(page => page.pageNumber === pageNumber)
  const pdf = pdfDocument.value
  if (!pageMeta || !pdf || pageMeta.thumbnailReady) return pageMeta

  try {
    pageMeta.thumbnailUrl = await renderThumbnail(pdf, pageNumber, pageMeta.width)
  } catch {
    pageMeta.thumbnailUrl = ''
  } finally {
    pageMeta.thumbnailReady = true
  }

  return pageMeta
}

async function loadPdfDocument(url: string, withCredentials: boolean) {
  const loadingTask = pdfjsLib.getDocument({
    url,
    withCredentials,
  })
  activeDocumentLoadingTask.value = loadingTask

  try {
    const pdf = await loadingTask.promise
    return { pdf, loadingTask, withCredentials }
  } catch (error) {
    if (activeDocumentLoadingTask.value === loadingTask) {
      activeDocumentLoadingTask.value = null
    }
    throw error
  }
}

async function loadPdfDocumentFromData(data: Uint8Array | ArrayBuffer) {
  const sourceData = data instanceof Uint8Array ? data : new Uint8Array(data)
  const loadingTask = pdfjsLib.getDocument({
    data: sourceData,
  })
  activeDocumentLoadingTask.value = loadingTask

  try {
    const pdf = await loadingTask.promise
    return { pdf, loadingTask }
  } catch (error) {
    if (activeDocumentLoadingTask.value === loadingTask) {
      activeDocumentLoadingTask.value = null
    }
    throw error
  }
}

async function loadPdf() {
  if (!props.pdfUrl && !props.pdfData) return

  renderGeneration.value += 1
  const generation = renderGeneration.value
  loading.value = true
  clearErrorState()
  didLogDocumentOpen.value = false
  lastTrackedPage.value = null
  recentActivityLogTimes.clear()
  searchMatches.value = []
  activeSearchIndex.value = -1
  pages.value = []

  clearAllTextLayers()
  cancelAllRenderTasks()
  await cancelActiveDocumentLoading()
  pdfDocument.value = null

  try {
    let loaded:
      | {
          pdf: any
          loadingTask: any
          withCredentials?: boolean
        }
      | undefined

    if (props.pdfData) {
      loaded = await loadPdfDocumentFromData(props.pdfData)
    } else {
      let primaryLoadError: unknown

      try {
        loaded = await loadPdfDocument(props.pdfUrl!, props.withCredentials)
      } catch (initialError) {
        primaryLoadError = initialError
        loaded = await loadPdfDocument(props.pdfUrl!, !props.withCredentials).catch(
          fallbackError => {
            throw new Error(describePdfLoadError(primaryLoadError, fallbackError))
          },
        )
      }
    }

    const { pdf, loadingTask } = loaded

    if (generation !== renderGeneration.value || activeDocumentLoadingTask.value !== loadingTask) {
      await pdf.destroy()
      return
    }

    activeDocumentLoadingTask.value = null
    pdfDocument.value = pdf
    pageRotations.value = {}
    const nextPages: PageMeta[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })

      nextPages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        text: '',
        textItems: [],
        thumbnailUrl: '',
        searchReady: false,
        thumbnailReady: false,
      })
    }

    pages.value = nextPages
    loading.value = false
    await nextTick()
    applyFitMode()

    const initialPage = clampPage(props.initialPage || 1)
    updateCurrentPage(initialPage, { silentScroll: true, trackPageView: false })
    await nextTick()
    await renderVisiblePages()
    scrollPageIntoView(initialPage, 'auto')

    if (!didLogDocumentOpen.value) {
      didLogDocumentOpen.value = true
      suppressViewerEvent('document-open', { pageCount: nextPages.length })
      logViewerActivity('viewer-document-open')
      if (initialPage > 0) {
        logViewerActivity('viewer-page-view', { pageNumber: initialPage })
        lastTrackedPage.value = initialPage
      }
    }
  } catch (err: any) {
    setLoadError(err)
  } finally {
    loading.value = false
  }
}

function visibleStageWidthForFit() {
  const stage = stageRef.value
  if (!stage) return 0
  const availableWidth = Math.max(0, stage.clientWidth - FIT_MARGIN * 2)
  if (viewMode.value === 'spread') {
    return Math.max(0, (availableWidth - PAGE_GAP) / 2)
  }
  return availableWidth
}

function visibleStageHeightForFit() {
  const stage = stageRef.value
  if (!stage) return 0
  return Math.max(0, stage.clientHeight - FIT_MARGIN * 2)
}

function applyFitMode() {
  const page = currentPageMeta.value
  if (!page || fitMode.value === 'manual') return

  const availableWidth = visibleStageWidthForFit()
  const availableHeight = visibleStageHeightForFit()
  if (!availableWidth || !availableHeight) return

  const dimensions = pageDisplayDimensions(page)
  const widthScale = availableWidth / dimensions.width
  const heightScale = availableHeight / dimensions.height
  const nextScale = fitMode.value === 'width' ? widthScale : Math.min(widthScale, heightScale)

  scale.value = Number(Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale)).toFixed(2))
}

function setFitMode(nextMode: FitMode) {
  fitMode.value = nextMode
  if (nextMode !== 'manual') {
    manualZoomAlignment.value = nextMode
  }
  if (fitMode.value !== 'manual') {
    applyFitMode()
  }
  void nextTick(async () => {
    await renderVisiblePages()
    scrollPageIntoView(currentPage.value)
    emitZoomState()
    showViewMenu.value = false
  })
}

function setViewMode(nextMode: ViewMode) {
  viewMode.value = nextMode
  if (fitMode.value !== 'manual') applyFitMode()
  void nextTick(async () => {
    await renderVisiblePages()
    scrollPageIntoView(currentPage.value)
    emitZoomState()
  })
}

function setScrollMode(nextMode: ScrollMode) {
  const snapshot = getZoomViewportSnapshot(currentPage.value)
  scrollMode.value = nextMode
  if (fitMode.value !== 'manual') applyFitMode()
  void nextTick(async () => {
    await renderVisiblePages()
    restoreZoomViewportSnapshot(snapshot)
    emitZoomState()
  })
}

function zoomIn() {
  const snapshot = getZoomViewportSnapshot(currentPage.value)
  manualZoomAlignment.value =
    effectivePagedFitMode.value === 'manual' ? 'width' : effectivePagedFitMode.value
  fitMode.value = 'manual'
  scale.value = Math.min(MAX_SCALE, Number((scale.value + SCALE_STEP).toFixed(2)))
  void nextTick(async () => {
    await renderVisiblePages()
    restoreZoomViewportSnapshot(snapshot)
    emitZoomState()
  })
}

function zoomOut() {
  const snapshot = getZoomViewportSnapshot(currentPage.value)
  manualZoomAlignment.value =
    effectivePagedFitMode.value === 'manual' ? 'width' : effectivePagedFitMode.value
  fitMode.value = 'manual'
  scale.value = Math.max(MIN_SCALE, Number((scale.value - SCALE_STEP).toFixed(2)))
  void nextTick(async () => {
    await renderVisiblePages()
    restoreZoomViewportSnapshot(snapshot)
    emitZoomState()
  })
}

function rotateCurrentPage() {
  if (!props.rotateEnabled || !currentPage.value) return

  const snapshot = getZoomViewportSnapshot(currentPage.value)
  pageRotations.value = {
    ...pageRotations.value,
    [currentPage.value]: (normalizedRotation(currentPage.value) + 90) % 360,
  }

  if (fitMode.value !== 'manual') applyFitMode()

  void nextTick(async () => {
    await renderVisiblePages()
    restoreZoomViewportSnapshot(snapshot)
  })
}

async function printDocument() {
  if (!props.printEnabled || printing.value) return

  printing.value = true
  let blobUrl = ''
  let iframe: HTMLIFrameElement | null = null

  try {
    let blob: Blob
    if (props.pdfData) {
      const sourceData =
        props.pdfData instanceof Uint8Array ? props.pdfData : new Uint8Array(props.pdfData)
      const pdfBytes = new Uint8Array(sourceData.byteLength)
      pdfBytes.set(sourceData)
      blob = new Blob([pdfBytes], { type: 'application/pdf' })
    } else if (props.pdfUrl) {
      const response = await fetch(props.pdfUrl, { credentials: 'include' })
      if (!response.ok) throw new Error(`Failed to print PDF (${response.status})`)
      blob = await response.blob()
    } else {
      throw new Error('No PDF source available for printing')
    }

    blobUrl = URL.createObjectURL(blob)
    iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = blobUrl
    document.body.appendChild(iframe)

    await new Promise<void>((resolve, reject) => {
      iframe!.onload = () => resolve()
      iframe!.onerror = () => reject(new Error('Failed to load PDF for printing'))
    })

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    logViewerActivity('viewer-document-print')
  } catch (error) {
    console.warn(error)
  } finally {
    window.setTimeout(() => {
      if (iframe?.parentNode) iframe.parentNode.removeChild(iframe)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }, 1000)
    printing.value = false
  }
}

function scrollPageIntoView(pageNumber: number, behavior: ScrollBehavior = 'smooth') {
  const stage = stageRef.value
  const pageElement = getPageElement(pageNumber)
  if (!stage || !pageElement) return

  if (scrollMode.value === 'continuous') {
    pageElement.scrollIntoView({ block: 'center', inline: 'center', behavior })
    return
  }

  if (shouldCenterPagedFitPage.value) {
    stage.scrollTop = Math.max(0, (pageElement.offsetHeight - stage.clientHeight) / 2)
    stage.scrollLeft = Math.max(0, (pageElement.offsetWidth - stage.clientWidth) / 2)
    return
  }

  if (shouldCenterPagedFitWidth.value) {
    stage.scrollTop = 0
    stage.scrollLeft = Math.max(0, (pageElement.offsetWidth - stage.clientWidth) / 2)
    return
  }

  stage.scrollTop = 0
  stage.scrollLeft = 0
}

async function renderPage(pageNumber: number) {
  const requestId = (renderRequestIds.get(pageNumber) ?? 0) + 1
  renderRequestIds.set(pageNumber, requestId)
  const generation = renderGeneration.value
  const previous = renderQueues.get(pageNumber) ?? Promise.resolve()

  const nextRender = previous
    .catch(() => {
      // Ignore previous render failures; latest request should still run.
    })
    .then(async () => {
      if (renderRequestIds.get(pageNumber) !== requestId) return
      if (generation !== renderGeneration.value) return

      const pdf = pdfDocument.value
      const canvas = pageCanvases.get(pageNumber)
      const pageInfo = pages.value.find(page => page.pageNumber === pageNumber)
      const textLayerContainer = textLayerContainers.get(pageNumber)
      if (!pdf || !canvas || !pageInfo) return

      try {
        const page = await pdf.getPage(pageNumber)
        if (renderRequestIds.get(pageNumber) !== requestId) return
        if (generation !== renderGeneration.value) return

        const viewport = page.getViewport({
          scale: scale.value,
          rotation: normalizedRotation(pageNumber),
        })
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const renderTask = page.render({ canvasContext: context, viewport })
        renderTasks.set(pageNumber, renderTask)
        await renderTask.promise

        if (
          interactionMode.value === 'text' &&
          textLayerContainer &&
          renderRequestIds.get(pageNumber) === requestId &&
          generation === renderGeneration.value
        ) {
          clearTextLayer(pageNumber)
          textLayerContainer.replaceChildren()

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent({
              includeMarkedContent: true,
              disableNormalization: true,
            }),
            container: textLayerContainer,
            viewport,
          })

          textLayers.set(pageNumber, textLayer)
          await textLayer.render()

          if (
            renderRequestIds.get(pageNumber) !== requestId ||
            generation !== renderGeneration.value
          ) {
            clearTextLayer(pageNumber)
            return
          }

          const endOfContent = document.createElement('div')
          endOfContent.className = 'endOfContent'
          textLayerContainer.append(endOfContent)
        } else {
          clearTextLayer(pageNumber)
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
          error.value = props.failedRenderLabel
          errorDescription.value = extractPdfErrorReasons(err).join(' | ')
        }
      } finally {
        if (renderTasks.get(pageNumber)) {
          renderTasks.delete(pageNumber)
        }
      }
    })

  renderQueues.set(pageNumber, nextRender)
  await nextRender
}

async function renderVisiblePages() {
  if (!pdfDocument.value) return
  const pageNumbers =
    scrollMode.value === 'continuous'
      ? pages.value.map(page => page.pageNumber)
      : visiblePageNumbers.value
  await Promise.all(pageNumbers.map(pageNumber => renderPage(pageNumber)))
  if (interactionMode.value === 'text') {
    await Promise.all(pageNumbers.map(pageNumber => ensurePageSearchData(pageNumber)))
  }
}

async function findMatches(query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    searchMatches.value = []
    activeSearchIndex.value = -1
    suppressViewerEvent('search', { query: '', matches: 0 })
    return
  }

  await Promise.all(pages.value.map(page => ensurePageSearchData(page.pageNumber)))

  const matches: SearchMatch[] = []

  for (const page of pages.value) {
    const haystack = page.text.toLowerCase()
    let cursor = 0
    let localIndex = 0

    while (cursor >= 0 && cursor < haystack.length) {
      const start = haystack.indexOf(normalizedQuery, cursor)
      if (start < 0) break

      const end = start + normalizedQuery.length
      const itemIndexes = page.textItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.start < end && item.end > start)
        .map(({ index }) => index)

      if (itemIndexes.length > 0) {
        matches.push({
          id: `${page.pageNumber}-${localIndex}`,
          pageNumber: page.pageNumber,
          itemIndexes,
          start,
          end,
        })
        localIndex += 1
      }

      cursor = end
    }
  }

  searchMatches.value = matches
  activeSearchIndex.value = matches.length > 0 ? 0 : -1
  suppressViewerEvent('search', { query: normalizedQuery, matches: matches.length })
  logViewerActivity('viewer-text-search', {
    searchedText: normalizedQuery,
    matches: matches.length,
  })

  if (matches.length > 0) {
    focusSearchMatch(0)
  }
}

function focusSearchMatch(index: number) {
  if (searchMatches.value.length === 0) return
  const normalizedIndex =
    ((index % searchMatches.value.length) + searchMatches.value.length) % searchMatches.value.length
  activeSearchIndex.value = normalizedIndex
  const match = searchMatches.value[normalizedIndex]
  updateCurrentPage(match.pageNumber)
  void nextTick(() => {
    const activeResult = searchResultsRef.value?.querySelector<HTMLElement>(
      `[data-search-index="${normalizedIndex}"]`,
    )
    activeResult?.scrollIntoView({ block: 'nearest' })
    updateSearchResultsScrollState()
  })
}

function focusNextSearchMatch() {
  if (searchMatches.value.length === 0) return
  focusSearchMatch(activeSearchIndex.value + 1)
}

function focusPreviousSearchMatch() {
  if (searchMatches.value.length === 0) return
  focusSearchMatch(activeSearchIndex.value - 1)
}

function handleStageScroll() {
  hideSelectionMenu()
  if (scrollMode.value !== 'continuous') return
  if (scrollFrame.value != null) window.cancelAnimationFrame(scrollFrame.value)

  scrollFrame.value = window.requestAnimationFrame(() => {
    scrollFrame.value = null
    const stage = stageRef.value
    if (!stage) return

    const stageRect = stage.getBoundingClientRect()
    let closestPage: { pageNumber: number; distance: number } | null = null

    for (const [pageNumber, element] of pageElements.entries()) {
      const rect = element.getBoundingClientRect()
      const distance = Math.abs(rect.top - stageRect.top - stage.clientHeight / 3)
      if (!closestPage || distance < closestPage.distance) {
        closestPage = { pageNumber, distance }
      }
    }

    if (closestPage) updateCurrentPage(closestPage.pageNumber, { silentScroll: true })
  })
}

function bindResizeObserver() {
  if (!shellRef.value || resizeObserverRef.value || typeof ResizeObserver === 'undefined') return

  resizeObserverRef.value = new ResizeObserver(() => {
    if (fitMode.value !== 'manual') applyFitMode()
    void renderVisiblePages()
  })
  resizeObserverRef.value.observe(shellRef.value)
}

function unbindResizeObserver() {
  resizeObserverRef.value?.disconnect()
  resizeObserverRef.value = null
}

function beginPan(event: PointerEvent) {
  const stage = stageRef.value
  if (!stage) return

  const canPanX = stage.scrollWidth > stage.clientWidth + 1
  const canPanY = stage.scrollHeight > stage.clientHeight + 1
  if (!canPanX && !canPanY) return

  event.preventDefault()
  hideSelectionMenu({ clearSelection: true })
  panState.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: stage.scrollLeft,
    startScrollTop: stage.scrollTop,
    canPanX,
    canPanY,
  }
  isPanning.value = true
  window.addEventListener('pointermove', handlePanPointerMove)
  window.addEventListener('pointerup', finishPan)
  window.addEventListener('pointercancel', finishPan)
}

function handlePanPointerMove(event: PointerEvent) {
  const stage = stageRef.value
  const activePan = panState.value
  if (!stage || !activePan || activePan.pointerId !== event.pointerId) return

  const dx = event.clientX - activePan.startClientX
  const dy = event.clientY - activePan.startClientY
  if (activePan.canPanX) stage.scrollLeft = activePan.startScrollLeft - dx
  if (activePan.canPanY) stage.scrollTop = activePan.startScrollTop - dy
}

function finishPan(event?: PointerEvent) {
  if (event && panState.value && panState.value.pointerId !== event.pointerId) return

  panState.value = null
  isPanning.value = false
  window.removeEventListener('pointermove', handlePanPointerMove)
  window.removeEventListener('pointerup', finishPan)
  window.removeEventListener('pointercancel', finishPan)
}

function handlePagePointerDown(event: PointerEvent, pageNumber: number) {
  if (interactionMode.value === 'hand') {
    beginPan(event)
    return
  }

  const element = getPageElement(pageNumber)
  if (!element) return
  suppressViewerEvent('page-pointerdown', { event, pageNumber, element })
}

function handleThumbnailClick(pageNumber: number) {
  updateCurrentPage(pageNumber)
  showPagesMenu.value = false
}

async function handleSearchSubmit() {
  await findMatches(searchQuery.value)
}

function clearScheduledSearch() {
  if (searchFrame.value != null) {
    window.clearTimeout(searchFrame.value)
    searchFrame.value = null
  }
}

function scheduleSearch(query: string) {
  clearScheduledSearch()

  if (!query.trim()) {
    void findMatches('')
    return
  }

  searchFrame.value = window.setTimeout(() => {
    searchFrame.value = null
    void findMatches(query)
  }, SEARCH_DEBOUNCE_MS)
}

function clearSearch() {
  clearScheduledSearch()
  searchQuery.value = ''
}

function setInteractionMode(nextMode: InteractionMode) {
  interactionMode.value = nextMode
  showInteractionMenu.value = false
  hideSelectionMenu({ clearSelection: true })
  finishPan()
  if (nextMode !== 'text') {
    clearAllTextLayers()
  }
  suppressViewerEvent('interaction-mode-change', nextMode)
  if (nextMode === 'text') {
    void nextTick(async () => {
      await renderVisiblePages()
    })
  }
}

function handleTextLayerMouseUp() {
  window.setTimeout(() => {
    const selection = selectionTextWithinViewer()
    if (!selection) {
      hideSelectionMenu()
      return
    }

    selectionMenu.value = {
      text: selection.text,
      x: selection.rect.left + selection.rect.width / 2,
      y: selection.rect.bottom + 8,
      page: selection.page,
      rects: selection.rects,
    }
  }, 0)
}

function handleSelectionChange() {
  const selection = selectionTextWithinViewer()
  if (!selection) {
    hideSelectionMenu()
  }
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.ci-pdf-viewer__selection-menu')) return
  if (target?.closest('.ci-pdf-viewer__text-layer')) return
  hideSelectionMenu()
}

function handleCopySelectedText() {
  if (!selectionMenu.value?.text) return
  copyToClipboard(selectionMenu.value.text)
  logViewerActivity('viewer-text-copy', { copiedText: selectionMenu.value.text })
  suppressViewerEvent('text-selection-action', { action: 'copy', text: selectionMenu.value.text })
  hideSelectionMenu({ clearSelection: true })
}

async function handleSearchSelectedText() {
  if (!selectionMenu.value?.text) return
  const selectedText = selectionMenu.value.text
  suppressViewerEvent('text-selection-action', { action: 'search', text: selectedText })
  showSearchMenu.value = true
  searchQuery.value = selectedText
  clearScheduledSearch()
  await findMatches(selectedText)
  hideSelectionMenu({ clearSelection: true })
}

function handleAskPageQuestion() {
  suppressViewerEvent('ask-page-question', { page: currentPage.value })
}

function handleAskSelectionQuestion() {
  if (!selectionMenu.value?.text) return
  suppressViewerEvent('ask-selection-question', {
    page: selectionMenu.value.page,
    text: selectionMenu.value.text,
    rects: selectionMenu.value.rects,
  })
  hideSelectionMenu({ clearSelection: true })
}

function handleSearchInputEnter(event: KeyboardEvent) {
  event.preventDefault()
  if (searchMatches.value.length === 0) {
    void handleSearchSubmit()
    return
  }

  if (event.shiftKey) focusPreviousSearchMatch()
  else focusNextSearchMatch()
}

function focusSearchInput() {
  showSearchMenu.value = true
  void nextTick(() => {
    const input = searchInputRef.value?.querySelector('input') as HTMLInputElement | null
    input?.focus()
    input?.select()
  })
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable="true"], .ProseMirror, [role="textbox"]',
    ),
  )
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    focusSearchInput()
    return
  }

  if (event.key === '/') {
    event.preventDefault()
    focusSearchInput()
    return
  }

  if (event.key === 'PageDown') {
    event.preventDefault()
    goToNextPage()
    return
  }

  if (event.key === 'PageUp') {
    event.preventDefault()
    goToPreviousPage()
    return
  }

  if (event.key === '=' || event.key === '+') {
    event.preventDefault()
    zoomIn()
    return
  }

  if (event.key === '-') {
    event.preventDefault()
    zoomOut()
    return
  }

  if (!showSearchMenu.value || !searchQuery.value.trim()) return

  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) focusPreviousSearchMatch()
    else focusNextSearchMatch()
  }
}

async function warmVisibleThumbnails() {
  await Promise.all(pages.value.map(page => ensureThumbnail(page.pageNumber)))
}

watch([() => props.pdfUrl, () => props.pdfData], async () => {
  await loadPdf()
})

watch(
  () => props.initialPage,
  pageNumber => {
    if (!pageNumber || loading.value || pages.value.length === 0) return
    updateCurrentPage(pageNumber, { scrollBehavior: 'auto' })
  },
)

watch([currentPage, visiblePages, scale, viewMode, scrollMode], async () => {
  await nextTick()
  await renderVisiblePages()
})

watch(showPagesMenu, open => {
  if (!open) return
  void warmVisibleThumbnails()
})

watch(showSearchMenu, open => {
  if (!open) return
  focusSearchInput()
  void nextTick(() => updateSearchResultsScrollState())
})

watch(searchQuery, query => {
  scheduleSearch(query)
})

watch(searchResultEntries, async () => {
  await nextTick()
  updateSearchResultsScrollState()
})

onMounted(async () => {
  await loadPdf()
  await nextTick()
  bindResizeObserver()
  window.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('selectionchange', handleSelectionChange)
  window.addEventListener('pointerdown', handleGlobalPointerDown)
})

onUnmounted(() => {
  if (scrollFrame.value != null) window.cancelAnimationFrame(scrollFrame.value)
  clearScheduledSearch()
  recentActivityLogTimes.clear()
  finishPan()
  hideSelectionMenu({ clearSelection: true })
  window.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('selectionchange', handleSelectionChange)
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
  unbindResizeObserver()
  clearAllTextLayers()
  cancelAllRenderTasks()
  void cancelActiveDocumentLoading()
})

defineExpose({
  goToPage: (pageNumber: number) => updateCurrentPage(pageNumber),
  getPageElement,
  searchDocument: (query: string) => findMatches(query),
  focusNextSearchMatch,
  focusPreviousSearchMatch,
  setFitMode,
  setViewMode,
  setScrollMode,
})
</script>

<template>
  <div
    ref="shellRef"
    class="ci-pdf-viewer"
    :class="{
      'ci-pdf-viewer--hand-mode': interactionMode === 'hand',
      'ci-pdf-viewer--is-panning': isPanning,
      'ci-pdf-viewer--page-chrome-disabled': !props.pageChrome,
      'ci-pdf-viewer--toolbar-divider-disabled': !props.toolbarDivider,
    }"
    :style="viewerRootStyle"
  >
    <div class="ci-pdf-viewer__shell">
      <div
        ref="stageRef"
        class="ci-pdf-viewer__stage"
        tabindex="0"
        :aria-label="t('files.sharedPdfViewer.controls.documentViewport')"
        @scroll.passive="handleStageScroll"
      >
        <div v-if="loading" class="ci-pdf-viewer__state-wrap">
          <div class="ci-pdf-viewer__loading">
            <VProgressCircular indeterminate color="primary" size="28" />
            <div class="text-body-2 text-medium-emphasis">{{ props.loadingLabel }}</div>
          </div>
        </div>

        <div v-else-if="error" class="ci-pdf-viewer__state-wrap">
          <VAlert type="error" variant="tonal" class="ci-pdf-viewer__message">
            <template #title>{{ error }}</template>
            <div v-if="errorDescription">{{ errorDescription }}</div>
          </VAlert>
        </div>

        <div v-else-if="pages.length === 0" class="ci-pdf-viewer__state-wrap">
          <VAlert type="warning" variant="tonal" class="ci-pdf-viewer__message">
            {{ props.noPagesLabel }}
          </VAlert>
        </div>

        <div
          v-else
          class="ci-pdf-viewer__pages"
          :class="{
            'ci-pdf-viewer__pages--fit-page': shouldCenterPagedFitPage,
            'ci-pdf-viewer__pages--fit-width': shouldCenterPagedFitWidth,
            'ci-pdf-viewer__pages--continuous-fit': shouldCenterContinuousFit,
            'ci-pdf-viewer__pages--continuous': scrollMode === 'continuous',
            'ci-pdf-viewer__pages--spread': viewMode === 'spread',
          }"
        >
          <div
            v-for="page in visiblePages"
            :key="page.pageNumber"
            :ref="element => setPageElementRef(page.pageNumber, element)"
            class="ci-pdf-viewer__page"
            :class="props.pageClass ? props.pageClass(page.pageNumber) : null"
            :style="pageStyle(page)"
            @pointerdown="handlePagePointerDown($event, page.pageNumber)"
          >
            <canvas
              :ref="element => setCanvasRef(page.pageNumber, element)"
              class="ci-pdf-viewer__canvas"
            />

            <div
              v-if="renderedSearchMatches.get(page.pageNumber)?.length"
              class="ci-pdf-viewer__search-layer"
            >
              <div
                v-for="match in renderedSearchMatches.get(page.pageNumber)"
                :key="match.id"
                class="ci-pdf-viewer__search-highlight"
                :class="{ active: match.active }"
                :style="searchHighlightStyle(page, match) || undefined"
              />
            </div>

            <div
              v-if="interactionMode === 'text'"
              :ref="element => setTextLayerRef(page.pageNumber, element)"
              class="ci-pdf-viewer__text-layer"
              @mouseup="handleTextLayerMouseUp"
            />

            <slot name="page-overlay" :page="page" />
          </div>
        </div>
      </div>

      <div class="ci-pdf-viewer__toolbar" :style="toolbarStyle">
        <div class="ci-pdf-viewer__toolbar-group ci-pdf-viewer__toolbar-group--top">
          <VMenu v-model="showPagesMenu">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.pages'))"
                icon="fasl fa-book-open"
                variant="text"
                density="comfortable"
                size="small"
                :aria-label="t('files.sharedPdfViewer.controls.pages')"
                :disabled="pages.length === 0"
              />
            </template>

            <div
              class="ci-pdf-viewer__menu-panel ci-pdf-viewer__menu-panel--pages"
              role="dialog"
              :aria-label="t('files.sharedPdfViewer.navigator.title')"
            >
              <div class="ci-pdf-viewer__menu-title">
                {{ t('files.sharedPdfViewer.navigator.title') }}
              </div>
              <button
                v-for="page in pages"
                :key="`thumb-${page.pageNumber}`"
                type="button"
                class="ci-pdf-viewer__thumbnail"
                :class="{ active: page.pageNumber === currentPage }"
                @click="handleThumbnailClick(page.pageNumber)"
              >
                <div class="ci-pdf-viewer__thumbnail-image">
                  <img v-if="page.thumbnailUrl" :src="page.thumbnailUrl" alt="" />
                  <div v-else class="ci-pdf-viewer__thumbnail-fallback">{{ page.pageNumber }}</div>
                </div>
                <span class="ci-pdf-viewer__thumbnail-label">{{ page.pageNumber }}</span>
              </button>
            </div>
          </VMenu>

          <VMenu
            v-if="props.searchEnabled"
            v-model="showSearchMenu"
            :close-on-content-click="false"
          >
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                v-tippy="toolbarTippy(t('files.sharedPdfViewer.search.search'))"
                icon="fasl fa-search"
                variant="text"
                density="comfortable"
                size="small"
                :aria-label="t('files.sharedPdfViewer.search.search')"
              />
            </template>

            <div
              class="ci-pdf-viewer__menu-panel ci-pdf-viewer__menu-panel--search"
              role="dialog"
              :aria-label="t('files.sharedPdfViewer.search.search')"
            >
              <div class="ci-pdf-viewer__search-top">
                <div class="ci-pdf-viewer__menu-title">
                  {{ t('files.sharedPdfViewer.search.search') }}
                </div>
                <VTextField
                  :ref="setSearchInputRef"
                  v-model="searchQuery"
                  clearable
                  hide-details
                  variant="outlined"
                  density="compact"
                  class="ci-pdf-viewer__search-input"
                  :aria-label="t('files.sharedPdfViewer.search.placeholder')"
                  :placeholder="t('files.sharedPdfViewer.search.placeholder')"
                  @click:clear="clearSearch"
                  @keydown.enter="handleSearchInputEnter"
                />
                <div class="ci-pdf-viewer__search-actions">
                  <VBtn
                    v-tippy="toolbarTippy(t('files.sharedPdfViewer.search.previousMatch'))"
                    icon="fasl fa-angle-up"
                    variant="text"
                    density="comfortable"
                    size="small"
                    :aria-label="t('files.sharedPdfViewer.search.previousMatch')"
                    :disabled="searchMatches.length === 0"
                    @click="focusPreviousSearchMatch"
                  />
                  <VBtn
                    v-tippy="toolbarTippy(t('files.sharedPdfViewer.search.nextMatch'))"
                    icon="fasl fa-angle-down"
                    variant="text"
                    density="comfortable"
                    size="small"
                    :aria-label="t('files.sharedPdfViewer.search.nextMatch')"
                    :disabled="searchMatches.length === 0"
                    @click="focusNextSearchMatch"
                  />
                  <div class="ci-pdf-viewer__search-count">
                    <template v-if="searchQuery.trim()">
                      {{
                        searchMatches.length > 0 && activeSearchIndex >= 0
                          ? t('files.sharedPdfViewer.search.matchCount', {
                              current: activeSearchIndex + 1,
                              total: searchMatches.length,
                            })
                          : t('files.sharedPdfViewer.search.noMatches')
                      }}
                    </template>
                  </div>
                </div>
              </div>
              <template v-if="searchQuery.trim()">
                <div class="ci-pdf-viewer__search-body">
                  <div class="ci-pdf-viewer__search-results-shell">
                    <div
                      :ref="setSearchResultsRef"
                      class="ci-pdf-viewer__search-results"
                      @scroll="updateSearchResultsScrollState"
                    >
                      <button
                        v-for="result in searchResultEntries"
                        :key="result.id"
                        type="button"
                        class="ci-pdf-viewer__search-result"
                        :class="{ active: activeSearchIndex === result.index }"
                        :data-search-index="result.index"
                        @click="focusSearchMatch(result.index)"
                      >
                        <div class="ci-pdf-viewer__search-result-page">
                          {{
                            t('files.sharedPdfViewer.search.pageLabel', {
                              page: result.pageNumber,
                            })
                          }}
                        </div>
                        <div
                          v-if="result.contextParts.match"
                          class="ci-pdf-viewer__search-result-context"
                        >
                          <span>{{ result.contextParts.before }}</span>
                          <strong class="ci-pdf-viewer__search-result-match">
                            {{ result.contextParts.match }}
                          </strong>
                          <span>{{ result.contextParts.after }}</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div class="ci-pdf-viewer__search-cue">
                    <ScrollCue
                      :up="searchResultsScrollState.up"
                      :down="searchResultsScrollState.down"
                    />
                  </div>
                </div>
              </template>
            </div>
          </VMenu>

          <VMenu v-model="showInteractionMenu" :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                v-tippy="
                  toolbarTippy(
                    interactionMode === 'hand'
                      ? t('files.sharedPdfViewer.interaction.panMode')
                      : t('files.sharedPdfViewer.interaction.selectTextMode'),
                  )
                "
                :icon="interactionMode === 'hand' ? 'fasl fa-hand' : 'fasl fa-arrow-pointer'"
                variant="text"
                density="comfortable"
                size="small"
                :active="showInteractionMenu"
                :aria-label="t('files.sharedPdfViewer.interaction.title')"
              />
            </template>

            <VList density="comfortable" min-width="220">
              <VListItem
                :title="t('files.sharedPdfViewer.interaction.selectTextMode')"
                :active="interactionMode === 'text'"
                prepend-icon="fasl fa-arrow-pointer"
                @click="setInteractionMode('text')"
              >
                <template #append>
                  <VIcon v-if="interactionMode === 'text'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VListItem
                :title="t('files.sharedPdfViewer.interaction.panMode')"
                :active="interactionMode === 'hand'"
                prepend-icon="fasl fa-hand"
                @click="setInteractionMode('hand')"
              >
                <template #append>
                  <VIcon v-if="interactionMode === 'hand'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
            </VList>
          </VMenu>

          <VBtn
            v-if="props.rotateEnabled"
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.rotatePage'))"
            icon="fasl fa-rotate-right"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.rotatePage')"
            :disabled="pages.length === 0"
            @click="rotateCurrentPage"
          />
          <VBtn
            v-if="props.printEnabled"
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.print'))"
            icon="fasl fa-print"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.print')"
            :disabled="pages.length === 0 || printing"
            @click="printDocument"
          />
          <VBtn
            v-if="props.qaAnchorsEnabled"
            v-tippy="toolbarTippy('Ask about this page')"
            icon="fasl fa-circle-question"
            variant="text"
            density="comfortable"
            size="small"
            aria-label="Ask about this page"
            :disabled="pages.length === 0"
            @click="handleAskPageQuestion"
          />

          <div v-if="hasToolbarTopSlot" class="ci-pdf-viewer__toolbar-divider" />
          <slot name="toolbar-top" />
        </div>

        <div class="ci-pdf-viewer__toolbar-spacer" />

        <div class="ci-pdf-viewer__toolbar-group ci-pdf-viewer__toolbar-group--bottom">
          <input
            v-model="pageInput"
            type="text"
            inputmode="numeric"
            class="ci-pdf-viewer__page-input"
            :aria-label="t('files.sharedPdfViewer.controls.pageNumber')"
            @blur="handlePageInputCommit"
            @keydown.enter.prevent="handlePageInputCommit"
          />
          <div class="ci-pdf-viewer__page-count text-medium-emphasis">
            {{ pages.length }}
          </div>
          <VBtn
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.previousPage'))"
            icon="fasl fa-angle-up"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.previousPage')"
            :disabled="currentPage <= 1"
            @click="goToPreviousPage"
          />
          <VBtn
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.nextPage'))"
            icon="fasl fa-angle-down"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.nextPage')"
            :disabled="currentPage >= pages.length"
            @click="goToNextPage"
          />
          <div class="ci-pdf-viewer__toolbar-divider" />
          <VMenu v-model="showViewMenu">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.viewOptions'))"
                icon="fasl fa-table-columns"
                variant="text"
                density="comfortable"
                size="small"
                :aria-label="t('files.sharedPdfViewer.controls.viewOptions')"
              />
            </template>

            <VList density="comfortable" min-width="240">
              <VListItem
                :title="t('files.sharedPdfViewer.view.singlePage')"
                :active="viewMode === 'single'"
                @click="setViewMode('single')"
              >
                <template #append>
                  <VIcon v-if="viewMode === 'single'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VListItem
                :title="t('files.sharedPdfViewer.view.twoPage')"
                :active="viewMode === 'spread'"
                @click="setViewMode('spread')"
              >
                <template #append>
                  <VIcon v-if="viewMode === 'spread'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VDivider class="my-1" />
              <VListItem
                :title="t('files.sharedPdfViewer.view.paged')"
                :active="scrollMode === 'paged'"
                @click="setScrollMode('paged')"
              >
                <template #append>
                  <VIcon v-if="scrollMode === 'paged'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VListItem
                :title="t('files.sharedPdfViewer.view.scrolling')"
                :active="scrollMode === 'continuous'"
                @click="setScrollMode('continuous')"
              >
                <template #append>
                  <VIcon v-if="scrollMode === 'continuous'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VDivider class="my-1" />
              <VListItem
                :title="t('files.sharedPdfViewer.view.fitPage')"
                :active="fitMode === 'page'"
                @click="setFitMode('page')"
              >
                <template #append>
                  <VIcon v-if="fitMode === 'page'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
              <VListItem
                :title="t('files.sharedPdfViewer.view.fitWidth')"
                :active="fitMode === 'width'"
                @click="setFitMode('width')"
              >
                <template #append>
                  <VIcon v-if="fitMode === 'width'" icon="fasl fa-check" size="14" />
                </template>
              </VListItem>
            </VList>
          </VMenu>

          <VBtn
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.zoomOut'))"
            icon="fasl fa-magnifying-glass-minus"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.zoomOut')"
            :disabled="scale <= MIN_SCALE"
            @click="zoomOut"
          />
          <div class="ci-pdf-viewer__zoom-label text-medium-emphasis">
            {{ Math.round(scale * 100) }}%
          </div>
          <VBtn
            v-tippy="toolbarTippy(t('files.sharedPdfViewer.controls.zoomIn'))"
            icon="fasl fa-magnifying-glass-plus"
            variant="text"
            density="comfortable"
            size="small"
            :aria-label="t('files.sharedPdfViewer.controls.zoomIn')"
            :disabled="scale >= MAX_SCALE"
            @click="zoomIn"
          />
        </div>
      </div>
    </div>

    <div v-if="selectionMenu" class="ci-pdf-viewer__selection-menu" :style="selectionMenuStyle()">
      <VBtn
        v-tippy="toolbarTippy(t('files.sharedPdfViewer.interaction.copySelection'))"
        icon="fasl fa-copy"
        variant="text"
        density="comfortable"
        size="small"
        :aria-label="t('files.sharedPdfViewer.interaction.copySelection')"
        @click="handleCopySelectedText"
      />
      <VBtn
        v-tippy="toolbarTippy(t('files.sharedPdfViewer.interaction.searchSelection'))"
        icon="fasl fa-search"
        variant="text"
        density="comfortable"
        size="small"
        :aria-label="t('files.sharedPdfViewer.interaction.searchSelection')"
        @click="handleSearchSelectedText"
      />
      <VBtn
        v-if="props.qaAnchorsEnabled"
        v-tippy="toolbarTippy('Ask about selection')"
        prepend-icon="fasl fa-circle-question"
        variant="text"
        density="comfortable"
        size="small"
        aria-label="Ask about selection"
        @click="handleAskSelectionQuestion"
      >
        Ask
      </VBtn>
    </div>
  </div>
</template>

<style scoped>
.ci-pdf-viewer {
  min-height: 320px;
  height: 100%;
  overflow: hidden;
  border: var(--ci-pdf-viewer-border-width) solid
    rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-pdf-viewer-border-radius);
  clip-path: inset(0 round var(--ci-pdf-viewer-border-radius));
  background: rgb(var(--v-theme-background));
  display: flex;
  flex-direction: column;
}

.ci-pdf-viewer__page-input {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  line-height: 1;
  text-align: center;
  outline: none;
}

.ci-pdf-viewer__page-count {
  font-size: 14px;
  line-height: 1;
  margin-top: 2px;
  margin-bottom: 2px;
}

.ci-pdf-viewer__zoom-label {
  font-size: 12px;
  line-height: 1;
  margin: 2px 0 4px;
}

.ci-pdf-viewer__shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
  clip-path: inset(0 round var(--ci-pdf-viewer-border-radius));
  background: rgb(var(--v-theme-surface));
}

.ci-pdf-viewer__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ci-pdf-viewer__stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  border-top-left-radius: inherit;
  border-bottom-left-radius: inherit;
  background: rgb(var(--v-theme-surface));
}

.ci-pdf-viewer__state-wrap {
  width: 100%;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ci-pdf-viewer__message {
  flex: 0 1 620px;
  width: 100%;
  max-width: 620px;
  white-space: pre-wrap;
}

.ci-pdf-viewer__toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 1px;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  justify-content: flex-start;
  background: rgb(var(--v-theme-surface));
  border-top-right-radius: inherit;
  border-bottom-right-radius: inherit;
  overflow: hidden;
}

.ci-pdf-viewer--toolbar-divider-disabled .ci-pdf-viewer__toolbar {
  border-left: 0;
}

.ci-pdf-viewer__toolbar-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ci-pdf-viewer__toolbar-group--top {
  align-self: stretch;
}

.ci-pdf-viewer__toolbar-group--bottom {
  align-self: stretch;
}

.ci-pdf-viewer__toolbar-spacer {
  flex: 1 1 auto;
  min-height: 32px;
}

.ci-pdf-viewer__toolbar-divider {
  width: 16px;
  height: 1px;
  margin: 6px 0;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
}

.ci-pdf-viewer__menu-panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
}

.ci-pdf-viewer__menu-panel--pages {
  width: 180px;
  max-height: 70vh;
  overflow: auto;
  padding: 12px;
}

.ci-pdf-viewer__menu-panel--search {
  width: 240px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.ci-pdf-viewer__search-top {
  flex: 0 0 auto;
  padding: 12px 12px 8px;
}

.ci-pdf-viewer__search-body {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
  gap: 4px;
  overflow: hidden;
}

.ci-pdf-viewer__menu-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.ci-pdf-viewer__thumbnail {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: calc(var(--ci-border-radius) + 4px);
  background: rgba(var(--v-theme-surface), 0.92);
  cursor: pointer;
}

.ci-pdf-viewer__thumbnail.active {
  border-color: rgba(var(--v-theme-primary), 0.85);
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.15);
}

.ci-pdf-viewer__thumbnail-image {
  width: 116px;
  min-height: 152px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: white;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
}

.ci-pdf-viewer__thumbnail-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ci-pdf-viewer__thumbnail-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 152px;
  color: rgba(var(--v-theme-on-surface), 0.46);
  font-size: 24px;
  font-weight: 600;
}

.ci-pdf-viewer__thumbnail-label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.ci-pdf-viewer__pages {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 20px;
  min-width: min-content;
}

.ci-pdf-viewer__pages--fit-page {
  width: 100%;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  padding: 11px;
  box-sizing: border-box;
}

.ci-pdf-viewer__pages--fit-width {
  width: 100%;
  min-height: 100%;
  align-items: flex-start;
  justify-content: center;
  padding: 11px;
  box-sizing: border-box;
}

.ci-pdf-viewer__pages--continuous {
  flex-wrap: wrap;
  align-content: flex-start;
}

.ci-pdf-viewer__pages--continuous-fit {
  width: 100%;
  min-height: 100%;
  padding: 11px;
  box-sizing: border-box;
}

.ci-pdf-viewer__pages--continuous:not(.ci-pdf-viewer__pages--spread) {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: start;
}

.ci-pdf-viewer__pages--continuous-fit:not(.ci-pdf-viewer__pages--spread) {
  justify-items: center;
}

.ci-pdf-viewer__pages--continuous.ci-pdf-viewer__pages--spread {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  column-gap: 20px;
  row-gap: 20px;
  justify-items: center;
  justify-content: flex-start;
}

.ci-pdf-viewer__pages--continuous-fit.ci-pdf-viewer__pages--spread {
  justify-content: center;
}

.ci-pdf-viewer__page {
  position: relative;
  flex-shrink: 0;
  background: white;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.ci-pdf-viewer--page-chrome-disabled .ci-pdf-viewer__page {
  border: 0;
  box-shadow: none;
}

.ci-pdf-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.ci-pdf-viewer__search-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ci-pdf-viewer__text-layer {
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 1;
  user-select: text;
  cursor: text;
}

.ci-pdf-viewer__text-layer::selection,
.ci-pdf-viewer__text-layer *::selection {
  background: rgba(var(--v-theme-primary), 0.28);
}

.ci-pdf-viewer__text-layer :deep(span),
.ci-pdf-viewer__text-layer :deep(br) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
}

.ci-pdf-viewer__text-layer :deep(> :not(.markedContent)),
.ci-pdf-viewer__text-layer :deep(.markedContent span:not(.markedContent)) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}

.ci-pdf-viewer__text-layer :deep(.markedContent) {
  display: contents;
}

.ci-pdf-viewer__text-layer :deep(span[role='img']) {
  user-select: none;
  cursor: default;
}

.ci-pdf-viewer__text-layer :deep(.endOfContent) {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  user-select: none;
}

.ci-pdf-viewer--hand-mode .ci-pdf-viewer__stage,
.ci-pdf-viewer--hand-mode .ci-pdf-viewer__page {
  cursor: grab;
}

.ci-pdf-viewer--hand-mode.ci-pdf-viewer--is-panning .ci-pdf-viewer__stage,
.ci-pdf-viewer--hand-mode.ci-pdf-viewer--is-panning .ci-pdf-viewer__page {
  cursor: grabbing;
}

.ci-pdf-viewer__search-input {
  margin-bottom: 10px;
}

.ci-pdf-viewer__search-count {
  font-size: 12px;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin: 0;
}

.ci-pdf-viewer__search-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 0;
}

.ci-pdf-viewer__search-results-shell {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  max-height: 220px;
  overflow: hidden;
}

.ci-pdf-viewer__search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
  padding: 0 12px 8px;
}

.ci-pdf-viewer__search-cue {
  padding: 2px 0 6px;
}

.ci-pdf-viewer__selection-menu {
  position: fixed;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: calc(var(--ci-border-radius) + 2px);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.18);
  transform: translateX(-50%);
}

.ci-pdf-viewer__search-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: auto;
  align-self: stretch;
  gap: 4px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
  background: rgba(var(--v-theme-surface), 0.96);
  text-align: left;
  cursor: pointer;
}

.ci-pdf-viewer__search-result.active {
  border-color: rgba(var(--v-theme-primary), 0.85);
  background: rgba(var(--v-theme-primary), 0.08);
}

.ci-pdf-viewer__search-result:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.64);
  outline-offset: 2px;
}

.ci-pdf-viewer__search-result-page {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.ci-pdf-viewer__search-result-context {
  font-size: 12px;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.ci-pdf-viewer__search-result-match {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.ci-pdf-viewer__search-highlight {
  position: absolute;
  border-radius: 3px;
  background: rgba(250, 204, 21, 0.28);
  box-shadow: inset 0 0 0 1px rgba(202, 138, 4, 0.18);
}

.ci-pdf-viewer__search-highlight.active {
  background: rgba(249, 115, 22, 0.32);
  box-shadow:
    0 0 0 1px rgba(249, 115, 22, 0.32),
    inset 0 0 0 1px rgba(194, 65, 12, 0.24);
}

@media (max-width: 960px) {
  .ci-pdf-viewer__shell {
    grid-template-columns: minmax(0, 1fr) 48px;
  }

  .ci-pdf-viewer__toolbar {
    padding: 10px 0;
  }

  .ci-pdf-viewer__stage {
    padding-right: 0;
  }
}
</style>
