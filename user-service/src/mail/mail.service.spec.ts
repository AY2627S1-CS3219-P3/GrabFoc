/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated unit tests for the OTP email, its retry and its failure mode.
 * Author review: Read in full; `npm test` passes (73 tests), and an OTP email was delivered to Mailpit from the running stack.
 */
import type { Transporter } from 'nodemailer';
import { OtpPurpose } from '../crypto';
import { SmtpMailService } from './mail.service';

/** A stand-in for nodemailer, so no SMTP server is needed. */
function fakeTransport(sendMail: jest.Mock): Transporter {
  return { sendMail } as unknown as Transporter;
}

describe('SmtpMailService.sendOtp', () => {
  it('sends the code to the given address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    await new SmtpMailService(fakeTransport(sendMail)).sendOtp(
      'alex@u.nus.edu',
      '123456',
      OtpPurpose.REGISTRATION,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('alex@u.nus.edu');
    expect(message.text).toContain('123456');
    expect(message.subject).toBe('Verify your FoC account');
  });

  it('uses a different subject per purpose', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const mail = new SmtpMailService(fakeTransport(sendMail));
    for (const purpose of Object.values(OtpPurpose)) {
      await mail.sendOtp('alex@u.nus.edu', '123456', purpose);
    }
    const subjects = sendMail.mock.calls.map((c) => c[0].subject);
    expect(new Set(subjects).size).toBe(Object.values(OtpPurpose).length);
  });

  it('tells the reader the code expires, so an old email is not retried', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    await new SmtpMailService(fakeTransport(sendMail)).sendOtp('a@u.nus.edu', '123456', OtpPurpose.PASSWORD_RESET);
    expect(sendMail.mock.calls[0][0].text).toMatch(/5 minutes/);
  });

  it('retries once before giving up', async () => {
    const sendMail = jest.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue({});
    await new SmtpMailService(fakeTransport(sendMail)).sendOtp('a@u.nus.edu', '123456', OtpPurpose.REGISTRATION);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('raises 503 after the retry also fails (AGENTS.md "Errors")', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
    await expect(
      new SmtpMailService(fakeTransport(sendMail)).sendOtp('a@u.nus.edu', '123456', OtpPurpose.REGISTRATION),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('never puts the address or the code in a log line', async () => {
    const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
    await new SmtpMailService(fakeTransport(sendMail))
      .sendOtp('alex@u.nus.edu', '123456', OtpPurpose.REGISTRATION)
      .catch(() => undefined);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('alex@u.nus.edu');
    expect(logged).not.toContain('123456');
    warn.mockRestore();
  });
});
