export function useContentTypes() {
  const PDFContentTypes = ['application/pdf']
  const ImageContentTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp']
  const VideoContentTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
  const AudioContentTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']
  const MarkupContentTypes = ['text/html', 'text/markdown', 'text/x-markdown', 'application/xhtml+xml']
  const CodeContentTypes = [
    'text/plain',
    'text/css',
    'text/csv',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/xml',
    'application/yaml',
    'text/yaml',
  ]
  const ViewerContentTypes = () => [
    ...PDFContentTypes,
    ...ImageContentTypes,
    ...VideoContentTypes,
    ...AudioContentTypes,
    ...MarkupContentTypes,
    ...CodeContentTypes,
  ]

  return {
    PDFContentTypes,
    ImageContentTypes,
    VideoContentTypes,
    AudioContentTypes,
    MarkupContentTypes,
    CodeContentTypes,
    ViewerContentTypes,
  }
}
