// supabase-client.js
//
// Single shared Supabase client instance, built from the public values
// in config.js. Everything else in the app should use `supabaseClient`
// rather than creating its own client.

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
