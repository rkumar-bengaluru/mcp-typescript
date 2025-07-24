// src/sendEmail.ts
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

          // loads the .env file into process.env

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Sends an e-mail via Google SMTP using OAuth2 application password
 * @param opts  {to, subject, text?, html?}
 */
export async function sendEmail(opts: EmailOptions): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;

  console.log('GMAIL_USER:', user);
  console.log('GMAIL_APP_PASS:', pass ? '***' : 'not set');

  if (!user || !pass) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASS in environment');
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,                // 465 = SSL, 587 = STARTTLS
    secure: true,             // true for 465, false for 587
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"My App" <${user}>`,
    to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/* ------------------------------------------------------------------ */
/* Example usage (run with `npx tsx src/sendEmail.ts` in dev)         */
/* ------------------------------------------------------------------ */
// if (require.main === module) {
//   sendEmail({
//     to: 'someone@example.com',
//     subject: 'Hello from TypeScript',
//     text: 'Plain-text body',
//     html: '<h1>HTML body</h1>',
//   })
//     .then(() => console.log('Email sent'))
//     .catch(console.error);
// }