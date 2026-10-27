# Verification record

The included integration-tests.txt records 30 passing tests against a real MongoDB replica set. The tests cover collection counts, baseline analytics, schema validation, indexes, authentication, role and ownership restrictions, concurrent bookings, rescheduling conflicts, cancellation, controlled deletion transaction rollback, public signup, duplicate signup rollback, date validation, administrator patient registration and booking, and password changes with session revocation.

build.txt records a successful production frontend build. persistence-check.txt records a successful database shutdown and restart with saved data retained.

browser-checks.txt records executed browser checks for consultation completion, prescription and visit history downloads, patient signup, password changes, administrator patient registration and administrator booking. Earlier checks exercised patient booking, rescheduling and cancellation. Browser screenshots are not included in this package.

The database verification and analytics captures were collected before interactive changes, using the relative-date sample dataset plus account provisioning: 161 documents. Browser actions and the optional consultation fixture add or update records, so interactive screens can show different appointment and prescription counts.

Verified in a Linux environment with Node.js 24 and MongoDB 7.0.14. Windows and macOS setup instructions are supplied, but those operating systems were not exercised here. First installation requires internet access to download npm dependencies and the MongoDB executable. Dependencies and database files are not included in the ZIP.
