import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

// Initialize real SMTP transport if configuration is present
if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // True for 465, false for other ports
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

/**
 * Send an email using SMTP or a formatted console log stub in development.
 * 
 * @param {{ to: string, subject: string, text: string, html?: string }} options - Email details
 * @returns {Promise<{ success: boolean, messageId?: string }>} Response summary
 */
export const sendMail = async ({ to, subject, text, html }) => {
  const from = `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('[Mailer Error] Failed to send email via SMTP:', error);
      // Fallback in case of SMTP connection issues during dev/testing
      logMockMail({ from, to, subject, text });
      return { success: false, error: error.message };
    }
  } else {
    logMockMail({ from, to, subject, text });
    return { success: true, isMock: true };
  }
};

/**
 * Log the email details with visually clean formatting for development
 */
function logMockMail({ from, to, subject, text }) {
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│                    [MAILER STUB]                       │');
  console.log('├────────────────────────────────────────────────────────┤');
  console.log(`│ From:    ${from.padEnd(46)}│`);
  console.log(`│ To:      ${to.padEnd(46)}│`);
  console.log(`│ Subject: ${subject.padEnd(46)}│`);
  console.log('├────────────────────────────────────────────────────────┤');
  console.log(`│ Body:                                                  │`);
  // Split lines to keep console formatted box intact
  const lines = text.split('\n');
  for (const line of lines) {
    console.log(`│   ${line.padEnd(52)} │`);
  }
  console.log('└────────────────────────────────────────────────────────┘');
}
