# Dukanoh Pro — launch checklist

Everything in this file is a step that can only be taken on or near launch
day. The code changes are done; these are the switches.

Written 2026-09-07, after the Pro audit. See `seller-hub-spec.md` for what
Pro is; this covers only what has to change when it goes live.

---

## 1. Flip the sandbox gate

**`ALLOW_SANDBOX_EVENTS` is currently `true`.**

The RevenueCat webhook processes sandbox events while it's true. That is
correct pre-launch — TestFlight, Play internal testing and the RevenueCat
Test Store are the only purchase channels available before the App Store
approves the in-app purchases, so without it no Pro flow could be tested at
all.

Once real purchases are possible, it must be `false`. Otherwise anyone with a
tester build can subscribe with a sandbox account, free, and receive real Pro
in the live database.

```bash
supabase secrets set --project-ref ewjerucqcmluovxdcdsu ALLOW_SANDBOX_EVENTS=false
```

Sandbox purchases never claim a founder slot regardless of this flag, so the
150 cap is safe either way. What the flag controls is whether they grant the
tier at all.

## 2. Get the iOS in-app purchases approved

All three App Store products sit at **Ready to Submit**:

- `com.dukanoh.pro_monthly`
- `com.dukanoh.founder_monthly`
- `boost_single`

That state works in Sandbox and fails in production. They must reach
**Approved**, and the first one has to be submitted attached to an app
version. Play Store products are already Published.

Until this clears, no real member can buy Pro or a boost on iOS.

## 3. Confirm `default` is the Current offering

The paywall reads `offerings.current` exclusively. If no offering is marked
Current, `offerings.current` is null, both package lookups return null, and
tapping Subscribe shows "Could not load subscription" — nobody can buy
anything.

RevenueCat → Product catalog → Offerings → confirm `default` carries the
**Current** badge.

## 4. Verify one real webhook payload

`FOUNDER_PRODUCT_IDS` is currently:

```
com.dukanoh.founder_monthly,dukanoh_founder:monthly,dukanoh_founder
```

The bare `dukanoh_founder` is defensive — RevenueCat does not always include
the Play base-plan suffix in `product_id`. After the first real founder
purchase, check the `revenuecat_events` table:

```sql
select event_type, environment, product_id, received_at
from public.revenuecat_events order by received_at desc limit 20;
```

If the Play `product_id` arrives in a form not in that list, founder
purchases on Android silently become standard Pro. Fix the secret, don't
guess.

Do **not** add the RevenueCat Test Store's `monthly` product to the list: it
shares that identifier with the standard Pro package, so it cannot
distinguish the tiers.

## 5. Smoke-test error reporting

`reportError` and `initErrorReporting` both no-op under `__DEV__`, so nothing
is recorded outside a production build. `app_errors` has never had a row —
which is expected pre-launch, but means the safety net is unproven.

On a production build, trigger one deliberate error and confirm a row lands:

```sql
select created_at, error_message, platform, app_version
from public.app_errors order by created_at desc limit 5;
```

Several Pro failure paths (empty offerings, purchase failures, restore
failures, share-kit capture failures) report through it and are otherwise
invisible.

## 6. Reset test data

Done once already on 2026-09-07. Repeat immediately before launch if more
testing happens in between:

```sql
update public.users
   set seller_tier = 'free', pro_expires_at = null,
       had_free_trial = false, had_founder_subscription = false,
       boosts_used = 0, boosts_reset_at = null
 where seller_tier <> 'free' or had_free_trial
    or had_founder_subscription or boosts_used > 0;

update public.platform_settings set value = '0' where key = 'founder_count';
delete from public.revenuecat_events;
```

`had_free_trial` matters: leaving it true means the member is offered
"Subscribe now" instead of the 14-day trial.

---

## Deliberately not automated

**Founder slots are released, not recycled by name.** When a founder's
subscription expires the slot returns to the pool and
`had_founder_subscription` is set permanently, so that person can't retake
founder pricing but someone new can have the slot. That's intentional.

**Fast Responder only measures answered conversations.** A seller who ignores
hard questions isn't penalised, because an unanswered thread has no reply
timestamp to measure. If the badge starts being gamed, add an answer-rate
floor to `refresh_avg_response_times`.

**The annual price rows in `platform_settings` are dead.** `$rc_annual` has
no products attached and no code reads `founder_annual_price` or
`pro_annual_price`. If annual billing ever ships, wire the package first.
