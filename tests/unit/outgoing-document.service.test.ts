import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    MAX_OUTGOING_DOCUMENT_BYTES,
    documentMimeType,
    loadOutgoingDocument
} from '../../src/services/outgoing-document.service.ts';

const tempDirs: string[] = [];

async function createTempDir() {
    const dir = await mkdtemp(join(tmpdir(), 'whatsapp-pi-document-'));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('documentMimeType', () => {
    it('names the types worth naming', () => {
        expect(documentMimeType('bundle.zip')).toBe('application/zip');
        expect(documentMimeType('RELEASE.MD'.toLowerCase())).toBe('application/octet-stream');
        expect(documentMimeType('key.jks')).toBe('application/octet-stream');
    });

    it('falls back to octet-stream rather than refusing an unknown extension', () => {
        // Unlike images, a document is delivered as-is whatever it is, so an
        // unknown type must not be an error.
        expect(documentMimeType('notes.unknown')).toBe('application/octet-stream');
        expect(documentMimeType('no-extension')).toBe('application/octet-stream');
    });
});

describe('loadOutgoingDocument', () => {
    it('resolves a relative path against cwd and keeps the filename', async () => {
        const cwd = await createTempDir();
        const bytes = Buffer.from('PK\u0003\u0004 pretend zip');
        await writeFile(join(cwd, 'laiker.zip'), bytes);

        const result = await loadOutgoingDocument('laiker.zip', cwd);

        expect(result.absolutePath).toBe(join(cwd, 'laiker.zip'));
        expect(result.data).toEqual(bytes);
        expect(result.mimetype).toBe('application/zip');
        expect(result.fileName).toBe('laiker.zip');
    });

    it('accepts an absolute path anywhere', async () => {
        const dir = await createTempDir();
        const file = join(dir, 'report.pdf');
        await writeFile(file, 'pdf-ish');

        const result = await loadOutgoingDocument(file, '/somewhere/else');

        expect(result.absolutePath).toBe(file);
        expect(result.mimetype).toBe('application/pdf');
    });

    it('refuses an empty path, a missing file, a directory and an empty file', async () => {
        const cwd = await createTempDir();
        await writeFile(join(cwd, 'empty.zip'), '');

        await expect(loadOutgoingDocument('   ', cwd)).rejects.toThrow(/No file path/);
        await expect(loadOutgoingDocument('nope.zip', cwd)).rejects.toThrow(/File not found/);
        await expect(loadOutgoingDocument(cwd, cwd)).rejects.toThrow(/Not a file/);
        await expect(loadOutgoingDocument('empty.zip', cwd)).rejects.toThrow(/File is empty/);
    });

    it('refuses anything above the size cap, and says both numbers', async () => {
        const cwd = await createTempDir();
        const big = join(cwd, 'big.zip');
        await writeFile(big, Buffer.alloc(MAX_OUTGOING_DOCUMENT_BYTES + 1));

        await expect(loadOutgoingDocument('big.zip', cwd)).rejects.toThrow(/the limit is 64\.0 MB/);
    });
});
