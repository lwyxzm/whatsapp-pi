import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOutgoingImage } from '../../src/services/outgoing-image.service.ts';

const tempDirs: string[] = [];

async function createTempDir() {
    const dir = await mkdtemp(join(tmpdir(), 'whatsapp-pi-image-'));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('loadOutgoingImage', () => {
    it('loads a relative PNG path and detects its MIME type from file content', async () => {
        const cwd = await createTempDir();
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
        await writeFile(join(cwd, 'image.bin'), png);

        const result = await loadOutgoingImage('@image.bin', cwd);

        expect(result.absolutePath).toBe(join(cwd, 'image.bin'));
        expect(result.data).toEqual(png);
        expect(result.mimetype).toBe('image/png');
    });

    it('rejects a file whose contents are not a supported image', async () => {
        const cwd = await createTempDir();
        await writeFile(join(cwd, 'not-image.jpg'), 'not actually an image');

        await expect(loadOutgoingImage('not-image.jpg', cwd)).rejects.toThrow(
            'Unsupported image format'
        );
    });

    it('rejects directories', async () => {
        const cwd = await createTempDir();

        await expect(loadOutgoingImage('.', cwd)).rejects.toThrow('Image path is not a file');
    });
});
