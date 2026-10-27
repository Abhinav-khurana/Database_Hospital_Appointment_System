# Hospital Appointment System

A local academic application built with React, Express and MongoDB. Start with **START_HERE.md**.

## Project team

- Gurseerat Kaur Oberoi
- Abhinav Khurana
- Anushka Jaiswal

Course: BCSE302P, Database Systems Lab

## Included

- Six MongoDB collections with validators and indexes.
- A deterministic baseline of 150 synthetic documents.
- Account provisioning for 30 patients, 10 doctors and an administrator.
- Public patient registration, administrator patient registration and searchable patient directory.
- Patient and administrator booking, listing, rescheduling and cancellation.
- Password changes with revocation of other sessions.
- Visit history CSV export and printable prescriptions with HTML download.
- Administrator deletion restricted to cancelled synthetic appointments in demo mode.
- Password login, JWT verification, roles and resource ownership checks.
- Doctor schedules, availability and prescription creation.
- Transactional consultation completion and doctor account creation.
- Six aggregation pipelines, charts, date filters and CSV export.
- Patient profile editing and administrator directory management.
- Real MongoDB integration tests and recorded evidence.

## Source layout

| Path | Purpose |
| --- | --- |
| database/01_schema.js | Collection definitions and validation |
| database/02_seed.js | Baseline synthetic dataset and safe seed command |
| database/03_indexes.js | Unique occupied slots and query indexes |
| database/04_crud_demo.js | Isolated create/read/update/delete demonstration |
| database/05_analytics.js | Six aggregation pipelines used by the API |
| database/provision.js | Demo role account provisioning |
| database/verify.js | Collection counts, index definitions and explain output |
| server/ | API, authentication, authorization and input validation |
| client/ | React interface and charts |
| scripts/ | Environment setup and local database launcher |
| tests/ | Database and API integration tests |
| sample-data/ | Six Extended JSON fixtures matching the 150 record reference dataset |
| evidence/ | Captured verification artifacts |
| compose.yaml | Optional MongoDB replica set for Docker |

## Alignment with the report

The database is named `hospital_appointments`; review labels do not appear in its name or code identifiers. The original six collection structure, fixed slots, reference mappings and six analytics are retained.

`npm run db:seed` creates **150 documents**: 5 departments, 10 doctors, 30 patients, 60 appointments, 15 prescriptions and 30 disabled users. `npm run db:provision` enables patient accounts and adds 10 doctor users and one administrator. This produces **161 documents**, with 41 users; the other collection counts remain unchanged. Automatic local setup runs both steps.

The default seed uses relative dates for usable future bookings. For the exact dates and aggregation results in the report, use `npm run db:seed -- --reference` on an empty database. Reference mode uses 1 through 6 October 2026. These fixed appointments naturally become historical; use normal seed mode for interactive booking demonstrations.

The baseline analytics are 45 noncancelled visits, 6 distinct patients per department, specialization counts of 10/10/9/8/8, average waiting time 7 minutes over 15 consultations, and 60 consolidated report rows. New operations change those figures.

Seven explicit indexes are included: the five report indexes plus unique patient and doctor account mappings. Validators cover all six collections. The application performs reference and ownership checks; MongoDB references themselves are not foreign keys.

Public registration creates patient accounts only. Administrators can also register patients and book for them. The application has no email password recovery service, email reminders, payment processing, video consultation provider or clinical decision support. Teleconsultation is a booking mode only. Availability is one or more stored weekly windows; the simple UI edits one window. Deactivating a doctor prevents new bookings and doctor API access; existing appointments remain visible for administrative rescheduling or cancellation.

## API summary

All routes except login, patient registration, config and health require a Bearer token. Validation rejects unknown body fields.

| Method and route | Access / action |
| --- | --- |
| POST /api/auth/login | Email and password login |
| POST /api/auth/register | Public patient signup; profile and user transaction |
| POST /api/auth/password | Authenticated password change; revokes other sessions |
| POST /api/patients | Admin patient registration |
| GET /api/me | Own identity and profile |
| PATCH /api/me | Patient profile only |
| GET /api/departments | Authenticated directory |
| POST/PATCH /api/departments[/id] | Administrator maintenance |
| GET /api/doctors | Active doctor directory; admin sees inactive too |
| POST /api/doctors | Administrator; profile plus user transaction |
| PATCH /api/doctors/:id | Admin maintenance or own doctor availability |
| GET /api/doctors/:id/slots?date=YYYY-MM-DD | IST calendar date and slot availability |
| GET /api/appointments | Patient owns records; doctor owns schedule; admin sees all |
| POST /api/appointments | Patient self booking or admin with patientId |
| PATCH /api/appointments/:id | Patient owner or admin; action cancel/reschedule |
| DELETE /api/appointments/:id | Admin; cancelled synthetic record; demo mode only |
| POST /api/prescriptions | Assigned doctor; atomic completion and prescription |
| GET /api/prescriptions/:id | Patient owner, assigned doctor or admin |
| GET /api/admin/summary | Admin counts, status summary and appointment indexes |
| GET /api/patients | Admin patient directory |
| GET /api/analytics/:report | Admin; optional ISO from/to timestamps |

Report names: daily-load, department-patients, monthly-trend, specializations, waiting-time, appointment-report. `from` is inclusive and `to` exclusive. The chart fills internal missing months with zero between the first and last returned months. CSV export uses the same selected date range.

## Run locally

```sh
npm ci
npm run launch
```

Open http://localhost:4000 and keep the terminal running. See START_HERE.md for full instructions.

## Repository

https://github.com/Abhinav-khurana/Database_Hospital_Appointment_System

Keep `.env`, `.local`, node_modules and real patient data out of version control.
