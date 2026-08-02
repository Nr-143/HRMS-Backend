import {
  getActiveQuote,
  getAllQuotes,
  createQuote,
  updateQuote,
  setActiveQuote,
  deleteQuote,
} from './service.js';

export async function handleGetActiveQuote(req, res, next) {
  try {
    const quote = await getActiveQuote(req.tenantId);
    res.status(200).json({
      status: 'success',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAllQuotes(req, res, next) {
  try {
    const quotes = await getAllQuotes(req.tenantId);
    res.status(200).json({
      status: 'success',
      data: quotes,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateQuote(req, res, next) {
  try {
    const { text, author, isActive } = req.body;
    const quote = await createQuote(req.tenantId, { text, author, isActive });
    res.status(201).json({
      status: 'success',
      message: 'Daily quote created successfully',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { text, author, isActive } = req.body;
    const quote = await updateQuote(req.tenantId, id, { text, author, isActive });
    res.status(200).json({
      status: 'success',
      message: 'Daily quote updated successfully',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleSetActiveQuote(req, res, next) {
  try {
    const { id } = req.params;
    const quote = await setActiveQuote(req.tenantId, id);
    res.status(200).json({
      status: 'success',
      message: 'Quote set as active',
      data: quote,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteQuote(req, res, next) {
  try {
    const { id } = req.params;
    const result = await deleteQuote(req.tenantId, id);
    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}
