const express = require('express');
const validate = require('../../middlewares/validate');
const financialValidation = require('../../validations/financial.validation');
const financialController = require('../../controllers/financial.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

// ───────── ciclos ─────────
router.get('/cycles/current', auth('system'), financialController.getCurrentCycle);
router.get('/cycles', auth('system'), validate(financialValidation.getClosedCycles), financialController.getClosedCycles);
router.get(
  '/cycles/:cycleId/summary',
  auth('system'),
  validate(financialValidation.getCycleSummary),
  financialController.getCycleSummary
);
router.post(
  '/cycles/:cycleId/close',
  auth('system'),
  validate(financialValidation.closeCycle),
  financialController.closeCycle
);

// ───────── gastos ─────────
router.get('/expenses', auth('system'), validate(financialValidation.getExpenses), financialController.getExpenses);
router.post('/expenses', auth('system'), validate(financialValidation.createExpense), financialController.createExpense);
router.put(
  '/expenses/:expenseId',
  auth('system'),
  validate(financialValidation.updateExpense),
  financialController.updateExpense
);
router.delete(
  '/expenses/:expenseId',
  auth('system'),
  validate(financialValidation.deleteExpense),
  financialController.deleteExpense
);

// ───────── categorias ─────────
router.get('/categories', auth('system'), financialController.getCategories);
router.post('/categories', auth('system'), validate(financialValidation.createCategory), financialController.createCategory);
router.put(
  '/categories/:categoryId',
  auth('system'),
  validate(financialValidation.updateCategory),
  financialController.updateCategory
);

// ───────── custos fixos ─────────
router.get('/cashbox', auth('system'), financialController.getCashbox);

router.get('/recurring', auth('system'), financialController.getRecurring);
router.post(
  '/recurring',
  auth('system'),
  validate(financialValidation.createRecurring),
  financialController.createRecurring
);
router.put(
  '/recurring/:recurringId',
  auth('system'),
  validate(financialValidation.updateRecurring),
  financialController.updateRecurring
);

// ───────── acertos ─────────
router.patch(
  '/settlements/:settlementId/paid',
  auth('system'),
  validate(financialValidation.markSettlementPaid),
  financialController.markSettlementPaid
);

module.exports = router;
