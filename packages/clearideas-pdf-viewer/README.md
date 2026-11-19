# @clearideas/pdf-viewer

A self-contained PDF viewer for Vue 3 + Vuetify, built on pdf.js. It renders pages to canvas with a
selectable text layer, and provides a vertical toolbar (page navigator with thumbnails, in-document
search, select/pan interaction modes, optional rotate and print, view/scroll/fit modes, zoom).

This package is consumed **from source** by Vite (`exports` points at `src/index.ts`); there is no
build step. It is kept as a workspace package so it can be extracted to its own repository later.

## Usage

```vue
<script setup lang="ts">
import { BasePDFViewer } from '@clearideas/pdf-viewer'
</script>

<template>
  <BasePDFViewer :pdf-data="bytes" :initial-page="1" rotate-enabled :print-enabled="canPrint" @page-change="onPage" />
</template>
```

### Props (selection)

| Prop | Default | Notes |
|------|---------|-------|
| `pdfUrl` / `pdfData` | — | One of the two. `pdfData` is a `Uint8Array`/`ArrayBuffer`. |
| `initialPage` | `1` | |
| `searchEnabled` | `true` | In-document text search. |
| `rotateEnabled` / `printEnabled` | `false` | Toolbar buttons. |
| `labels` | English defaults | `Partial<PdfViewerLabels>` — every user-facing string (see `src/labels.ts`). |
| `borderWidth`, `borderRadius`, `pageChrome`, `toolbarDivider`, `toolbarBottomInset`, `pageClass` | | Presentation hooks. |
| `withCredentials` | `false` | Passed to pdf.js when loading from `pdfUrl`. |

### Events

`document-open ({ pageCount })`, `page-change (pageNumber)`, `zoom-change ({ scale, viewMode, scrollMode, fitMode })`,
`search ({ query, matches })`, `interaction-mode-change (mode)`, `text-selection-action ({ action, text })`,
`ask-page-question ({ page })`, `ask-selection-question ({ page, text, rects })`, `page-pointerdown ({ event, pageNumber, element })`,
`viewer-activity ({ action, attributes })` — the host decides what to log.

### Exposed methods

`goToPage(n)`, `getPageElement(n)`, `searchDocument(query)`, `focusNextSearchMatch()`, `focusPreviousSearchMatch()`,
`setFitMode(mode)`, `setViewMode(mode)`, `setScrollMode(mode)`.

### Slots

`page-overlay` — rendered inside every page element with `{ page }`.

## Requirements

Peer dependencies: `vue`, `vuetify` (VBtn, VMenu, VTextField, VAlert, VProgressCircular, VDivider, VIcon with an
icon set that resolves `fas fa-*` names), `vue-tippy` (the `v-tippy` directive), `pdfjs-dist`.

## Testing

`apps/clearideas-ce/test/web/pdf-viewer.test.ts` exercises the public API (props, events, exposed methods,
toolbar accessibility) with pdf.js mocked. The viewer's internals are intentionally not unit-tested here.
