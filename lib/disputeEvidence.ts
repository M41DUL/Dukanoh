import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';

/**
 * Photo evidence for disputes and appeals (Terms 8.3, 13.1, 13.2).
 *
 * Files go to the PRIVATE `dispute-evidence` bucket under `<order_id>/…`;
 * storage and table policies let either party add photos while the order is
 * shipped/delivered/disputed/resolved, and read them at any time. Everything is
 * rendered through short-lived signed URLs.
 */
export const DISPUTE_EVIDENCE_BUCKET = 'dispute-evidence';
export const MAX_DISPUTE_PHOTOS = 5;
export const MAX_APPEAL_PHOTOS = 3;

export type EvidenceStage = 'dispute' | 'appeal';

export interface EvidenceItem {
  id: string;
  user_id: string | null;
  stage: EvidenceStage;
  created_at: string | null;
  /** Signed URL valid for about an hour, or null if signing failed. */
  url: string | null;
}

export async function pickEvidencePhotos(remaining: number): Promise<string[]> {
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
    selectionLimit: remaining,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map(a => a.uri);
}

interface UploadArgs {
  orderId: string;
  userId: string;
  uris: string[];
  stage: EvidenceStage;
}

/**
 * Compresses and uploads each photo, then records a row per file. Sequential on
 * purpose: these are a handful of images on a form, and a clear failure beats a
 * partial parallel batch. Throws on the first failure; earlier photos stay.
 */
export async function uploadDisputeEvidence({ orderId, userId, uris, stage }: UploadArgs): Promise<number> {
  let uploaded = 0;
  for (const uri of uris) {
    const compressed = await compressImage(uri);
    const path = `${orderId}/${stage}-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const response = await fetch(compressed);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .upload(path, arrayBuffer, { contentType: 'image/jpeg' });
    if (uploadError) throw new Error(uploadError.message);

    const { error: rowError } = await supabase.from('dispute_evidence').insert({
      order_id: orderId,
      user_id: userId,
      image_url: path,
      stage,
    });
    if (rowError) {
      // Don't leave an orphaned blob behind a failed row.
      await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).remove([path]);
      throw new Error(rowError.message);
    }
    uploaded += 1;
  }
  return uploaded;
}

export async function fetchDisputeEvidence(orderId: string): Promise<EvidenceItem[]> {
  const { data, error } = await supabase
    .from('dispute_evidence')
    .select('id, user_id, image_url, stage, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(DISPUTE_EVIDENCE_BUCKET)
    .createSignedUrls(rows.map(r => r.image_url), 3600);

  return rows.map((r, i) => ({
    id: r.id,
    user_id: r.user_id,
    stage: r.stage === 'appeal' ? 'appeal' : 'dispute',
    created_at: r.created_at,
    url: signed?.[i]?.signedUrl ?? null,
  }));
}
