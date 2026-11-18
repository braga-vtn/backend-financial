const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { professionalsService } = require('../services');
const ApiError = require('../utils/ApiError');

const getUserId = (req) => {
  const { userId } = req.payload || {};
  if (!userId) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The data sent is not complete. It is not possible to identify the user');
  }
  return userId;
};

const getProfessionals = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { status, q } = req.query;

  const data = await professionalsService.getProfessionals({ status, q }, userId);
  res.status(httpStatus.OK).send(data);
});

const createProfessional = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { name, role, phone, pixKey } = req.body;

  const data = await professionalsService.createProfessional({ name, role, phone, pixKey }, userId);
  res.status(httpStatus.CREATED).send(data);
});

const updateProfessional = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { name, role, phone, pixKey } = req.body;

  const data = await professionalsService.updateProfessional(id, { name, role, phone, pixKey }, userId);
  res.status(httpStatus.OK).send(data);
});

const toggleProfessionalStatus = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { active } = req.body;

  const data = await professionalsService.toggleProfessionalStatus(id, active, userId);
  res.status(httpStatus.OK).send(data);
});

const deleteProfessional = catchAsync(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  await professionalsService.deleteProfessional(id, userId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getProfessionals,
  createProfessional,
  updateProfessional,
  toggleProfessionalStatus,
  deleteProfessional,
};
