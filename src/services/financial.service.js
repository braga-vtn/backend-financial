const httpStatus = require('http-status');
const { PrismaClient } = require('@prisma/client');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const {
  getCycleRange,
  getRecurringDate,
  getTodayInBrazil,
  calculateBalances,
  suggestTransfers,
  sumExpenses,
  formatDayMonth,
  parseDateOnly,
} = require('../utils/financial');

const prisma = new PrismaClient();

const CASHBOX_NAME = 'Caixa';

// ───────────── includes/selects reutilizados ─────────────

const expenseInclude = {
  paidBy: { select: { id: true, name: true, isCashbox: true } },
  category: { select: { id: true, name: true, type: true } },
};
const expenseTotalsSelect = {
  cycleId: true,
  amountCents: true,
  paidById: true,
  category: { select: { type: true } },
};
const closedCycleInclude = {
  participants: { include: { professional: { select: { name: true, isCashbox: true } } } },
  settlements: {
    orderBy: { amountCents: 'desc' },
    include: {
      from: { select: { name: true, isCashbox: true } },
      to: { select: { name: true, isCashbox: true } },
    },
  },
};
const recurringInclude = {
  category: { select: { id: true, name: true, type: true } },
  defaultPaidBy: { select: { id: true, name: true } },
};
const categorySelect = { id: true, name: true, type: true, active: true };
const cashboxSelect = { id: true, name: true, isCashbox: true };

// ───────────── helpers internos (lançam ApiError; sempre chamados dentro de um try/catch) ─────────────

const pickCycle = (cycle) => ({
  id: cycle.id,
  startDate: cycle.startDate,
  endDate: cycle.endDate,
  status: cycle.status,
  closedAt: cycle.closedAt,
});

const NO_PAYER_VALUES = ['', 'none'];

const normalizePayerId = (value) => (NO_PAYER_VALUES.includes(value) ? null : value);

// get-or-create: o @@unique([userId, startDate]) evita ciclo duplicado em requisições simultâneas
const getOrCreateCycle = (userId, { startDate, endDate }) =>
  prisma.cycle.upsert({
    where: { userId_startDate: { userId, startDate } },
    update: {},
    create: { userId, startDate, endDate },
  });

const getOrCreateCycleByDate = (userId, date) => getOrCreateCycle(userId, getCycleRange(date));

const assertCycleOpen = (cycle) => {
  if (cycle.status === 'CLOSED') {
    throw new ApiError(
      httpStatus.CONFLICT,
      'O ciclo desse período já foi fechado. Não é possível alterar os lançamentos dele.'
    );
  }
};

// get-or-create. O índice único parcial garante um caixa por usuário mesmo com requisições simultâneas.
// Chame FORA de $transaction (um erro de unique dentro de tx aborta a transação inteira no Postgres).
const getOrCreateCashbox = async (userId) => {
  const find = () => prisma.professional.findFirst({ where: { userId, isCashbox: true }, select: cashboxSelect });

  const existing = await find();
  if (existing) return existing;

  try {
    return await prisma.professional.create({
      data: { userId, name: CASHBOX_NAME, isCashbox: true },
      select: cashboxSelect,
    });
  } catch (error) {
    if (error.code === 'P2002') return find(); // outra requisição criou primeiro
    throw error;
  }
};

const assertProfessional = async (userId, professionalId) => {
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, userId },
    select: { active: true, isCashbox: true },
  });

  if (!professional) throw new ApiError(httpStatus.NOT_FOUND, 'Profissional não encontrado.');
  if (!professional.active) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'Esse profissional está inativo e não pode receber novos lançamentos.');
  }
  return professional;
};

// pagador padrão do custo fixo: vazio ou o próprio caixa viram null ("Caixa")
const resolveDefaultPayer = async (userId, value) => {
  const id = normalizePayerId(value) || null;
  if (!id) return null;

  const professional = await assertProfessional(userId, id);
  return professional.isCashbox ? null : id;
};

const assertCategory = async (userId, categoryId) => {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { active: true } });
  if (!category) throw new ApiError(httpStatus.NOT_FOUND, 'Categoria não encontrada.');
  if (!category.active) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'Essa categoria está arquivada. Escolha outra ou reative-a.');
  }
};

