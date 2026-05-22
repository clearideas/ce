# Authentication

Community Edition uses passwordless email-code authentication through Better Auth.

## Sign-In Flow

1. User enters an email address.
2. The server sends a one-time code by the configured email provider.
3. User enters the code.
4. The server creates a secure session cookie.

## Invites

When a user is added to a site, the app sends an invitation code email. If the user already exists, they are added to the site with the selected role. If the user is new, the account is created when they sign in.

## Local Email

Use `EMAIL_PROVIDER=log` for development logs or SMTP with Mailpit for browser-visible emails.

## Sessions

Sessions are cookie-based and scoped to the app URL. In production, run the app behind HTTPS and set `HTTPS_REQUIRED=true`.

## Disabled Passwords

Passwords are intentionally not exposed in Community Edition. Email codes reduce password storage risk and simplify self-hosted setup.
