# Notifications and Email

Community Edition includes a simple email subsystem for auth codes, invites, and activity notifications.

## Providers

- `log`: writes email payloads to server output for development.
- `smtp`: sends email through a standard SMTP server.

## Templates

Templates live in the app under `templates/email` and use Handlebars. Each template may include subject, text, and HTML variants.

## Notification Worker

The notification worker polls activity records, sends matching notifications, and marks activities as processed. It is intentionally simple and in-process for Community Edition.

## Local Testing

Use Mailpit for local SMTP capture:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM="Clear Ideas <noreply@clearideas.local>"
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
```
