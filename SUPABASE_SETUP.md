# KN FINANCE — Supabase Backend Foundation & Setup Guide

This guide describes how to configure and deploy the multi-tenant PostgreSQL backend for **KN FINANCE** using Supabase.

---

## Architecture Overview

KN FINANCE utilizes a multi-tenant relational schema:
- **`companies`**: Independent business tenant records. Each tenant has a unique `company_code`.
- **`company_users`**: Membership records for **Managers** and **Agents** scoped to a specific company. (Constraint: maximum 1 Manager per company).
- **`user_credentials`**: Isolated authentication store for future server-side PIN verification. Kept strictly inaccessible to direct client queries.
- **`borrowers`**: Loan records belonging to a company, assigned to an active Agent.
- **`payments`**: Transaction records with relational integrity (`borrower_id`, `collected_by_user_id`, `company_id`).
- **`activity_logs`**: Audit trail for business actions.
- **`company_settings`**: Per-company preferences (language, date format, alert toggles, defaults).

### Row Level Security (RLS)
Every table is guarded by PostgreSQL Row Level Security:
- **Managers**: Full access within their own `company_id`.
- **Agents**: Read-only access to their own profile and company branding. Can view and collect payments **ONLY** for borrowers explicitly assigned to them. Cross-company or cross-agent data access is strictly blocked at the database engine level.
- **Direct Client Access to Credentials**: Completely denied (`USING (false)`).

---

## Step 1: Create a Supabase Project

1. Log in to [Supabase](https://supabase.com).
2. Click **New Project**.
3. Choose an Organization, enter a project name (e.g. `kn-finance-db`), and set a strong database password.
4. Select your preferred region (e.g., `ap-south-1` for Mumbai / India).
5. Wait for the project initialization to complete.

---

## Step 2: Retrieve Public API Credentials

1. In your Supabase Dashboard, navigate to **Project Settings** (gear icon) -> **API** (or the **React + Vite** setup tab).
2. Locate the following two values:
   - **Project URL**: `https://<your-project-ref>.supabase.co`
   - **Publishable Key**: `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy `anon` key)

> [!CAUTION]
> **STRICT SECURITY RULE:**
> **NEVER** copy the `service_role` key into frontend code, Vite environment variables, `.env.local`, Vercel frontend variables, or GitHub. The `service_role` key bypasses all Row Level Security and must only be used in trusted server-side environments.

---

## Step 3: Configure Local Environment

Create a `.env.local` file in the root directory of the project:

```bash
# In project root: d:\O\Office Projects\KN Finance\.env.local
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key-here
```

*(Note: `.env.local` is included in `.gitignore` and will never be committed to Git).*

---

## Step 4: Apply SQL Migrations

Migrations are located in `supabase/migrations/`:
- `001_initial_schema.sql` (schema, constraints, indexes, triggers)
- `002_rls_policies.sql` (security definer functions and RLS policies)

### Using Supabase Dashboard SQL Editor
1. In your Supabase dashboard, click the **SQL Editor** tab on the left sidebar.
2. Click **New query**.
3. Copy the contents of `supabase/migrations/001_initial_schema.sql` into the editor and click **Run**.
4. Create a second new query, copy the contents of `supabase/migrations/002_rls_policies.sql`, and click **Run**.
5. Navigate to **Table Editor** to verify that all 7 tables (`companies`, `company_users`, `user_credentials`, `borrowers`, `payments`, `activity_logs`, `company_settings`) are created with RLS enabled.

---

## Step 5: Configure Vercel for Production

Before deploying to production, add the public environment variables to your Vercel project:

1. Open your project dashboard on [Vercel](https://vercel.com).
2. Go to **Settings** -> **Environment Variables**.
3. Add the following two environment variables for **Production**, **Preview**, and **Development**:
   - `VITE_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `<your-supabase-publishable-key>`
4. Trigger a new deployment (or push to `main`) to embed the environment variables into the Vite production build.

---

## Verification & Status

In `src/lib/supabase.ts`, the connection health helper can be used to verify connectivity:
```typescript
import { checkSupabaseConnection } from './lib/supabase';

const health = await checkSupabaseConnection();
console.log(health.message);
```

- When `.env.local` is present with valid credentials: `health.connected === true`.
- When credentials are not yet configured: `health.configured === false`, and the application gracefully continues in local mode without crashing.
