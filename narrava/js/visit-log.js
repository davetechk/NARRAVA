// One page_visits row per page load (consumer app only, called from app.js init)

let visitLogged = false;

async function logPageVisit(){
  if(visitLogged) return;
  visitLogged = true;

  try {
    const { data, error: sessionError } = await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    const userId = data && data.session && data.session.user ? data.session.user.id : null;
    if(!userId) return;

    const { error } = await supabaseClient
      .from('page_visits')
      .insert({ user_id: userId, visited_at: new Date().toISOString() });
    if(error) throw error;
  } catch(err){
    console.error('Narrava: failed to log page visit', err);
  }
}
