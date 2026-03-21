# Auth Journey — How It All Works

A beginner-friendly guide to how authentication works in Dukanoh. Use this as a reference when you need to understand what happens when a user signs up, logs in, resets their password, or gets redirected.

---

## The Big Picture

```
User opens app
       |
  Splash animation plays
       |
  App checks: "Is this user logged in?"
       |
   +---+---+
   |       |
  NO      YES
   |       |
 Intro   Home
 Screen   (tabs)
```

Your app uses **Supabase** for authentication. Supabase handles storing user emails, passwords, and sessions — you don't need to build any of that yourself. Your app just asks Supabase "is this person logged in?" and reacts accordingly.

---

## Key Files — What Lives Where

| File | What it does |
|------|-------------|
| `lib/supabase.ts` | Creates the connection to your Supabase project. Every auth call goes through this. |
| `hooks/useAuth.ts` | The main auth hook. Checks if there's a session, fetches the user's profile, and provides `signOut`. Used everywhere. |
| `app/_layout.tsx` | The root layout. Decides where to send the user (intro vs tabs) based on their auth state. |
| `app/(auth)/_layout.tsx` | Groups the auth screens together (intro, signup, login). Adds swipe-back gesture. |
| `app/(auth)/intro.tsx` | The first screen new users see. Has "Join today" and "Already have an account" buttons. |
| `app/(auth)/signup.tsx` | Create account form — username, email, password. |
| `app/(auth)/login.tsx` | Sign in form — email and password. |
| `app/reset-password.tsx` | "Set new password" screen — opened via deep link from reset email. |
| `components/AuthLayout.tsx` | Shared layout for login, signup, and reset screens (back button, logo, keyboard handling). |
| `components/AuthSheet.tsx` | Bottom sheet that appears on intro screen — lets user choose Apple/Google/Email. |
| `components/ForgotPasswordSheet.tsx` | Bottom sheet on login screen — enter email to get a reset link. |
| `components/BottomSheet.tsx` | The reusable bottom sheet component (swipe to dismiss, backdrop, keyboard avoidance). |
| `constants/authStyles.ts` | Shared helpers — input styling, email regex, timeout wrapper, error messages. |

---

## Flow 1: New User Signs Up

```
Intro screen
    |
    | taps "Join today"
    v
AuthSheet opens (bottom sheet)
    |
    | taps "Continue with Email"
    v
Signup screen
    |
    | fills in username, email, password
    | taps "Create account"
    v
App calls supabase.auth.signUp()
    |
    | Supabase creates the auth record
    | Database trigger (handle_new_user) auto-creates a row in the "users" table
    | A session is returned immediately (email confirmation is OFF)
    v
Root layout detects the new session
    |
    | onboardingCompleted is false (new user)
    v
Redirects to /onboarding
```

### What happens behind the scenes

1. **`supabase.auth.signUp()`** sends the email and password to Supabase. It also sends the username in `options.data` (metadata).

2. **Database trigger** — There's a function in your database called `handle_new_user` that runs automatically whenever a new auth user is created. It takes the username from the metadata and creates a profile row in the `users` table. You never call this yourself — it just happens.

3. **Session** — Supabase returns a session token that gets stored on the user's device (via AsyncStorage). Next time they open the app, they're still logged in.

4. **Root layout redirect** — `useAuth()` in the root layout detects the session change. It checks `onboardingCompleted` from the user's profile. Since it's a new user, it's `false`, so they go to onboarding.

### Username availability check

While the user is typing their username, the app checks if it's already taken:
- Waits 500ms after they stop typing (debounce — avoids hammering the database)
- Queries the `users` table: "does a row with this username exist?"
- Shows a spinner while checking, then a checkmark or error

This works because the `users` table has a **public SELECT policy** — anyone can read profiles.

### Validation

- **Username**: 3-20 chars, lowercase letters/numbers/underscores only, must be unique
- **Email**: Must match a basic email pattern (checked on blur — when you tap out of the field)
- **Password**: Minimum 6 characters, strength indicator shows Weak/Good/Strong

---

## Flow 2: Returning User Logs In

```
Intro screen
    |
    | taps "Already have an account"
    v
AuthSheet opens
    |
    | taps "Continue with Email"
    v
Login screen
    |
    | enters email + password
    | taps "Sign in"
    v
App calls supabase.auth.signInWithPassword()
    |
    | Supabase checks credentials
    | Returns a session if correct
    v
Root layout detects the session
    |
    v
Redirects to /(tabs)/ (home)
```

### Security notes

- The login error always says "Invalid email or password" — never "email not found" or "wrong password". This prevents attackers from figuring out which emails have accounts.
- There's a double-tap guard — tapping "Sign in" twice quickly won't send two requests.
- Requests timeout after 30 seconds if the network is slow.

---

## Flow 3: Forgot Password

