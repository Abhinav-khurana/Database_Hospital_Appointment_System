# Hospital Appointment System

## Fastest local setup

Install **Node.js 24 LTS** from https://nodejs.org/en/download (npm is included). Node.js 22 or newer is supported. You also need a modern browser such as Chrome or Edge. VS Code is optional; no extensions are required. MongoDB and Docker do not need to be installed separately for the normal setup.

Extract the entire ZIP. Open the `hospital-appointments` folder in VS Code or a terminal.

Run these commands from the folder containing package.json:

```sh
npm ci
npm run launch
```

Open **http://localhost:4000** once the terminal says it is ready. Keep that terminal running while using the app. Later, start it again with `npm run launch`; you only need `npm ci` on first installation or after dependency changes.

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd ci` and `npm.cmd run launch`, or select Command Prompt as your VS Code terminal.

The first local launch downloads a real MongoDB 7.0.14 executable. An internet connection is required for npm installation and that first download. This mode starts a single member replica set, loads the sample dataset and provisions accounts automatically. It is a real MongoDB database, not a simulated database. Subsequent launches retain data in `.local/mongo`. Keep that folder if you move the project. Stop cleanly with Ctrl+C before restarting. Do not run two copies of the local server against the same folder.

If Windows asks about network access, this project only needs local access. Do not expose the local database or server publicly. This package is a local academic demonstration using synthetic records.

## Sign in

| Role | Email | Default local demo password |
| --- | --- | --- |
| Patient | patient1@example.test | Hospital123! |
| Another patient | patient2@example.test | Hospital123! |
| Doctor | doctor1@example.test | Hospital123! |
| Another doctor | doctor2@example.test | Hospital123! |
| Administrator | admin@example.test | Hospital123! |

Patient accounts 1 through 30 and doctor accounts 1 through 10 follow the same email pattern. Their passwords are stored as bcrypt hashes. `.env` contains the generated JWT secret; do not commit it. To choose your own initial demo password, add `DEMO_PASSWORD=your-password-of-at-least-10-characters` to `.env` before the first launch. The provisioning script preserves existing enabled account passwords on later runs.

## What to try

1. Create a new patient account from the sign in screen, or sign in as a supplied patient. Book an available future slot, reschedule it and cancel it.
2. Use a second patient account and try the same occupied doctor slot. The database prevents a conflicting booking.
3. Sign in as administrator. Register a patient from Patients and book on their behalf from Book appointment. Inspect the dashboard and export the consolidated report as CSV. Filter analytics by date. Add a department or doctor; deactivate and reactivate a doctor. Delete only a cancelled synthetic appointment if you want to demonstrate Delete.
4. Sign in as doctor. View your schedule and update availability. Complete a booked appointment whose scheduled start has arrived, entering notes and optional medicines. Completing a future appointment is intentionally disabled. The API saves the prescription and changes appointment status in one transaction.
5. Sign back in as that patient to view the prescription, download a readable HTML copy, or use Print or save PDF. Export the filtered appointment history as CSV.
6. Open Account settings under any role to change your password. Other sessions are invalidated.

Times on appointment screens are IST. Doctor availability settings explicitly use UTC: 09:00 UTC is 14:30 IST. Appointments use fixed 30 minute slots. Changing availability does not move existing appointments.

The normal seed puts completed visits in the past and booked visits in the next three days. To demonstrate consultation completion immediately, leave the local server running and use a second terminal:

```sh
npm run demo:consultation -- --local
```

This adds one explicitly synthetic past booking named A_CONSULT_DEMO for patient1 and doctor1. Refresh the doctor schedule, open that record, and complete it. The helper preserves an existing record on repeat runs. For an external MongoDB deployment, omit `--local`. This optional record increases the dataset count by one.

## Alternative persistent MongoDB installation

If you already have a MongoDB replica set or Atlas deployment, set `MONGODB_URI` and `DB_NAME` in `.env`, then run:

```sh
npm run db:seed
npm run db:provision
npm run build
npm start
```

The seed refuses nonempty collections. It never drops existing data. Use a fresh database name if you need an independent dataset. MongoDB must be a replica set for prescription and doctor account transactions. A standalone instance supports basic reads but is insufficient for the full application.

If Docker Desktop is available, the included configuration provides the replica set:

```sh
docker compose up -d
```

Wait until `docker compose ps` reports MongoDB as healthy. Keep the default `.env` connection on port 27017, then use the four commands above. Local auto MongoDB mode uses port 27019; Docker uses port 27017. The two modes have separate stored data. `npm start` and database commands use `.env`; `npm run local` manages its own database.

For frontend development with an external MongoDB deployment:

```sh
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the Express server on port 4000.

## Database commands

```sh
npm run db:verify
npm run db:demo
npm run db:analytics
```

These commands connect using `.env`. When using `npm run local`, leave the server running and point `MONGODB_URI` in a separate terminal or `.env` at `mongodb://127.0.0.1:27019/?directConnection=true` to inspect that database. Set `DB_NAME=hospital_appointments`.

The standalone CRUD demonstration inserts one uniquely named synthetic appointment and cleans it up afterward. Analytics and verification print JSON for screenshots or capture. They do not fabricate terminal output.

## Tests

```sh
npm test
```

Tests start an isolated temporary MongoDB replica set, exercise real queries and transactions, and remove only their generated test database. The first test run can download MongoDB. If downloads are blocked, supply `TEST_MONGODB_URI` pointing to a test replica set. Tests create a uniquely named `hospital_test_...` database and delete that database after completion.

`evidence/` contains the actual test output and build verification from package preparation. Full academic documentation is intentionally deferred.

## Troubleshooting

- **npm is not recognized:** install Node.js LTS, then reopen VS Code.
- **Port already in use:** stop the old server. Automatic local MongoDB uses port 27019 and the web server uses 4000.
- **MongoDB download fails:** check your connection or use the Docker/existing MongoDB route.
- **Replica set required:** use the supplied Docker configuration, Atlas, or `npm run local`.
- **Seed requires empty collections:** existing records were found; do not reset valuable data. Choose a new database name for a separate demonstration.
- **Login fails:** use the provisioned email and the password from first provisioning; `npm run setup` does not create database accounts.
- **No slots:** choose an active doctor and another future date. Existing appointments occupy their slots until cancelled.
- **Local replica cannot start after an interrupted shutdown:** ensure no other process owns port 27019. Preserve `.local/mongo`; do not delete it as a routine fix.
