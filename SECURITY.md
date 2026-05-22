# Security Policy

## Supported Versions

Security updates are provided for the latest public release and the current `main` branch.

## Reporting A Vulnerability

Please report vulnerabilities privately by emailing security@clearideas.com. Include reproduction steps, affected versions, and impact where possible.

Do not open a public issue for suspected security vulnerabilities.

## Production Baseline

- Run behind HTTPS.
- Set `HTTPS_REQUIRED=true` in production.
- Use a long random `BETTER_AUTH_SECRET`.
- Use SMTP for real email delivery.
- Restrict access to MongoDB and storage volumes.
- Back up MongoDB and local storage together.
- Rotate MCP access keys if exposed.
