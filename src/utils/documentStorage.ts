import type { SupabaseClient } from '@supabase/supabase-js';
import type { BorrowerDocument } from '../types';

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const PROHIBITED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.msi', '.bin',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.rb',
  '.html', '.htm', '.svg', '.xml', '.vbs', '.ps1',
];

/**
 * Validates a single document file for allowed extensions, MIME types, and size.
 */
export function validateBorrowerDocumentFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'No file selected.' };
  }

  // 1. Check file size
  if (file.size <= 0) {
    return { isValid: false, error: `File "${file.name}" is empty (0 bytes).` };
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File "${file.name}" exceeds the maximum allowed size of 10 MB (${formatFileSize(file.size)}).`,
    };
  }

  // 2. Check file extension
  const fileName = file.name.toLowerCase();
  const lastDotIdx = fileName.lastIndexOf('.');
  if (lastDotIdx === -1) {
    return {
      isValid: false,
      error: `File "${file.name}" has no file extension. Only PDF, JPG, and PNG are allowed.`,
    };
  }

  const ext = fileName.substring(lastDotIdx);

  // Explicit prohibited check
  if (PROHIBITED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: `File type "${ext}" is not permitted for security reasons.`,
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
    return {
      isValid: false,
      error: `Invalid file format "${ext}". Allowed formats are PDF, JPG, JPEG, and PNG.`,
    };
  }

  // 3. Check MIME type if provided
  if (file.type) {
    const lowerType = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(lowerType as any)) {
      return {
        isValid: false,
        error: `Unsupported MIME type "${file.type}". Allowed types are PDF, JPG, and PNG.`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitizes a file name for safe storage path usage.
 */
export function sanitizeFileName(fileName: string): string {
  const lastDotIdx = fileName.lastIndexOf('.');
  const namePart = lastDotIdx !== -1 ? fileName.substring(0, lastDotIdx) : fileName;
  const extPart = lastDotIdx !== -1 ? fileName.substring(lastDotIdx).toLowerCase() : '';

  // Replace spaces and special characters with hyphens
  const cleanName = namePart
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 60);

  return `${cleanName || 'document'}${extPart}`;
}

/**
 * Formats byte size into human readable string (KB / MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i]}`;
}

/**
 * Uploads a document to Supabase Storage and records metadata in borrower_documents table.
 */
export async function uploadBorrowerDocument(params: {
  supabase: SupabaseClient;
  companyId: string;
  borrowerId: string;
  file: File;
  userId?: string | null;
}): Promise<{ success: boolean; document?: BorrowerDocument; error?: string }> {
  const { supabase, companyId, borrowerId, file, userId } = params;

  // 1. Validate file
  const validation = validateBorrowerDocumentFile(file);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  try {
    const docUuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const safeName = sanitizeFileName(file.name);
    const storagePath = `${companyId}/${borrowerId}/${docUuid}-${safeName}`;

    // 2. Upload file to private 'borrower-documents' bucket
    const { error: uploadError } = await supabase.storage
      .from('borrower-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: uploadError.message || 'Failed to upload document file.' };
    }

    // 3. Record metadata in borrower_documents table
    const { data: insertedData, error: dbError } = await (supabase as any)
      .from('borrower_documents')
      .insert({
        company_id: companyId,
        borrower_id: borrowerId,
        storage_path: storagePath,
        original_file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        uploaded_by_user_id: userId || null,
      })
      .select('*')
      .single();

    if (dbError) {
      console.error('Document metadata insert error:', dbError);
      // Attempt cleanup of uploaded storage object if metadata insert fails
      await supabase.storage.from('borrower-documents').remove([storagePath]);
      return { success: false, error: dbError.message || 'Failed to record document metadata.' };
    }

    const doc: BorrowerDocument = {
      id: insertedData.id,
      companyId: insertedData.company_id,
      borrowerId: insertedData.borrower_id,
      storagePath: insertedData.storage_path,
      originalFileName: insertedData.original_file_name,
      mimeType: insertedData.mime_type,
      fileSize: Number(insertedData.file_size),
      uploadedByUserId: insertedData.uploaded_by_user_id,
      createdAt: insertedData.created_at,
    };

    return { success: true, document: doc };
  } catch (err: any) {
    console.error('uploadBorrowerDocument exception:', err);
    return { success: false, error: err.message || 'Failed to upload document.' };
  }
}

/**
 * Fetches document metadata list for a borrower.
 */
export async function fetchBorrowerDocuments(params: {
  supabase: SupabaseClient;
  companyId: string;
  borrowerId: string;
}): Promise<{ success: boolean; documents: BorrowerDocument[]; error?: string }> {
  const { supabase, companyId, borrowerId } = params;

  try {
    const { data, error } = await (supabase as any)
      .from('borrower_documents')
      .select('*')
      .eq('company_id', companyId)
      .eq('borrower_id', borrowerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching borrower documents:', error);
      return { success: false, documents: [], error: error.message };
    }

    const docs: BorrowerDocument[] = (data || []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      borrowerId: row.borrower_id,
      storagePath: row.storage_path,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      fileSize: Number(row.file_size),
      uploadedByUserId: row.uploaded_by_user_id,
      createdAt: row.created_at,
    }));

    return { success: true, documents: docs };
  } catch (err: any) {
    console.error('fetchBorrowerDocuments exception:', err);
    return { success: false, documents: [], error: err.message };
  }
}

/**
 * Generates a short-lived signed URL (default 5 minutes) for secure viewing / downloading.
 */
export async function getBorrowerDocumentSignedUrl(params: {
  supabase: SupabaseClient;
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<{ success: boolean; signedUrl?: string; error?: string }> {
  const { supabase, storagePath, expiresInSeconds = 300 } = params;

  try {
    const { data, error } = await supabase.storage
      .from('borrower-documents')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Failed to generate secure link.' };
    }

    return { success: true, signedUrl: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate secure link.' };
  }
}
