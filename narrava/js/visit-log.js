// visit-log.js
//
// Real page_visits logging for the actual consumer app only — never
// loaded by any admin/*.html page (admin-shared.js/admin-*.js never
// include this file), so admin activity is never counted as a real
// visit. One real row per real page load, using whichever real
// account (anonymous or not) is already signed in by the time this
// runs — never a second row for internal screen changes within the
// same load, since this is only ever called once, from app.js's
// init(), never from showScreen().

let visitLogged = false; // guards a second call within this same load only — a genuine new page load runs this file fresh and logs again, correctly

async function logPageVisit(){
  if(visitLogged) return;
  visitLogged = true;

  try {
    const { data, error: sessionError } = await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    const userId = data && data.session && data.session.user ? data.session.user.id : null;
    if(!userId) return; // no real signed-in account yet — nothing real to attribute this visit to

    const { error } = await supabaseClient
      .from('page_visits')
      .insert({ user_id: userId, visited_at: new Date().toISOString() });
    if(error) throw error;
  } catch(err){
    console.error('Narrava: failed to log page visit', err);
  }
}
