# MASTER PROMPT — Build the Clinic System End-to-End

You are the senior product engineer, solution architect, database engineer, QA engineer, and security reviewer for this project.

Your objective is to **build the entire clinic management system autonomously** from the requirements in `docs/BLUEPRINT_AR.md` and make it runnable as a real application.

## Non-negotiable behavior
1. Read the full blueprint before coding.
2. Create an internal phased implementation plan and execute it yourself.
3. Do not require the owner to prompt you feature-by-feature.
4. Do not turn the deliverable into static mock screens. Implement real persistence and business workflows.
5. Do not invent clinic policies for items marked TBD. Treat unresolved business behavior as configuration, feature flags, or disabled functionality while finishing the rest.
6. After each major phase, run relevant checks/tests and fix defects before moving on.
7. At the end, run the complete test/lint/typecheck/build suite and fix all errors you can reproduce.
8. Leave concise setup/deployment instructions and demo credentials in the README (demo only; never production secrets).

---

# Required product modules

Implement all confirmed requirements from the blueprint, including at minimum:

## A. Authentication and RBAC
Roles:
- Owner / Main Doctor
- Accountant
- Doctor (supports unlimited additional doctor accounts)
- Secretary

Provide user management for the Owner. Enforce permissions on backend endpoints/server actions.

Critical permission rule:
- **Only Owner/Main Doctor can apply or approve discounts.**
- Secretary cannot alter doctor-submitted treatment pricing.
- Accountant cannot alter clinical notes/treatment records.
- Doctors cannot see global financial information unless explicitly permitted by a future configurable permission.

## B. Patient / CRM
Patient profile with identifiers/contact information, timeline, visits, treatment history, important prior cosmetic procedures, notes appropriate to role, assigned doctor when applicable, birthday, follow-up status, last visit, total spend, number of visits, segmentation/tags, and communication history.

Support patient search and fast retrieval.

Add follow-up task infrastructure and birthday/follow-up queues. Messaging must be implemented behind a provider adapter; without live provider credentials, use a safe local/mock flow while retaining send status/history.

## C. Appointment / Visit workflow
Implement the clinic flow from reception through doctor to cashier/secretary:
- Appointment / walk-in visit
- arrival/check-in
- waiting
- with doctor
- doctor completes treatment
- doctor records services, actual materials/quantities, notes, and price
- doctor sends bill to secretary
- secretary sees a clear "waiting for payment" queue
- secretary records payment method and completes collection
- completed visit

All state transitions must be explicit, permission-checked, timestamped, and auditable.

## D. Treatment encounter
Doctor can record:
- performed services/procedures
- actual consumables/products used
- quantity/unit
- selected inventory batch where relevant
- treatment notes/history fields defined by blueprint
- requested/final service price according to permission rules
- follow-up instruction/task

Closing/sending a treatment to billing must create the correct downstream records without double posting.

## E. Billing and collections
Support:
- invoice/charge generated from doctor-completed encounter
- payment methods: Cash, CliQ, Visa
- split payments if enabled by requirements/configuration
- paid / unpaid / partial states if the configured policy enables them
- receipts/attachments
- immutable historical totals with controlled correction/void behavior
- discount audit showing original amount, discount, final amount, approver, timestamp, reason when required

Secretary collects but cannot create a discount.

## F. Inventory
Products/materials must support:
- name/category
- SKU/internal code where useful
- stock unit and usage unit
- on-hand quantity
- cost basis
- supplier
- lot/batch number
- expiry date
- reorder threshold
- active/inactive

Inventory movements:
- purchase receipt
- treatment consumption
- manual adjustment with permission and reason
- wastage/damage/expiry where enabled/configured
- reversal/correction linked to source transaction

Treatment usage must automatically reduce inventory. Preserve traceability from patient treatment -> product -> lot/batch -> movement.

Use transactions/idempotency so a treatment cannot accidentally deduct stock twice.

## G. Purchasing and expenses
Secretary can create operational purchase requests (e.g. cleaning supplies) for Owner/Main Doctor review.
Owner/Main Doctor can create medical purchase requests (e.g. Botox/filler/medical supplies).

Each purchase/expense operation supports invoice/evidence image or PDF upload and linkage to the transaction.

Implement purchase request lifecycle based on confirmed blueprint states. If a specific approval edge is TBD, keep that edge configurable rather than inventing policy.

Receiving stock from a medical purchase should create inventory receipts and financial records as appropriate.

## H. Attachments
Secure attachment module for:
- purchase invoices
- receipts/payment evidence
- relevant patient/treatment attachments if enabled

Store metadata in database and file bytes through a storage adapter. Provide local development storage and a cloud-compatible adapter boundary. Access must honor role/record permissions.

## I. Expenses, payroll, and accounting dashboards
Implement:
- income/revenue
- collections by method
- expenses
- purchases
- payroll
- daily allocated salary expense derived from monthly salary
- doctor compensation/commission only if configured; do not invent commission policy
- gross profit
- net profit
- outstanding amounts if that feature is enabled
- cash-flow view separate from revenue/profit

Money must be decimal-safe.

Daily dashboard should correctly distinguish:
- sales/revenue
- collected cash/payment amount
- material cost consumed
- payroll allocation
- operating expenses allocation/actual expense according to configured accounting treatment
- gross/net profit

## J. Cash/day closing
Implement a daily closing workflow for secretary/accounting where confirmed by blueprint:
- expected Cash / CliQ / Visa totals
- actual counted/confirmed values where appropriate
- variance and reason
- closed by + timestamp
- accountant visibility
- prevent accidental silent edits after closing; corrections require controlled audit trail

