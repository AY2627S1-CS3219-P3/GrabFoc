/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the mailer tests (#153), with nodemailer's transport stubbed.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
const sendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail, close: jest.fn() }) }));

import { config } from '../config';
import { Mailer, MailError } from './mailer';

const email = { subject: 'Subject', text: 'Text', html: '<p>Html</p>' };
const mailer = new Mailer();

beforeEach(() => sendMail.mockReset());

it('sends from the configured address and returns the message id', async () => {
  sendMail.mockResolvedValue({ messageId: '<abc@foc>' });
  await expect(mailer.send('e0000000@u.nus.edu', email)).resolves.toBe('<abc@foc>');
  expect(sendMail).toHaveBeenCalledWith({ from: config.smtp.from, to: 'e0000000@u.nus.edu', ...email });
});

it.each([
  [{ responseCode: 550, message: '550 e0000000@u.nus.edu: no such user' }, 'SMTP_550'],
  [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }, 'ECONNREFUSED'],
  [{ message: 'something' }, 'UNKNOWN'],
])('keeps only the error category, never the provider message', async (error, expected) => {
  sendMail.mockRejectedValue(Object.assign(new Error(error.message), error));
  const err = await mailer.send('e0000000@u.nus.edu', email).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(MailError);
  expect((err as MailError).category).toBe(expected);
  expect((err as MailError).message).not.toContain('@');
});