```
Login screen
    |
    | taps "Forgot your password?"
    v
ForgotPasswordSheet opens (bottom sheet)
    |
    | enters email
    | taps "Send reset link"
    v
App calls supabase.auth.resetPasswordForEmail()
    with redirectTo: "dukanoh://reset-password"
    |
    | Supabase sends an email with a magic link
    v
Sheet shows "Check your email" confirmation
    |
    | User opens their email app
    | taps the reset link
    v
Link opens the Dukanoh app via deep link (dukanoh://reset-password)
    |
    | Supabase automatically creates a session from the link token
    v
Reset Password screen (app/reset-password.tsx)
    |
    | enters new password
    | taps "Update password"
    v
App calls supabase.auth.updateUser({ password })
    |
    v
Shows "Password updated" — taps "Continue" → Home
```

### How the deep link works

- Your app has a **URL scheme** defined in `app.json`: `"scheme": "dukanoh"`
- This means links starting with `dukanoh://` open your app
- When you call `resetPasswordForEmail`, you tell Supabase to include `dukanoh://reset-password` in the email link
- The redirect URL must also be added in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**
- When the user taps the link, Expo Router matches `dukanoh://reset-password` to `app/reset-password.tsx`

---

## Flow 4: App Opens (Already Logged In)

```
App opens
    |
  Splash animation plays
  Meanwhile: useAuth() checks for an existing session in AsyncStorage
    |
  Session found!
    |
  Splash finishes → redirect to /(tabs)/
    |
  Splash fades out
    |
  Home screen visible
```

### The three-stage splash

The splash animation has three stages to prevent any screen flash:

1. **`splashDone`** — The animation finishes. Navigation happens NOW (while splash is still covering the screen).
2. **`routeReady`** — A short delay (100ms) lets the destination screen mount. Then the splash starts fading out.
3. **`splashVisible`** — After the fade-out finishes, the splash is removed from the screen entirely.

This prevents the flash of a wrong screen (like briefly seeing the home tab before the intro loads).

---

## Flow 5: User Logs Out

```
Profile tab → Sign out button
    |
    v
supabase.auth.signOut()
    |
    | Session is cleared from AsyncStorage
    | useAuth() detects session is now null
    v
Root layout redirect kicks in
    |
    | No session → redirect to /(auth)/intro
    v
Intro screen
```

---

## How the Redirect Logic Works (Root Layout)

The root layout (`app/_layout.tsx`) has two redirect effects:

### Effect 1: Initial redirect (after splash)
Runs once when the splash animation finishes. Checks session and navigates to the right place.

### Effect 2: Ongoing auth changes
Runs whenever `session` changes (login, logout, etc.) but only AFTER the splash is gone. This handles:
- User logs in → session appears → redirect to tabs
- User logs out → session disappears → redirect to intro

Both effects check "am I already in the right place?" before navigating, to avoid unnecessary redirects.

---

## Supabase Settings to Remember

| Setting | Where | Value |
|---------|-------|-------|
| Confirm email | Auth → Providers → Email | **OFF** (users can sign in immediately) |
| Reset redirect URL | Auth → URL Configuration → Redirect URLs | `dukanoh://reset-password` |
| RLS (Row Level Security) | Every table | **ON** (protects data even if someone gets your API key) |

---

## Shared Helpers (constants/authStyles.ts)

| Export | What it does |
|--------|-------------|
| `AUTH_INPUT_STYLE` | Dark-themed input styling used on all auth screens |
| `EMAIL_REGEX` | Simple pattern to check if an email looks valid |
| `withTimeout(promise)` | Wraps any async call with a 30-second timeout |
| `getAuthError(err, fallback)` | Turns errors into user-friendly messages. Detects network failures and timeouts specifically. |

---

## Database: What Gets Created Automatically

When a user signs up, the **`handle_new_user` database trigger** creates their profile:

```
auth.users (Supabase manages this)    →    public.users (your table)
├── id                                     ├── id (same UUID)
├── email                                  ├── username (from signup metadata)
├── encrypted_password                     ├── full_name (from metadata, or fallback)
└── raw_user_meta_data                     ├── onboarding_completed: false
    └── { username: "..." }                ├── is_seller: false
                                           └── created_at: now
```

You never insert into `public.users` manually — the trigger does it for you.

---

## Quick Reference: File → Supabase Call

| File | Supabase call | What it does |
|------|--------------|-------------|
| `signup.tsx` | `supabase.auth.signUp()` | Creates account + session |
| `signup.tsx` | `supabase.from('users').select()` | Checks username availability |
| `login.tsx` | `supabase.auth.signInWithPassword()` | Logs in, returns session |
| `ForgotPasswordSheet.tsx` | `supabase.auth.resetPasswordForEmail()` | Sends reset email |
| `reset-password.tsx` | `supabase.auth.updateUser()` | Changes password |
| `useAuth.ts` | `supabase.auth.getSession()` | Checks for existing session on app open |
| `useAuth.ts` | `supabase.auth.onAuthStateChange()` | Listens for login/logout events |
| `useAuth.ts` | `supabase.auth.signOut()` | Clears session |
