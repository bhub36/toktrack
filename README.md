# TokTrack

TokTrack is a Vite + React app for tracking TikTok brand partnerships, gifted campaigns, and manual video entries.

## Local setup

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the TikTok proxy:

```bash
cd server
npm install
node server.js
```

## Supabase setup

TokTrack now supports persistent storage for:

- saved brands in the Brands tab
- manual video entries
- edited metadata for TikTok-synced videos

### 1. Create the database schema

In Supabase SQL Editor, run:

[`supabase/schema.sql`](/Users/a036770/Work/ttshop/toktrack/supabase/schema.sql)

### 2. Add frontend env vars

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_TIKTOK_CLIENT_KEY=your_tiktok_client_key
VITE_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_PROXY_URL=http://localhost:3001
```

### 3. Add proxy env vars

Create `server/.env`:

```bash
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
PORT=3001
```

## Notes

- If Supabase env vars are missing, the app still works in local-only mode with in-memory data.
- The supplied Supabase schema uses open anon policies for a quick prototype. Tighten RLS before using this in production.
