Deno.serve((req) => {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? '';

  const appUrl = `dukanoh://reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;

  return new Response(null, {
    status: 302,
    headers: { 'Location': appUrl },
  });
});
