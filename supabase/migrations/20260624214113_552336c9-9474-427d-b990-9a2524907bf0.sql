CREATE POLICY "Authenticated can upload team logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'team-logos');

CREATE POLICY "Authenticated can update team logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'team-logos')
WITH CHECK (bucket_id = 'team-logos');

CREATE POLICY "Authenticated can delete team logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'team-logos');