If an exact close-day rule is marked TBD, use configuration while keeping the core reconciliation feature.

## K. Dashboards
Separate role-oriented dashboards:

### Secretary
appointments/visits today, patient states, waiting-for-payment, payment collection, follow-ups, birthdays, operational purchase requests.

### Doctor
today's patients, waiting patients, own completed encounters, treatment/follow-up actions, relevant inventory alerts.

### Owner/Main Doctor
business overview, approval center, revenue, collections, costs, profit, patients, doctor performance where allowed, inventory alerts, expiring stock, pending purchases, discount approvals.

### Accountant
financial dashboard, collections by method, expenses, payroll, purchases, reconciliation, gross/net profit, outstanding balances when enabled, and export/report access.

## L. Reports
Provide useful filterable reports by day/week/month/date range for:
- revenue
- collections/payment methods
- expenses
- purchases
- profitability
- inventory usage and value
- low stock / expiring lots
- services
- patients/new vs returning
- doctor activity/performance within permitted scope
- discounts
- audit events

Export behavior marked TBD should be implemented behind an easy-to-enable export service, with CSV as a reasonable technical default if no clinic policy is implicated.

## M. Audit log
Mandatory for sensitive operations. Include at least:
- actor
- role
- action
- entity type/id
- timestamp
- before/after or structured change metadata
- request/correlation metadata where useful

Make audit records read-only through normal product flows.

## N. Settings
Central settings for technical/business parameters that are unresolved but safe to configure, for example:
- clinic name/contact/logo
- timezone (default Asia/Amman)
- currency (default JOD)
- reminder settings
- inventory thresholds
- optional accounting features
- messaging provider configuration

Do **not** make "discount by secretary" configurable; business rule is confirmed that discount belongs only to Main Doctor.

---

# Database and transaction design

Design a normalized relational schema covering, at minimum, users/roles, patients, appointments/visits, encounters/treatments, treatment items/services, treatment material usage, invoices, invoice lines, payments, discounts/approvals, products, lots/batches, stock movements, suppliers, purchase requests, purchase orders/receipts as needed, expenses, employees/payroll, follow-up tasks, communication logs, attachments, day closings/reconciliation, settings, and audit logs.

Use foreign keys and constraints. Add indexes for common queries. Use database transactions for multi-step posting.

Never represent financial values using JS floating point. Use database Decimal/Numeric and a safe application representation.

---

# UX requirements

- Arabic-first and RTL.
- Professional medical/clinic visual design; clean, premium, calm, not flashy.
- Fast workflow for secretary and doctor with minimal clicks.
- Clear statuses/badges and no ambiguous financial state.
- Responsive desktop/tablet/mobile.
- Good keyboard usability for front desk.
- Confirmation dialogs for irreversible/high-risk actions.
- File upload preview/status.
- Search/filter/date-range controls.
- Empty/loading/error/success states.

---

# Security requirements

- Secure password/session handling.
- Backend authorization for every protected mutation/read.
- Protect uploaded files from public unauthenticated exposure.
- Avoid leaking sensitive patient/financial fields in logs.
- CSRF/session protections appropriate to chosen framework.
- Validate uploaded file type/size and sanitize filenames.
- Rate-limit sensitive auth endpoints if infrastructure permits.
- Principle of least privilege.
- Provide a documented backup/restore strategy for PostgreSQL and file storage.

---

# Seed/demo data

Provide safe synthetic demo data sufficient to demonstrate all workflows:
- 1 Owner/Main Doctor
- 1 Accountant
- 2 Doctors
- 1 Secretary
- sample patients
- sample products/lots
- sample visits/treatments
- sample payments Cash/CliQ/Visa
- sample purchase requests and invoices
- sample expenses/payroll
- follow-ups/birthdays

Put demo credentials only in local seed/README and make it explicit they must be changed/removed in production.

---

# Testing requirements

At minimum test these business-critical flows:
1. Doctor completes treatment -> usage is recorded -> bill appears for secretary.
2. Secretary cannot alter doctor price or apply discount.
3. Owner can apply/approve discount and it is fully audited.
4. Secretary records Cash/CliQ/Visa payment.
5. Treatment consumption reduces correct inventory lot/quantity exactly once.
6. Purchase receipt increases inventory and attaches invoice evidence.
7. Unauthorized roles cannot access restricted financial/clinical actions.
8. Monthly salary correctly contributes daily allocated cost to dashboard.
9. Financial dashboard calculations reconcile against underlying transactions.
10. Follow-up/birthday queues produce the expected patients.
11. Attachment authorization prevents unrelated roles from accessing protected files.
12. Audit log captures sensitive mutations.

Add additional tests discovered from the blueprint.

---

# Final deliverables

The repository must contain:
- complete source code
- DB schema/migrations
- seed data
- `.env.example`
- README with local setup
- production deployment notes
- backup/restore notes
- test commands
- demo account details for local seed
- architecture summary
- list of TBD business policies still configurable/not enabled

The app should run locally from documented commands without manual code edits.

At the very end, produce a concise completion report in the repository, e.g. `IMPLEMENTATION_REPORT.md`, listing:
- implemented modules
- test/build status
- remaining external integrations that need real credentials
- unresolved clinic-policy TBDs
- deployment checklist

Do not declare completion while known reproducible build/type/test errors remain.
