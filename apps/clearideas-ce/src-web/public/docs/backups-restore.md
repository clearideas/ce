# Backups and Restore

Back up MongoDB and local file storage together. They are a pair.

## What To Back Up

- MongoDB database configured by `MONGODB_URI`
- `STORAGE_ROOT`
- `SEARCH_INDEX_ROOT`, optional because indexes can be rebuilt but useful for faster recovery
- `.env` or deployment secret values, stored securely outside the repo

## MongoDB Backup

```bash
mongodump --uri "$MONGODB_URI" --out ./backup/mongo
```

## MongoDB Restore

```bash
mongorestore --uri "$MONGODB_URI" ./backup/mongo
```

## Local Storage Backup

```bash
rsync -a apps/clearideas-ce/data/storage ./backup/storage
```

## Restore Order

1. Stop the app.
2. Restore MongoDB.
3. Restore local storage.
4. Restore search indexes or let them rebuild through normal usage.
5. Start the app and run a smoke test.
