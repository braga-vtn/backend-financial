const Joi = require('joi');

// Campos opcionais: '' vira undefined (empty) e depois null (default).
// Assim o service sempre recebe string | null, igual ao ProfessionalPayloadTypes do front.
const optionalText = (max) => Joi.string().trim().max(max).allow(null).empty('').default(null);

const professionalBody = Joi.object().keys({
  name: Joi.string().trim().min(2).max(120).required(),
  role: optionalText(80),
  phone: optionalText(30),
  pixKey: optionalText(140),
});

const idParam = Joi.object().keys({
  id: Joi.string().trim().required(),
});

const getProfessionals = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive', 'all').default('all'),
    q: Joi.string().trim().max(100).allow('').default(''),
  }),
};

const createProfessional = {
  body: professionalBody,
};

const updateProfessional = {
  params: idParam,
  body: professionalBody,
};

const toggleProfessionalStatus = {
  params: idParam,
  body: Joi.object().keys({
    active: Joi.boolean().required(),
  }),
};

const deleteProfessional = {
  params: idParam,
};

module.exports = {
  getProfessionals,
  createProfessional,
  updateProfessional,
  toggleProfessionalStatus,
  deleteProfessional,
};
