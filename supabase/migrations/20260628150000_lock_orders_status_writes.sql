-- DEFERRED: apply ONLY after an app build with the RPC-based order mutations
-- (raise_dispute / withdraw_dispute / cancel_order) is live for all testers.
--
-- Drops the broad buyer/seller UPDATE policies on orders so order status can no
-- longer be written directly via the API (which only checked the NEW status,
-- allowing illegal transitions like completed->disputed and skipping the
-- refund/relist side effects). After this, all status changes go through the
-- SECURITY DEFINER RPCs or service-role (webhooks, crons, admin).
--
-- Applying this BEFORE the new build ships would break dispute/withdraw/cancel in
-- the currently-installed app.

DROP POLICY IF EXISTS "Buyers can update their own orders"  ON public.orders;
DROP POLICY IF EXISTS "Sellers can update their own orders" ON public.orders;
