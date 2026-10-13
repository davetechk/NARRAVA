// Shared Supabase client

// Password reset link result, read before supabase-js clears the URL: 'recovery', 'error' or null
function readAuthRedirectAtLoad(){
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  new URLSearchParams(window.location.search).forEach((value, key) => { if(!params.has(key)) params.set(key, value); });
  if(params.get('type') === 'recovery' && params.get('access_token')) return 'recovery';
  if(params.get('error_code') || params.get('error_description')) return 'error';
  return null;
}
const authRedirectAtLoad = readAuthRedirectAtLoad();

// Resolves when the reset popup is done (app.js holds maintenance until then)
let settleAuthRedirect;
const authRedirectSettled = new Promise(resolve => { settleAuthRedirect = resolve; });
if(!authRedirectAtLoad) settleAuthRedirect();

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
