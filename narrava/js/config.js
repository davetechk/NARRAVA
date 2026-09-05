// config.js
//
// This file holds only the Supabase *anon* (public) key, not a secret.
// Row Level Security policies on the database control what this key
// can actually read or write, so it is safe to ship inside frontend
// code that runs in the browser. This is NOT the same kind of value as
// a service role key — a service role key bypasses RLS entirely and
// must never appear in this codebase, in this file or anywhere else.

const SUPABASE_URL = "https://bzbowtnupdduakoghtqf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Ym93dG51cGRkdWFrb2dodHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNjE2NzEsImV4cCI6MjEwMjgzNzY3MX0.WiU_lAh-SjieB-3kONEKQ-S_V0ywmgS8VjxrBgcVnic";

// Bunny Stream's library ID — a public numeric identifier used to build
// playback embed URLs (iframe.mediadelivery.net/embed/{libraryId}/{videoId}).
// Like SUPABASE_URL, this is not a secret: it identifies which public
// video library to embed from, it grants no write access on its own.
const BUNNY_LIBRARY_ID = "741023";
