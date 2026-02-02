-- Add separate URLs for Android download vs direct link
DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_download_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_direct_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Optional: backfill new columns from existing android_apk_url for continuity
UPDATE public.site_settings
SET
  android_apk_download_url = COALESCE(android_apk_download_url, android_apk_url),
  android_apk_direct_url = COALESCE(android_apk_direct_url, android_apk_url)
WHERE android_apk_url IS NOT NULL;