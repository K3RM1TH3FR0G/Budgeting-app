import { createClient } from '@supabase/supabase-js';

/* ── SUPABASE CLIENT ──
   Credentials come from .env (VITE_SUPABASE_URL / VITE_SUPABASE_KEY).
   Copy .env.example to .env and fill in your project details.
   Never commit the real .env file. */
export const supa = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);
