const httpStatus = require('http-status');
const { PrismaClient } = require('@prisma/client');
const ApiError = require('../utils/ApiError');

const prisma = new PrismaClient();

/**
 * Busca o profissional garantindo que pertence ao usuário.
 * Lança 404 se não existir ou for de outro usuário.
 */
const findOwnedProfessional = async (id, userId) => {
  const professional = await prisma.professional.findFirst({ where: { id, userId } });
  if (!professional) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Professional not found');
  }
  return professional;
};

const getProfessionals = async ({ status = 'all', q = '' }, userId) => {
  try {
    const where = { userId };

    if (status === 'active') where.active = true;
    if (status === 'inactive') where.active = false;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { role: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    return await prisma.professional.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to list the professionals');
  }
};

const createProfessional = async ({ name, role, phone, pixKey }, userId) => {
  try {
    return await prisma.professional.create({
      data: { name, role, phone, pixKey, userId },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to create the professional');
  }
};

const updateProfessional = async (id, { name, role, phone, pixKey }, userId) => {
  try {
    await findOwnedProfessional(id, userId);

    return await prisma.professional.update({
      where: { id },
      data: { name, role, phone, pixKey },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to update the professional');
  }
};

const toggleProfessionalStatus = async (id, active, userId) => {
  try {
    await findOwnedProfessional(id, userId);

    return await prisma.professional.update({
      where: { id },
      data: {
        active,
        leftAt: active ? null : new Date(),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to change the professional status');
  }
};

const deleteProfessional = async (id, userId) => {
  try {
    await findOwnedProfessional(id, userId);

    await prisma.professional.delete({ where: { id } });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to delete the professional');
  }
};

module.exports = {
  getProfessionals,
  createProfessional,
  updateProfessional,
  toggleProfessionalStatus,
  deleteProfessional,
};
