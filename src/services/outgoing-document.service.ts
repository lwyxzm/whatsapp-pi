import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve } from 'node:path';

/**
 * WhatsApp itself accepts larger documents; the cap is here so a mistaken path
 * (`~/Downloads` instead of one file) fails fast instead of pushing hundreds of
 * megabytes through the bridge's socket.
 */
export const MAX_OUTGOING_DOCUMENT_BYTES = 64 * 1024 * 1024;

export interface OutgoingDocument {
    absolutePath: string;
    data: Buffer;
    mimetype: string;
    fileName: string;
}

/**
 * MIME types worth naming. Unlike images — where the four formats are the whole
 * point — a document is sent as-is whatever it is, so an unknown extension is
 * not a refusal: it goes as `application/octet-stream` and WhatsApp still
 * delivers it with its filename.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
    '.zip': 'application/zip',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.log': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.apk': 'application/vnd.android.package-archive',
    '.aab': 'application/octet-stream',
    '.ipa': 'application/octet-stream',
    '.jks': 'application/octet-stream',
    '.keystore': 'application/octet-stream',
    '.pem': 'application/x-pem-file',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4'
};

function formatMegabytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentMimeType(fileName: string): string {
    const extension = extname(fileName).toLowerCase();
    return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/**
 * Reads a file for sending as a document. The path may be relative, in which
 * case it resolves against `cwd` — the same rule the image tool uses, so a
 * relative path in a tool call means what it looks like.
 */
export async function loadOutgoingDocument(filePath: string, cwd: string): Promise<OutgoingDocument> {
    const trimmed = filePath.trim();
    if (!trimmed) {
        throw new Error('No file path given');
    }

    const absolutePath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);

    let info;
    try {
        info = await stat(absolutePath);
    } catch {
        throw new Error(`File not found: ${absolutePath}`);
    }
    if (!info.isFile()) {
        throw new Error(`Not a file: ${absolutePath}`);
    }
    if (info.size === 0) {
        throw new Error(`File is empty: ${absolutePath}`);
    }
    if (info.size > MAX_OUTGOING_DOCUMENT_BYTES) {
        throw new Error(
            `File is ${formatMegabytes(info.size)}; the limit is ${formatMegabytes(MAX_OUTGOING_DOCUMENT_BYTES)}`
        );
    }

    const data = await readFile(absolutePath);
    return {
        absolutePath,
        data,
        mimetype: documentMimeType(absolutePath),
        fileName: basename(absolutePath)
    };
}
