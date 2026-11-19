/** Every user-facing string in the viewer. Override any subset through the `labels` prop. */
export interface PdfViewerLabels {
  documentViewport: string
  pages: string
  navigatorTitle: string
  search: string
  searchPlaceholder: string
  previousMatch: string
  nextMatch: string
  noMatches: string
  /** e.g. "2 of 14" */
  matchCount: (current: number, total: number) => string
  /** e.g. "Page 3" */
  pageLabel: (page: number | string) => string
  interactionTitle: string
  selectTextMode: string
  panMode: string
  copySelection: string
  searchSelection: string
  rotatePage: string
  print: string
  pageNumber: string
  previousPage: string
  nextPage: string
  viewOptions: string
  singlePage: string
  twoPage: string
  paged: string
  scrolling: string
  fitPage: string
  fitWidth: string
  zoomOut: string
  zoomIn: string
  loading: string
  noPages: string
  failedLoad: string
  failedRender: string
}

export const DEFAULT_PDF_VIEWER_LABELS: PdfViewerLabels = {
  documentViewport: 'PDF document viewport',
  pages: 'Pages',
  navigatorTitle: 'Pages',
  search: 'Search',
  searchPlaceholder: 'Search document',
  previousMatch: 'Previous match',
  nextMatch: 'Next match',
  noMatches: 'No matches',
  matchCount: (current, total) => `${current} of ${total}`,
  pageLabel: page => `Page ${page}`,
  interactionTitle: 'Interaction mode',
  selectTextMode: 'Select text',
  panMode: 'Pan',
  copySelection: 'Copy selection',
  searchSelection: 'Search selection',
  rotatePage: 'Rotate page',
  print: 'Print',
  pageNumber: 'Page number',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  viewOptions: 'View options',
  singlePage: 'Single page',
  twoPage: 'Two page',
  paged: 'Paged',
  scrolling: 'Scrolling',
  fitPage: 'Fit page',
  fitWidth: 'Fit width',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  loading: 'Loading PDF',
  noPages: 'No renderable pages',
  failedLoad: 'Failed to load PDF',
  failedRender: 'Failed to render page',
}
