-- Retire AWS — 2026-09-18.
-- Rekognition and S3 are no longer used anywhere: recognition, moderation
-- and quality run on the Claude engine, and Fit training photos live in the
-- private fit-training Supabase bucket, recorded in garment_labels.
DROP TABLE IF EXISTS public.fit_training_images;
