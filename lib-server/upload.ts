/**
 * Streams one uploaded file into R2, then proves it is what it must be.
 * The bytes go straight from the request to storage — never buffered in the
 * Function — which keeps a 15 MB video inside the Workers CPU budget.
 */
import { error } from './http';
import { contentType, hasSignature, type FileFormat } from './files';

export interface StoredFile {
  key: string;
  bytes: number;
}

export async function storeUpload(
  bucket: R2Bucket,
  request: Request,
  key: string,
  format: FileFormat,
  maxBytes: number,
): Promise<StoredFile | Response> {
  const length = Number(request.headers.get('Content-Length'));
  if (!request.headers.has('Content-Length') || !Number.isInteger(length)) {
    return error(411, 'length_required', 'Send the file with its size (Content-Length).');
  }
  if (length === 0 || !request.body) return error(400, 'bad_request', 'The file is empty.');
  if (length > maxBytes) {
    return error(413, 'payload_too_large', `That file is ${length} bytes; the limit is ${maxBytes}. Capture it again at a smaller size.`);
  }

  const stored = await bucket.put(key, request.body, { httpMetadata: { contentType: contentType(format) } });
  if (!stored || stored.size !== length) {
    await bucket.delete(key);
    return error(400, 'bad_request', 'The file arrived incomplete. Upload it again.');
  }

  // Judge the file by its first bytes, not by what the client called it.
  const head = await bucket.get(key, { range: { offset: 0, length: 16 } });
  const leading = head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array();
  if (!hasSignature(leading, format)) {
    await bucket.delete(key);
    return error(415, 'unsupported_media_type', `That file is not a ${format.toUpperCase()}. Nothing was saved.`);
  }
  return { key, bytes: stored.size };
}
