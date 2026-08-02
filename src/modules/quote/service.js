import prisma from '../../config/prisma.js';
import { NotFoundError } from '../../utils/error.utils.js';

const DEFAULT_QUOTES = [
  {
    id: 'default-1',
    text: "Great things in business are never done by one person. They're done by a team of people.",
    author: 'Steve Jobs',
    isActive: true,
  },
  {
    id: 'default-2',
    text: 'Clients do not come first. Employees come first. If you take care of your employees, they will take care of the clients.',
    author: 'Richard Branson',
    isActive: false,
  },
];

function getQuoteModel() {
  if (prisma.dailyQuote) return prisma.dailyQuote;
  if (prisma.daily_quotes) return prisma.daily_quotes;
  return null;
}

export async function getActiveQuote(tenantId) {
  const model = getQuoteModel();
  if (!model) return DEFAULT_QUOTES[0];

  try {
    const active = await model.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (active) return active;

    const latest = await model.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) return latest;
  } catch (err) {
    console.error('[Quotes Error]: findFirst failed', err.message);
  }

  return DEFAULT_QUOTES[0];
}

export async function getAllQuotes(tenantId) {
  const model = getQuoteModel();
  if (!model) return DEFAULT_QUOTES;

  try {
    const quotes = await model.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (quotes && quotes.length > 0) {
      return quotes;
    }
  } catch (err) {
    console.error('[Quotes Error]: findMany failed', err.message);
  }

  return DEFAULT_QUOTES;
}

export async function createQuote(tenantId, { text, author, isActive = true }) {
  const model = getQuoteModel();
  if (!model) {
    throw new Error('DailyQuote model unavailable. Please run npx prisma generate & restart backend.');
  }

  if (isActive) {
    try {
      await model.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      });
    } catch (e) {
      console.warn('[Quotes Warning]: updateMany active clear failed', e.message);
    }
  }

  return model.create({
    data: {
      text: text.trim(),
      author: author?.trim() || 'Anonymous',
      isActive: Boolean(isActive),
      tenantId,
    },
  });
}

export async function updateQuote(tenantId, quoteId, { text, author, isActive }) {
  const model = getQuoteModel();
  if (!model) {
    throw new Error('DailyQuote model unavailable');
  }

  const existing = await model.findFirst({
    where: { id: quoteId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Quote not found');
  }

  if (isActive === true) {
    await model.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });
  }

  return model.update({
    where: { id: quoteId },
    data: {
      ...(text && { text: text.trim() }),
      ...(author !== undefined && { author: author.trim() || 'Anonymous' }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
  });
}

export async function setActiveQuote(tenantId, quoteId) {
  const model = getQuoteModel();
  if (!model) {
    throw new Error('DailyQuote model unavailable');
  }

  const existing = await model.findFirst({
    where: { id: quoteId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Quote not found');
  }

  await model.updateMany({
    where: { tenantId, isActive: true },
    data: { isActive: false },
  });

  return model.update({
    where: { id: quoteId },
    data: { isActive: true },
  });
}

export async function deleteQuote(tenantId, quoteId) {
  const model = getQuoteModel();
  if (!model) {
    throw new Error('DailyQuote model unavailable');
  }

  const existing = await model.findFirst({
    where: { id: quoteId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Quote not found');
  }

  await model.delete({
    where: { id: quoteId },
  });

  // If deleted quote was active, set latest remaining as active
  if (existing.isActive) {
    const latest = await model.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      await model.update({
        where: { id: latest.id },
        data: { isActive: true },
      });
    }
  }

  return { success: true, message: 'Quote deleted' };
}