const assertCategoryNameAvailable = async (userId, name, ignoreId) => {
  const duplicated = await prisma.category.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' }, ...(ignoreId && { NOT: { id: ignoreId } }) },
    select: { id: true },
  });
  if (duplicated) throw new ApiError(httpStatus.CONFLICT, 'Já existe uma categoria com esse nome.');
};

// Cria os lançamentos dos custos fixos ativos que ainda não existem no ciclo.
// Sem pagador padrão ativo, o lançamento sai no caixa.
const generateRecurringExpenses = async (userId, cycle) => {
  const recurring = await prisma.recurringExpense.findMany({
    where: { userId, active: true },
    include: { defaultPaidBy: { select: { active: true } } },
  });

  if (recurring.length === 0) return;

  const hasPayer = (item) => Boolean(item.defaultPaidById && item.defaultPaidBy?.active);
  const cashboxId = recurring.every(hasPayer) ? null : (await getOrCreateCashbox(userId)).id;

  await prisma.expense.createMany({
    data: recurring.map((item) => ({
      description: item.description,
      amountCents: item.amountCents,
      date: getRecurringDate(item.dayOfMonth, cycle),
      userId,
      cycleId: cycle.id,
      paidById: hasPayer(item) ? item.defaultPaidById : cashboxId,
      categoryId: item.categoryId,
      recurringId: item.id,
    })),
    skipDuplicates: true, // @@unique([recurringId, cycleId])
  });
};

const syncCurrentCycle = async (userId) => {
  const cycle = await getOrCreateCycleByDate(userId, getTodayInBrazil());
  if (cycle.status === 'OPEN') await generateRecurringExpenses(userId, cycle);
  return cycle;
};

// participantes do rateio em um ciclo aberto: profissionais ativos + quem pagou algo no ciclo.
// O caixa só entra se pagou algo no ciclo, e nunca como "ativo".
const computeLiveBalances = async (client, userId, expenses) => {
  const payerIds = [...new Set(expenses.map((expense) => expense.paidById))];
  const professionals = await client.professional.findMany({
    where: {
      userId,
      OR: [{ active: true, isCashbox: false }, { id: { in: payerIds } }],
    },
    select: { id: true, name: true, isCashbox: true },
  });
  return calculateBalances(professionals, expenses);
};

const buildOpenSummary = async (cycle, expenses, userId) => {
  const balances = await computeLiveBalances(prisma, userId, expenses);
  const transfers = suggestTransfers(balances).map((transfer) => ({ id: null, paidAt: null, ...transfer }));

  return { cycle: pickCycle(cycle), ...sumExpenses(expenses), balances, transfers };
};

// ciclo fechado: lê a "foto" congelada (CycleParticipant e Settlement), sem recalcular
const buildClosedSummary = (cycle, expenses) => ({
  cycle: pickCycle(cycle),
  ...sumExpenses(expenses),
  balances: cycle.participants
    .map((participant) => ({
      professionalId: participant.professionalId,
      name: participant.professional.name,
      isCashbox: participant.professional.isCashbox,
      paidCents: participant.paidCents,
      shareCents: participant.shareCents,
      balanceCents: participant.balanceCents,
    }))
    .sort((a, b) => Number(a.isCashbox) - Number(b.isCashbox) || a.name.localeCompare(b.name, 'pt-BR')),
  transfers: cycle.settlements.map((settlement) => ({
    id: settlement.id,
    fromId: settlement.fromId,
    fromName: settlement.from.name,
    fromIsCashbox: settlement.from.isCashbox,
    toId: settlement.toId,
    toName: settlement.to.name,
    toIsCashbox: settlement.to.isCashbox,
    amountCents: settlement.amountCents,
    paidAt: settlement.paidAt,
  })),
});

// ───────────── ciclos ─────────────

const getCurrentCycle = async (userId) => {
  try {
    const cycle = await syncCurrentCycle(userId);
    return pickCycle(cycle);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar o ciclo atual.');
  }
};

const getCycleSummary = async (userId, cycleId) => {
  try {
    const cycle = await prisma.cycle.findFirst({ where: { id: cycleId, userId }, include: closedCycleInclude });
    if (!cycle) throw new ApiError(httpStatus.NOT_FOUND, 'Ciclo não encontrado.');

    const expenses = await prisma.expense.findMany({ where: { cycleId, userId }, select: expenseTotalsSelect });

    return cycle.status === 'OPEN' ? await buildOpenSummary(cycle, expenses, userId) : buildClosedSummary(cycle, expenses);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar o resumo do ciclo.');
  }
};

