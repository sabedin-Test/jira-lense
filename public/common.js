async function refreshAuth() {
  const me = await (await fetch('/api/me')).json();
  if (me.oauth && !me.authenticated) { location.href = '/login'; return; }
  const box = document.getElementById('signedin');
  if (box) box.hidden = !me.oauth;
}

document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/login';
});
refreshAuth();
