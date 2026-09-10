# @repo/email

Transactional email templates and sending for the API server.

## Environment variables

`EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`.

- `EMAIL_PROVIDER` is `nodemailer` or `console`; leave it unset to infer from `SMTP_HOST`.
- `SMTP_PORT` defaults to `587`; `SMTP_SECURE` selects implicit TLS (`true`) or STARTTLS (`false`).
- Invalid `SMTP_PORT` and `SMTP_SECURE` values throw instead of being ignored.

## Transport resolution

- `SMTP_HOST` plus `SMTP_USER`/`SMTP_PASS` uses Nodemailer with a TLS 1.2 minimum.
- Without SMTP config, dev and test fall back to the console transport.
- Production fails closed: a missing transport throws, and `EMAIL_PROVIDER="console"` is rejected.

## sendEmail

`sendEmail({ template, props, subject, to, options? })` renders the template and sends it. It returns `{ messageId }` and throws on configuration, render, or transport failures.

## Preview

Run `bun run dev:email` from the repo root to preview templates with React Email.
