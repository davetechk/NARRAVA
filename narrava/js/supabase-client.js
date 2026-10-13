// supabase-client.js
//
// Single shared Supabase client instance, built from the public values
// in config.js. Everything else in the app should use `supabaseClient`
// rather than creating its own client.

// A password reset link (auth.js) lands back on index.html with its result
// in the address: tokens plus type=recovery when the link worked, or
// error / error_code when it had expired or was already used. Read here,
// before supabase-js reads and clears it, so the rest of the app knows a
// reset is in progress: 'recovery', 'error' or null.
function readAuthRedirectAtLoad(){
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  new URLSearchParams(window.location.search).forEach((value, key) => { if(!params.has(key)) params.set(key, value); });
  if(params.get('type') === 'recovery' && params.get('access_token')) return 'recovery';
  if(params.get('error_code') || params.get('error_description')) return 'error';
  return null;
}
const authRedirectAtLoad = readAuthRedirectAtLoad();

// Resolves once the person arriving from a reset link is done with the
// popup (password saved, or popup closed). app.js waits on it before the
// maintenance screen, which replaces the whole page, popup included.
// Already resolved on every ordinary load.
let settleAuthRedirect;
const authRedirectSettled = new Promise(resolve => { settleAuthRedirect = resolve; });
if(!authRedirectAtLoad) settleAuthRedirect();

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
