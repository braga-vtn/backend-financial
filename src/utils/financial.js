const CYCLE_START_DAY = 15;
const BRAZIL_UTC_OFFSET_HOURS = -3;

// "YYYY-MM-DD" -> Date em UTC (compatível com colunas @db.Date)
const parseDateOnly = (value) => new Date(`${value}T00:00:00.000Z`);

// "hoje" no fuso de Brasília, como data sem horário (UTC 00:00)
const getTodayInBrazil = () => {
  const shifted = new Date(Date.now() + BRAZIL_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};

// Ciclo de 15 a 14. Date.UTC resolve virada de mês/ano (mês -1 vira dezembro do ano anterior).
const getCycleRange = (date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startMonth = date.getUTCDate() >= CYCLE_START_DAY ? month : month - 1;

  return {
    startDate: new Date(Date.UTC(year, startMonth, CYCLE_START_DAY)),
    endDate: new Date(Date.UTC(year, startMonth + 1, CYCLE_START_DAY - 1)),
  };
};

// Dia do custo fixo dentro do ciclo: dias 15-31 caem no mês de início, dias 1-14 no mês de fim.
// Dia inexistente no mês (ex.: 31 em fevereiro) vira o último dia do mês.
const getRecurringDate = (dayOfMonth, { startDate, endDate }) => {
  const base = dayOfMonth >= CYCLE_START_DAY ? startDate : endDate;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, lastDay)));
};

const formatDayMonth = (date) =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const sumExpenses = (expenses) =>
  expenses.reduce(
    (acc, expense) => ({
      totalCents: acc.totalCents + expense.amountCents,
      fixedCents: acc.fixedCents + (expense.category.type === 'FIXED' ? expense.amountCents : 0),
      variableCents: acc.variableCents + (expense.category.type === 'FIXED' ? 0 : expense.amountCents),
      expensesCount: acc.expensesCount,
    }),
    { totalCents: 0, fixedCents: 0, variableCents: 0, expensesCount: expenses.length }
  );

/**
 * Rateio igual entre os participantes, tudo em centavos.
 * Sobra de centavos: quem vem primeiro em ordem alfabética paga 1 centavo a mais,
 * assim a soma das partes é exatamente o total e a soma dos saldos é sempre zero.
 */
const calculateBalances = (professionals, expenses) => {
  const members = professionals.filter((professional) => !professional.isCashbox);
  const cashbox = professionals.find((professional) => professional.isCashbox);

  if (members.length === 0) return [];

  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));

  const paidByProfessional = new Map();
  let totalCents = 0;
  expenses.forEach((expense) => {
    totalCents += expense.amountCents;
    paidByProfessional.set(expense.paidById, (paidByProfessional.get(expense.paidById) || 0) + expense.amountCents);
  });

  const baseShare = Math.floor(totalCents / sorted.length);
  const remainder = totalCents - baseShare * sorted.length;

  const balances = sorted.map((professional, index) => {
    const paidCents = paidByProfessional.get(professional.id) || 0;
    const shareCents = baseShare + (index < remainder ? 1 : 0);

    return {
      professionalId: professional.id,
      name: professional.name,
      isCashbox: false,
      paidCents,
      shareCents,
      balanceCents: paidCents - shareCents,
    };
  });

  if (cashbox) {
    const paidCents = paidByProfessional.get(cashbox.id) || 0;
    balances.push({
      professionalId: cashbox.id,
      name: cashbox.name,
      isCashbox: true,
      paidCents,
      shareCents: 0,
      balanceCents: paidCents,
    });
  }

  return balances;
};

const buildTransfer = (from, to, amountCents) => ({
  fromId: from.id,
  fromName: from.name,
  fromIsCashbox: Boolean(from.isCashbox),
  toId: to.id,
  toName: to.name,
  toIsCashbox: Boolean(to.isCashbox),
  amountCents,
});

const suggestHubTransfers = (balances, cashbox) => {
  const hub = { id: cashbox.professionalId, name: cashbox.name, isCashbox: true };
  const toParty = (b) => ({ id: b.professionalId, name: b.name, isCashbox: false });

  const members = balances.filter((b) => !b.isCashbox);
  const debtors = members.filter((b) => b.balanceCents < 0).sort((a, b) => a.balanceCents - b.balanceCents);
  const creditors = members.filter((b) => b.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents);

  return [
    ...debtors.map((b) => buildTransfer(toParty(b), hub, -b.balanceCents)),
    ...creditors.map((b) => buildTransfer(hub, toParty(b), b.balanceCents)),
  ];
};

/**
 * Transferências diretas (sem caixa): primeiro pares de valor idêntico,
 * depois o maior devedor paga o maior credor. No máximo (participantes - 1) transferências.
 */
const suggestDirectTransfers = (balances) => {
  const debtors = balances
    .filter((b) => b.balanceCents < 0)
    .map((b) => ({ id: b.professionalId, name: b.name, amount: -b.balanceCents }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.balanceCents > 0)
    .map((b) => ({ id: b.professionalId, name: b.name, amount: b.balanceCents }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  const addTransfer = (from, to, amountCents) => transfers.push(buildTransfer(from, to, amountCents));

  for (let index = 0; index < debtors.length; index += 1) {
    const debtor = debtors[index];
    const match = creditors.find((creditor) => creditor.amount === debtor.amount);

    if (match) {
      addTransfer(debtor, match, debtor.amount);
      debtor.amount = 0;
      match.amount = 0;
    }
  }

  const pendingDebtors = debtors.filter((d) => d.amount > 0);
  const pendingCreditors = creditors.filter((c) => c.amount > 0);

  let i = 0;
  let j = 0;

  while (i < pendingDebtors.length && j < pendingCreditors.length) {
    const debtor = pendingDebtors[i];
    const creditor = pendingCreditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    addTransfer(debtor, creditor, amount);
    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) i += 1;
    if (creditor.amount === 0) j += 1;
  }

  return transfers;
};

// com lançamento do caixa no ciclo -> hub; sem -> transferência direta (comportamento anterior)
const suggestTransfers = (balances) => {
  const cashbox = balances.find((b) => b.isCashbox);
  return cashbox ? suggestHubTransfers(balances, cashbox) : suggestDirectTransfers(balances);
};

module.exports = {
  parseDateOnly,
  getTodayInBrazil,
  getCycleRange,
  getRecurringDate,
  formatDayMonth,
  sumExpenses,
  calculateBalances,
  suggestTransfers,
};
