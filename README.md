# 🏥 Hospital Token Management System

A modern, real-time, role-based digital token queue and healthcare management system. Engineered for high-throughput OPD clinics and multi-specialty hospitals with four dedicated dashboards: **Administrator**, **Doctor**, **Receptionist**, and **Patient**.

Built with **React 18**, **Vite**, **Tailwind CSS**, and **Supabase** (PostgreSQL, Row-Level Security, GoTrue Auth, and Realtime WebSockets).

---

## ✨ Features by Role

### 👑 Administrator Control Center (`/admin`)
- **Real-Time KPIs**: Live counts for total tokens generated today, active queue, completed consultations, emergency cases, and active doctors.
- **Doctor Management (CRUD)**: Create new doctor accounts with instant GoTrue credentials, assign departments, configure average consultation durations, and toggle doctor availability/active status.
- **Staff / Receptionist Management (CRUD)**: Provision reception desk staff accounts with instant login credentials and active status toggles.
- **Global Patient Directory**: Search and filter registered patients by name, phone, or UUID. View complete consultation and token history modal for any patient.
- **Live Token Workflow Inspector**: Monitor hospital-wide queues in real-time, filter by date, doctor, or status, and manually requeue or cancel tokens.

### 🩺 Doctor Consultation Desk (`/doctor`)
- **Queue Controller**: Real-time queue view with instant `Call Next Patient`, `Start Consultation`, `Complete`, and `Skip (No-Show)` actions.
- **Emergency Prioritization**: Emergency tokens automatically jump to the top of the waiting queue.
- **Live Wait-Time Estimator**: Dynamic calculation based on average consultation durations and patients ahead in queue.
- **Doctor Availability Toggle**: Set desk status to Available or On-Break.

### 🏥 Receptionist Desk (`/reception`)
- **Walk-in Registration**: Issue new tokens for walk-in patients with instant department and doctor assignment.
- **Emergency Flag**: Toggle high-priority status for urgent medical cases.
- **Queue Operations**: Re-queue skipped patients or cancel tokens upon request.
- **Doctor Directory**: Live overview of all hospital doctors and their current room availability.

### 👤 Patient Self-Service Portal (`/patient`)
- **Self-Booking**: Generate a queue token for available doctors on the current day.
- **Live Queue Tracking**: Real-time countdown of patients ahead, estimated wait time, and current token being served.
- **SMS/Phone Verification**: Form validation ensures proper 10-digit Indian mobile numbers.

---

## 🔒 Security & Validation Standards

