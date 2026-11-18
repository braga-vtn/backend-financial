const Joi = require('joi');

const MAX_AMOUNT_CENTS = 1000000000;

// "YYYY-MM-DD" e data real do calendário (rejeita 2026-02-31)
const dateOnly = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'string.pattern.base': 'Informe a data no formato AAAA-MM-DD.',
    'any.invalid': 'Data inválida.',
  });

const amountCents = Joi.number().integer().min(1).max(MAX_AMOUNT_CENTS);
const costType = Joi.string().valid('FIXED', 'VARIABLE');

// ───────── ciclos ─────────
const getClosedCycles = {
  query: Joi.object().keys({
    status: Joi.string().valid('closed'),
    limit: Joi.number().integer().min(1).max(60).default(24),
  }),
};

const getCycleSummary = {
  params: Joi.object().keys({
    cycleId: Joi.string().required(),
  }),
};

const closeCycle = {
  params: Joi.object().keys({
    cycleId: Joi.string().required(),
  }),
};

// ───────── gastos ─────────
const expenseBody = Joi.object().keys({
  description: Joi.string().trim().min(2).max(120).required(),
  amountCents: amountCents.required(),
  date: dateOnly.required(),
  paidById: Joi.string().required(),
  categoryId: Joi.string().required(),
  // aceito e ignorado: o ciclo é sempre definido pela data do gasto
  cycleId: Joi.string().allow('', null),
});

const getExpenses = {
  query: Joi.object().keys({
    cycleId: Joi.string().required(),
    paidById: Joi.string(),
    categoryId: Joi.string(),
  }),
};

const createExpense = {
  body: expenseBody,
};

const updateExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().required(),
  }),
  body: expenseBody,
};

const deleteExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().required(),
  }),
};

// ───────── categorias ─────────
const createCategory = {
  body: Joi.object().keys({
    name: Joi.string().trim().min(2).max(40).required(),
    type: costType.required(),
  }),
};

const updateCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().min(2).max(40),
      type: costType,
      active: Joi.boolean(),
    })
    .min(1),
};

// ───────── custos fixos ─────────
const createRecurring = {
  body: Joi.object().keys({
    description: Joi.string().trim().min(2).max(120).required(),
    amountCents: amountCents.required(),
    dayOfMonth: Joi.number().integer().min(1).max(31).required(),
    categoryId: Joi.string().required(),
    defaultPaidById: Joi.string().allow(null, ''),
  }),
};

const updateRecurring = {
  params: Joi.object().keys({
    recurringId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      description: Joi.string().trim().min(2).max(120),
      amountCents,
      dayOfMonth: Joi.number().integer().min(1).max(31),
      categoryId: Joi.string(),
      defaultPaidById: Joi.string().allow(null, ''),
      active: Joi.boolean(),
    })
    .min(1),
};

// ───────── acertos ─────────
const markSettlementPaid = {
  params: Joi.object().keys({
    settlementId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    paid: Joi.boolean().required(),
  }),
};

module.exports = {
  getClosedCycles,
  getCycleSummary,
  closeCycle,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  createCategory,
  updateCategory,
  createRecurring,
  updateRecurring,
  markSettlementPaid,
};
