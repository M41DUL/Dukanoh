-- Fast Responder badge — compute the data it has always read but never had.
--
-- `users.avg_response_time_mins` has existed since the initial schema and is
-- read by the public profile to render the "⚡ Fast Responder" badge
-- (app/user/[id].tsx), but nothing ever wrote it. Every row was NULL, so the
-- badge could never appear for any seller — a Dukanoh Pro feature that was
-- advertised on the paywall but never functioned.
--
-- Metric: per conversation, minutes from the buyer's FIRST message to the
-- seller's first reply after it. Averaged per seller over a 90-day window.
--
-- Deliberate tradeoffs:
--   * Only ANSWERED conversations count. An unanswered thread has no reply
--     timestamp, so it cannot contribute a duration. This does mean a seller
--     who ignores hard questions is not penalised — accepted for now because
--     the alternative (imputing a penalty) invents data. Revisit with an
--     answer-rate floor if the badge starts being gamed.
--   * Minimum 3 answered conversations, so one lucky fast reply cannot earn
--     the badge.
--   * Sellers who drop out of the window are reset to NULL by the same
--     statement (LEFT JOIN), so the badge decays instead of sticking forever.

-- Supports the correlated first-reply lookup below.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender_created
  ON public.messages (conversation_id, sender_id, created_at);

CREATE OR REPLACE FUNCTION public.refresh_avg_response_times()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.users u
     SET avg_response_time_mins = target.avg_mins
    FROM (
      SELECT
        s.id AS seller_id,
        -- Below the sample floor => NULL => no badge.
        CASE WHEN calc.sample_size >= 3 THEN calc.avg_mins END AS avg_mins
      FROM public.users s
      LEFT JOIN (
        SELECT
          per_conv.seller_id,
          ROUND(AVG(per_conv.response_mins))::INT AS avg_mins,
          COUNT(*)                                AS sample_size
        FROM (
          SELECT
            fb.seller_id,
            EXTRACT(EPOCH FROM (MIN(reply.created_at) - fb.asked_at)) / 60.0
              AS response_mins
          FROM (
            -- Earliest buyer message per conversation inside the window.
            SELECT DISTINCT ON (m.conversation_id)
                   m.conversation_id,
                   c.seller_id,
                   m.created_at AS asked_at
            FROM public.messages m
            JOIN public.conversations c ON c.id = m.conversation_id
            WHERE m.sender_id = c.buyer_id
              AND m.created_at >= NOW() - INTERVAL '90 days'
            ORDER BY m.conversation_id, m.created_at
          ) fb
          JOIN public.messages reply
            ON reply.conversation_id = fb.conversation_id
           AND reply.sender_id       = fb.seller_id
           AND reply.created_at      > fb.asked_at
          GROUP BY fb.conversation_id, fb.seller_id, fb.asked_at
        ) per_conv
        GROUP BY per_conv.seller_id
      ) calc ON calc.seller_id = s.id
      WHERE s.is_seller = TRUE
    ) target
   WHERE u.id = target.seller_id
     -- Skip no-op writes so the statement stays cheap on repeat runs.
     AND u.avg_response_time_mins IS DISTINCT FROM target.avg_mins;
END;
$$;

-- Cron-only. The DB default-denies EXECUTE; no client ever calls this, and it
-- writes a column users must not be able to set for themselves.
REVOKE EXECUTE ON FUNCTION public.refresh_avg_response_times() FROM PUBLIC, anon, authenticated;

-- Nightly at 03:15 UTC — a clear slot between the 02:xx and 03:30 jobs.
SELECT cron.schedule(
  'refresh-avg-response-times',
  '15 3 * * *',
  'SELECT public.refresh_avg_response_times()'
);
