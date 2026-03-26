# Configuration and Usage

## Essentials
- Configure provider via `EMAIL_PROVIDER` (`console` or `nodemailer`).
- Use SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`) for nodemailer transport.
- Keep default sender values in `EMAIL_FROM` and `EMAIL_FROM_NAME`.

## Usage Pattern
- Import `sendEmail` and a template from `@repo/email`.
- Pass typed template props.
- Handle `success`/`error` result explicitly.

## Local Preview
- Use existing environment-managed preview flow; avoid starting package dev servers from automated tasks.