const getClosedCycles = async (userId, limit = 24) => {
  try {
    const cycles = await prisma.cycle.findMany({
      where: { userId, status: 'CLOSED' },
      orderBy: { startDate: 'desc' },
      take: Number(limit),
      include: closedCycleInclude,
    });
    if (cycles.length === 0) return [];

    const expenses = await prisma.expense.findMany({
      where: { userId, cycleId: { in: cycles.map((cycle) => cycle.id) } },
      select: expenseTotalsSelect,
    });

    return cycles.map((cycle) =>
      buildClosedSummary(
        cycle,
        expenses.filter((expense) => expense.cycleId === cycle.id)
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar o histórico de ciclos.');
  }
};

const closeCycle = async (userId, cycleId) => {
  try {
    const cycle = await prisma.cycle.findFirst({ where: { id: cycleId, userId } });
    if (!cycle) throw new ApiError(httpStatus.NOT_FOUND, 'Ciclo não encontrado.');
    if (cycle.status === 'CLOSED') throw new ApiError(httpStatus.CONFLICT, 'Este ciclo já está fechado.');

    // para permitir fechamento antecipado, remova esta checagem
    if (getTodayInBrazil() < cycle.endDate) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `O ciclo só pode ser fechado a partir do dia ${formatDayMonth(cycle.endDate)}.`
      );
    }

    await prisma.$transaction(
      async (tx) => {
        // trava o ciclo: se outra requisição fechou primeiro, count = 0
        const locked = await tx.cycle.updateMany({
          where: { id: cycleId, userId, status: 'OPEN' },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        if (locked.count === 0) throw new ApiError(httpStatus.CONFLICT, 'Este ciclo já está fechado.');

        const expenses = await tx.expense.findMany({ where: { cycleId, userId }, select: expenseTotalsSelect });
        if (expenses.length === 0) {
          throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'Não há gastos neste ciclo para fechar.');
        }

        const balances = await computeLiveBalances(tx, userId, expenses);
        const transfers = suggestTransfers(balances);

        await tx.cycleParticipant.createMany({
          data: balances.map((balance) => ({
            cycleId,
            professionalId: balance.professionalId,
            paidCents: balance.paidCents,
            shareCents: balance.shareCents,
            balanceCents: balance.balanceCents,
          })),
        });

        if (transfers.length > 0) {
          await tx.settlement.createMany({
            data: transfers.map((transfer) => ({
              cycleId,
              fromId: transfer.fromId,
              toId: transfer.toId,
              amountCents: transfer.amountCents,
            })),
          });
        }
      },
      { timeout: 15000 }
    );

    return await getCycleSummary(userId, cycleId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível fechar o ciclo.');
  }
};

// ───────────── caixa ─────────────

const getCashbox = async (userId) => {
  try {
    return await getOrCreateCashbox(userId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar o caixa.');
  }
};

// ───────────── gastos ─────────────

const getExpenses = async (userId, { cycleId, paidById, categoryId }) => {
  try {
    return await prisma.expense.findMany({
      where: {
        userId,
        cycleId,
        ...(paidById && { paidById }),
        ...(categoryId && { categoryId }),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: expenseInclude,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar os gastos.');
  }
};

const createExpense = async (userId, body) => {
  try {
    const date = parseDateOnly(body.date);
    const cycle = await getOrCreateCycleByDate(userId, date);
    assertCycleOpen(cycle);

    await assertProfessional(userId, body.paidById);
    await assertCategory(userId, body.categoryId);

    return await prisma.expense.create({
      data: {
        description: body.description,
        amountCents: body.amountCents,
        date,
        userId,
        cycleId: cycle.id,
        paidById: body.paidById,
        categoryId: body.categoryId,
      },
      include: expenseInclude,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível registrar o gasto.');
  }
};

const updateExpense = async (userId, expenseId, body) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: expenseId, userId }, include: { cycle: true } });
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Lançamento não encontrado.');
    if (existing.cycle.status === 'CLOSED') {
      throw new ApiError(httpStatus.CONFLICT, 'Este lançamento pertence a um ciclo fechado e não pode ser alterado.');
    }

    const date = parseDateOnly(body.date);
    const cycle = await getOrCreateCycleByDate(userId, date);
    assertCycleOpen(cycle);

    // só revalida quem pagou/categoria se mudaram (lançamentos antigos podem ter inativos)
    if (body.paidById !== existing.paidById) await assertProfessional(userId, body.paidById);
    if (body.categoryId !== existing.categoryId) await assertCategory(userId, body.categoryId);

    return await prisma.expense.update({
      where: { id: expenseId },
      data: {
        description: body.description,
        amountCents: body.amountCents,
        date,
        cycleId: cycle.id,
        paidById: body.paidById,
        categoryId: body.categoryId,
      },
      include: expenseInclude,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível atualizar o gasto.');
  }
};

const deleteExpense = async (userId, expenseId) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: expenseId, userId }, include: { cycle: true } });
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Lançamento não encontrado.');
    assertCycleOpen(existing.cycle);

    await prisma.expense.delete({ where: { id: expenseId } });
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível excluir o gasto.');
  }
};

