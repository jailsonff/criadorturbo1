-- 1) Column(s) to store Android APK download info
ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS android_apk_url TEXT,
ADD COLUMN IF NOT EXISTS android_apk_version TEXT;

-- 2) Storage bucket for APK downloads
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-downloads', 'app-downloads', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Policies
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can read app downloads'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can read app downloads" ON storage.objects FOR SELECT USING (bucket_id = ''app-downloads'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins can upload app downloads'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can upload app downloads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''app-downloads'' AND public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins can update app downloads'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can update app downloads" ON storage.objects FOR UPDATE USING (bucket_id = ''app-downloads'' AND public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins can delete app downloads'
  ) THEN
    EXECUTE 'CREATE POLICY "Admins can delete app downloads" ON storage.objects FOR DELETE USING (bucket_id = ''app-downloads'' AND public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;
END
$do$;