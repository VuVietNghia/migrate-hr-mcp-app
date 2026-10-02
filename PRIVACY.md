# Privacy Notice

Last updated: 2026-09-30

PrivOS Demo MCP App is a stateless reference application operated by PrivOS AI.
It accesses workspace data only when a user invokes its tools or interface and
only through the PrivOS scopes approved during installation.

## Data handled

Depending on the requested workflow, the app can process workspace identity and
room context; candidate CVs and recruitment records; employee and payroll
records; email templates, recipient details, and message content; files; and AI
chat content. The exact requested permissions and their purposes are documented
in [SCOPES.md](SCOPES.md).

The app has no persistent volume and does not create an independent customer
database. Records, files, email history, and AI conversations remain in the
user's PrivOS workspace services, except for the email-delivery processing
described below. A local browser preference stores only the selected visual
theme. The app includes no advertising, behavioral analytics, or third-party
tracking SDK.

## External email delivery

When a user chooses to send or retry an HR email, the app uses Nango to authorize
the Room's selected Google Workspace or Microsoft 365 mailbox. Nango stores and
refreshes the provider credential. The app sends the recipient name and email
address, subject, and HTML body through Nango Proxy to the Google Gmail API or
Microsoft Graph API. App Database stores only Room-scoped connection metadata;
it never stores provider access or refresh tokens.

Nango, Google, and Microsoft process data under the connected customer account's
configuration and their applicable terms. Disconnecting a mailbox deactivates
the local Room binding and requests deletion of the Nango connection. Provider
Sent Items and provider-side audit or retention records remain governed by that
customer account.

## Retention and sharing

The app server does not retain workspace content after an individual request
beyond the active process memory needed to return the response. PrivOS platform
logs, workspace storage, backups, and account records remain governed by the
user's PrivOS agreement and workspace settings. Email data submitted for
delivery is additionally handled by Nango and the selected mail provider as described above. The app does
not sell personal data.

## User choices and contact

Workspace administrators control installation, approved scopes, and removal of
the app. Users should use their PrivOS account controls for access, correction,
export, or deletion requests. Privacy and security questions can be sent to
`dev@privos.ai`.

Material changes to this notice will be published in this repository and, when
applicable, submitted as a new Marketplace version for review.
