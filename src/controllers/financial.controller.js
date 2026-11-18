const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { financialService } = require('../services');
const ApiError = require('../utils/ApiError');

const getUserId = (req) => {
  const { userId } = req.payload || {};
  if (!userId) {
    throw new ApiError(
      httpStatus.NOT_ACCEPTABLE,
      'Os dados enviados estão incompletos. Não foi possível identificar o usuário.'
    );
  }

  return userId;
};

// ───────── ciclos ─────────
const getCurrentCycle = catchAsync(async (req, res) => {
  const data = await financialService.getCurrentCycle(getUserId(req));
  res.status(httpStatus.OK).send(data);
});

const getClosedCycles = catchAsync(async (req, res) => {
  const data = await financialService.getClosedCycles(getUserId(req), req.query.limit);
  res.status(httpStatus.OK).send(data);
});

const getCycleSummary = catchAsync(async (req, res) => {
  const data = await financialService.getCycleSummary(getUserId(req), req.params.cycleId);
  res.status(httpStatus.OK).send(data);
});

const closeCycle = catchAsync(async (req, res) => {
  const data = await financialService.closeCycle(getUserId(req), req.params.cycleId);
  res.status(httpStatus.OK).send(data);
});

// ───────── gastos ─────────
const getExpenses = catchAsync(async (req, res) => {
  const data = await financialService.getExpenses(getUserId(req), req.query);
  res.status(httpStatus.OK).send(data);
});

const createExpense = catchAsync(async (req, res) => {
  const data = await financialService.createExpense(getUserId(req), req.body);
  res.status(httpStatus.CREATED).send(data);
});

const updateExpense = catchAsync(async (req, res) => {
  const data = await financialService.updateExpense(getUserId(req), req.params.expenseId, req.body);
  res.status(httpStatus.OK).send(data);
});

const deleteExpense = catchAsync(async (req, res) => {
  await financialService.deleteExpense(getUserId(req), req.params.expenseId);
  res.status(httpStatus.OK).send({ deleted: true });
});

// ───────── categorias ─────────
const getCategories = catchAsync(async (req, res) => {
  const data = await financialService.getCategories(getUserId(req));
  res.status(httpStatus.OK).send(data);
});

const createCategory = catchAsync(async (req, res) => {
  const data = await financialService.createCategory(getUserId(req), req.body);
  res.status(httpStatus.CREATED).send(data);
});

const updateCategory = catchAsync(async (req, res) => {
  const data = await financialService.updateCategory(getUserId(req), req.params.categoryId, req.body);
  res.status(httpStatus.OK).send(data);
});

// ───────── custos fixos ─────────
const getRecurring = catchAsync(async (req, res) => {
  const data = await financialService.getRecurring(getUserId(req));
  res.status(httpStatus.OK).send(data);
});

const createRecurring = catchAsync(async (req, res) => {
  const data = await financialService.createRecurring(getUserId(req), req.body);
  res.status(httpStatus.CREATED).send(data);
});

const updateRecurring = catchAsync(async (req, res) => {
  const data = await financialService.updateRecurring(getUserId(req), req.params.recurringId, req.body);
  res.status(httpStatus.OK).send(data);
});

// ───────── acertos ─────────
const markSettlementPaid = catchAsync(async (req, res) => {
  const data = await financialService.markSettlementPaid(getUserId(req), req.params.settlementId, req.body.paid);
  res.status(httpStatus.OK).send(data);
});

module.exports = {
  getCurrentCycle,
  getClosedCycles,
  getCycleSummary,
  closeCycle,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getCategories,
  createCategory,
  updateCategory,
  getRecurring,
  createRecurring,
  updateRecurring,
  markSettlementPaid,
};
