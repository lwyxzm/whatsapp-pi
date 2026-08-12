import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { MessageSender } from '../../src/services/message.sender.ts';

describe('MessageSender', () => {
    const whatsappService = {
        getStatus: vi.fn(),
        getSocket: vi.fn(),
        isVerbose: vi.fn(),
        prepareGroupSession: vi.fn().mockResolvedValue(undefined)
    };

    beforeEach(() => {
        resetI18n();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        whatsappService.getStatus.mockReturnValue('connected');
        whatsappService.isVerbose.mockReturnValue(false);
    });

    it('sends branded text through the active socket', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'MSG123' } });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const sender = new MessageSender(whatsappService as any);

        await expect(sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello'
        })).resolves.toEqual({
            success: true,
            messageId: 'MSG123',
            attempts: 1
        });

        expect(sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', {
            text: 'hello π'
        });
    });

    it('sends an image with a branded caption through the active socket', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'IMG123' } });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const sender = new MessageSender(whatsappService as any);
        const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        await expect(sender.sendImage({
            recipientJid: '5511999998888@s.whatsapp.net',
            image,
            mimetype: 'image/png',
            caption: 'diagram'
        })).resolves.toEqual({
            success: true,
            messageId: 'IMG123',
            attempts: 1
        });

        expect(sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', {
            image,
            caption: 'diagram π',
            mimetype: 'image/png'
        });
    });

    it('uses the branding marker as the caption when an image has no caption', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'IMG124' } });
        whatsappService.getSocket.mockReturnValue({ sendMessage });
        const sender = new MessageSender(whatsappService as any);
        const image = Buffer.from([0xff, 0xd8, 0xff]);

        await sender.sendImage({
            recipientJid: '5511999998888@s.whatsapp.net',
            image,
            mimetype: 'image/jpeg'
        });

        expect(sendMessage).toHaveBeenCalledWith('5511999998888@s.whatsapp.net', {
            image,
            caption: 'π',
            mimetype: 'image/jpeg'
        });
    });

    it('returns failure when no socket is available and retries are exhausted', async () => {
        vi.useFakeTimers();
        whatsappService.getSocket.mockReturnValue(undefined);
        const sender = new MessageSender(whatsappService as any);

        const resultPromise = sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello',
            options: { maxRetries: 2 }
        });

        await vi.advanceTimersByTimeAsync(2000);
        await expect(resultPromise).resolves.toEqual({
            success: false,
            error: 'WhatsApp socket not initialized',
            attempts: 2
        });
        vi.useRealTimers();
    });

    it('logs retry delay when send fails', async () => {
        vi.useFakeTimers();
        whatsappService.getSocket.mockReturnValue(undefined);
        whatsappService.isVerbose.mockReturnValue(true);
        const sender = new MessageSender(whatsappService as any);

        const resultPromise = sender.send({
            recipientJid: '5511999998888@s.whatsapp.net',
            text: 'hello',
            options: { maxRetries: 2 }
        });

        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(console.log).toHaveBeenCalledWith('[MessageSender] Retrying in 2000ms...');
        vi.useRealTimers();
    });
});
