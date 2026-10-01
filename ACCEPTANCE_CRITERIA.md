# Acceptance Criteria

OpenCode should consider the project ready only when all applicable criteria below are satisfied.

## Core workflow
- [ ] Patient can be created/searched.
- [ ] Appointment/visit can be checked in and assigned to doctor.
- [ ] Doctor records actual work, materials, quantities, notes, and price.
- [ ] Completed doctor encounter appears in Secretary's waiting-for-payment queue.
- [ ] Secretary can record Cash, CliQ, or Visa collection.
- [ ] Secretary cannot change doctor-submitted price or create discount.
- [ ] Owner/Main Doctor is the only role capable of approving/applying discount.
- [ ] Payment completion updates visit/invoice status correctly.

## Inventory
- [ ] Medical products support lot/batch and expiry.
- [ ] Treatment use reduces stock automatically and exactly once.
- [ ] Purchase receipt increases stock.
- [ ] Inventory ledger explains every quantity change.
- [ ] Low-stock and expiring-stock views work.

## Purchases/expenses
- [ ] Secretary can submit operational purchase request.
- [ ] Owner can create medical purchase request.
- [ ] Invoice/evidence file can be attached to purchase/expense transaction.
- [ ] Accountant can review financial impact remotely.

## Accounting
- [ ] Revenue and cash collections are separate concepts in calculations.
- [ ] Payment method totals reconcile to underlying payments.
- [ ] Expenses and purchases are represented correctly.
- [ ] Monthly salaries can be entered and daily allocation is shown.
- [ ] Material cost consumed feeds profitability.
- [ ] Gross and net profit calculations are reproducible from ledger data.
- [ ] Daily/monthly dashboards filter correctly by clinic timezone.

## CRM/follow-up
- [ ] Patient history/timeline shows prior treatments.
- [ ] Birthday queue works.
- [ ] Follow-up tasks work and support completion status.
- [ ] Communication attempts can be logged.
- [ ] Messaging has a provider adapter and works in mock/local mode without credentials.

## Roles/security
- [ ] Owner/Main Doctor permissions enforced server-side.
- [ ] Accountant financial access works remotely without clinical-edit permission.
- [ ] Doctor permissions are limited to permitted patient/treatment workflows.
- [ ] Secretary operational permissions are limited correctly.
- [ ] Protected attachments are not public.
- [ ] Sensitive mutations write audit events.

## Quality
- [ ] Arabic RTL UI is usable.
- [ ] Responsive layouts work on mobile/tablet/desktop.
- [ ] No known TypeScript/build/lint failures.
- [ ] Migrations run on clean database.
- [ ] Seed command creates demo environment.
- [ ] Automated tests cover critical business flows.
- [ ] README documents setup, deployment, tests, backups, and unresolved TBDs.
