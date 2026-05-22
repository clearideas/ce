# Files and Content

Community Edition supports nested folders, file upload, file viewing, download, rename, and delete workflows.

## Folders

Folders may be nested. Folders and files are stored as content records with site and parent references, matching the same core content shape used by the API.

## Uploads

The browser asks the API for an upload target, then sends raw bytes to the returned app-signed upload URL. Upload metadata is sent before the raw upload so sensitive metadata does not need to live in query strings.

## Viewing Files

The app uses `/api/files/view/:fileId` for inline viewing and `/api/files/download/:fileId` for download. File storage keys stay internal and are carried only inside signed access tokens. The viewer supports common formats such as images, text, Markdown, JSON, media, and PDFs.

## Local Storage

The default storage provider writes file bytes to local disk. Keep the storage directory backed up with MongoDB.

## Deleting Content

Deleting a folder removes nested folders and files under that folder. The local storage provider deletes related object keys when content is removed.