- **Zero Hardcoded Secrets**: All backend URLs and keys are loaded strictly via environment variables (`.env`).
- **Row-Level Security (RLS)**: Client browsers can never directly modify token or user records. All state transitions run via PostgreSQL `SECURITY DEFINER` functions (`create_token`, `call_next`, `admin_create_doctor`, etc.).
- **Indian Mobile Validation**: Strict 10-digit format (`/^[6-9]\d{9}$/`) enforced both on the client forms and in PostgreSQL database triggers.
- **Password Policies**: Minimum 6 characters strictly enforced for all roles during account creation and authentication.
- **Password Visibility Toggles**: Accessible eye-toggle controls integrated into all password inputs across login and admin creation modals.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** 18+ installed
- A free **Supabase** project at [supabase.com](https://supabase.com)

### 2. Database Setup (Single Script)
1. In your **Supabase Dashboard**, open **SQL Editor** -> **+ New query**.
2. Copy the entire contents of [`supabase/complete_setup.sql`](file:///e:/HM%20TECHONOLOGIES/DEMO%20PROJECTS/hospital-token-system/supabase/complete_setup.sql) and paste it into the editor.
3. Click **Run**.
   - This sets up all database tables, enum types, security rules, triggers, realtime subscriptions, default hospital departments, and provisions the default Administrator account.
4. *(Optional)* In **Authentication** -> **Providers** -> **Email**: toggle **Confirm email** off for instant local testing without email confirmation.

### 3. Environment Configuration
Create a `.env` file in the project root (copied from `.env.example`):

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> **IMPORTANT:** Use ONLY your Supabase **anon public** key. Never put the `service_role` secret key into this application!

### 4. Install & Run Locally

```bash
# Install dependencies
npm install

# Run automated test suite (20 unit & integration tests)
node --env-file=.env --test test/validation.test.js test/admin_crud.test.js test/tokens.test.js

# Start local development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🔑 Default Accounts (Out of the Box)

| Role | Email | Password | Access URL |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@hospital.com` | `admin123` | `http://localhost:5173/admin` |
| **Doctor** | *(Create via Admin Dashboard)* | Minimum 6 chars | `http://localhost:5173/doctor` |
| **Receptionist** | *(Create via Admin Dashboard)* | Minimum 6 chars | `http://localhost:5173/reception` |
| **Patient** | *(Self Sign-up on Login page)* | Minimum 6 chars | `http://localhost:5173/patient` |

---

## 🌐 Deploy to Vercel

This repository includes a production-ready [`vercel.json`](file:///e:/HM%20TECHONOLOGIES/DEMO%20PROJECTS/hospital-token-system/vercel.json) configured for Vite Single Page Applications (SPA).

### Step-by-Step Vercel Deployment:

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: complete hospital token management system"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hospital-token-system.git
   git push -u origin main
   ```

2. **Import into Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **Add New...** -> **Project**.
   - Import your `hospital-token-system` repository.
   - Framework Preset: **Vite** (auto-detected).
   - Root Directory: `./`
   - Build Command: `vite build` (or `npm run build`)
   - Output Directory: `dist`

3. **Configure Environment Variables in Vercel**:
   In the **Environment Variables** section of the Vercel project configuration, add:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-public-key`

4. **Click Deploy**:
   - Vercel will build and deploy the application in ~30 seconds.

5. **Update Supabase URL Configuration**:
   - In your **Supabase Dashboard**, navigate to **Authentication** -> **URL Configuration**.
   - Set **Site URL** to your Vercel deployment URL (e.g., `https://your-app.vercel.app`).
   - Add `https://your-app.vercel.app/**` to **Redirect URLs**.

---

## 📁 Project Directory Structure

```text
hospital-token-system/
├── .env.example              # Template for required environment variables
├── .gitignore                # Ensures .env and node_modules are never committed
├── index.html                # Application HTML entry point
├── package.json              # NPM dependencies and scripts
├── vercel.json               # Vercel deployment config (SPA rewrites & cache headers)
├── vite.config.js            # Vite build configuration
├── src/
│   ├── App.jsx               # Main router & role-based route guard
│   ├── index.css             # Design tokens & styling
│   ├── main.jsx              # React DOM mounting
│   ├── components/
│   │   ├── Navbar.jsx        # Navigation bar with role badge & sign out
│   │   └── ui.jsx            # Reusable UI kit (Buttons, Inputs, Modals, Cards)
│   ├── hooks/
│   │   ├── useAuth.js        # Supabase authentication session & role state
│   │   └── useLive.js        # Supabase Realtime WebSocket queue synchronization
│   ├── lib/
│   │   ├── api.js            # Supabase RPC and query abstraction layer
│   │   ├── supabase.js       # Supabase client initializer
│   │   └── validation.js     # Shared client & unit-tested validation rules
│   └── pages/
│       ├── Admin.jsx         # Administrator Control Center (5 tabs)
│       ├── Doctor.jsx        # Doctor queue & consultation workflow
│       ├── Login.jsx         # Sign-in & patient registration with password toggles
│       ├── Patient.jsx       # Patient queue tracking & self-booking
│       └── Reception.jsx     # Walk-in desk token creation & doctor availability
├── supabase/
│   ├── complete_setup.sql    # Complete all-in-one database script
│   ├── schema.sql            # Core database schema & RLS policies
│   ├── migration_admin.sql   # Standalone Admin migration script
│   └── fix_auth_users.sql    # GoTrue identity synchronization helper
└── test/
    ├── admin_crud.test.js    # Unit & validation tests for admin operations
    ├── tokens.test.js        # Queue ordering & wait-time algorithm tests
    └── validation.test.js    # Phone & password constraint tests
```

---

## 🧪 Testing

The system includes automated unit and integration tests verifying Ponytail engineering constraints:

```bash
# Run all automated tests
node --env-file=.env --test test/validation.test.js test/admin_crud.test.js test/tokens.test.js
```

### Test Coverage Highlights:
- ✅ **10-Digit Indian Phone Validation**: Ensures numbers with letters, punctuation, invalid prefixes (1-5), and lengths $\neq$ 10 are rejected.
- ✅ **Password Length Validation**: Ensures passwords $< 6$ characters are rejected across all roles.
- ✅ **Queue Ordering & Emergency Priority**: Validates that emergency tokens take precedence over standard tokens regardless of token issue sequence.
- ✅ **Admin Safety Constraints**: Ensures doctor hard-deletion is blocked if historical or active tokens exist.

---

## 📄 License

MIT License. See [LICENSE](file:///e:/HM%20TECHONOLOGIES/DEMO%20PROJECTS/hospital-token-system/LICENSE) for details.
