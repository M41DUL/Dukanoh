Deno.serve(() => {
  return new Response(null, {
    status: 302,
    headers: { Location: 'dukanoh://stripe-onboarding' },
  });
});