// ───────────── categorias ─────────────

const getCategories = async (userId) => {
  try {
    return await prisma.category.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: categorySelect,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar as categorias.');
  }
};

const createCategory = async (userId, { name, type }) => {
  try {
    await assertCategoryNameAvailable(userId, name);
    return await prisma.category.create({ data: { userId, name, type }, select: categorySelect });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível criar a categoria.');
  }
};

const updateCategory = async (userId, categoryId, body) => {
  try {
    const existing = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Categoria não encontrada.');

    if (body.name) await assertCategoryNameAvailable(userId, body.name, categoryId);

    return await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.active !== undefined && { active: body.active }),
      },
      select: categorySelect,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível atualizar a categoria.');
  }
};

// ───────────── custos fixos ─────────────

const getRecurring = async (userId) => {
  try {
    return await prisma.recurringExpense.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { description: 'asc' }],
      include: recurringInclude,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível carregar os custos fixos.');
  }
};

const createRecurring = async (userId, body) => {
  try {
    await assertCategory(userId, body.categoryId);
    const defaultPaidById = await resolveDefaultPayer(userId, body.defaultPaidById);

    const recurring = await prisma.recurringExpense.create({
      data: {
        userId,
        description: body.description,
        amountCents: body.amountCents,
        dayOfMonth: body.dayOfMonth,
        categoryId: body.categoryId,
        defaultPaidById,
      },
      include: recurringInclude,
    });

    await syncCurrentCycle(userId); // já aparece no ciclo atual
    return recurring;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível criar o custo fixo.');
  }
};

const updateRecurring = async (userId, recurringId, body) => {
  try {
    const existing = await prisma.recurringExpense.findFirst({ where: { id: recurringId, userId } });
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Custo fixo não encontrado.');

    let defaultPaidById; // undefined = não alterar
    if (body.defaultPaidById !== undefined) {
      const requested = normalizePayerId(body.defaultPaidById) || null;
      defaultPaidById =
        requested && requested === existing.defaultPaidById ? requested : await resolveDefaultPayer(userId, requested);
    }

    if (body.categoryId && body.categoryId !== existing.categoryId) await assertCategory(userId, body.categoryId);

    const recurring = await prisma.recurringExpense.update({
      where: { id: recurringId },
      data: {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.amountCents !== undefined && { amountCents: body.amountCents }),
        ...(body.dayOfMonth !== undefined && { dayOfMonth: body.dayOfMonth }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        ...(defaultPaidById !== undefined && { defaultPaidById }),
        ...(body.active !== undefined && { active: body.active }),
      },
      include: recurringInclude,
    });

    // lançamentos já gerados não mudam; só entra no ciclo atual se ainda não existir
    await syncCurrentCycle(userId);
    return recurring;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível atualizar o custo fixo.');
  }
};

// ───────────── acertos ─────────────

const markSettlementPaid = async (userId, settlementId, paid) => {
  try {
    const settlement = await prisma.settlement.findFirst({
      where: { id: settlementId, cycle: { userId } },
      select: { id: true },
    });
    if (!settlement) throw new ApiError(httpStatus.NOT_FOUND, 'Acerto não encontrado.');

    return await prisma.settlement.update({
      where: { id: settlementId },
      data: { paidAt: paid ? new Date() : null },
      select: { id: true, paidAt: true },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Não foi possível atualizar o acerto.');
  }
};

module.exports = {
  getCurrentCycle,
  getCycleSummary,
  getClosedCycles,
  closeCycle,
  getCashbox,
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
