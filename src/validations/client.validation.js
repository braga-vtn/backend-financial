const Joi = require('joi');

const postClient = {
  body: Joi.object().keys({
    identifier: Joi.string().required(),
    name: Joi.string().required(),
    register: Joi.string().required(),
    city: Joi.string().required(),
    uf: Joi.string().required(),
    zipcode: Joi.string().required(),
    neighborhood: Joi.string().required(),
    address: Joi.string().required(),
    value: Joi.number().required(),
    email: Joi.string().required(),
    phone: Joi.string().required(),
    sendByWhatsapp: Joi.boolean().required(),
    sendByEmail: Joi.boolean().required(),
    observation: Joi.string().default(''),
  }),
};

const patchClient = {
  params: Joi.object().keys({
    clientId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      identifier: Joi.string(),
      name: Joi.string(),
      register: Joi.string(),
      city: Joi.string(),
      uf: Joi.string(),
      zipcode: Joi.string(),
      neighborhood: Joi.string(),
      address: Joi.string(),
      value: Joi.number(),
      email: Joi.string(),
      phone: Joi.string(),
      sendByWhatsapp: Joi.boolean(),
      sendByEmail: Joi.boolean(),
      observation: Joi.string(),
    })
    .min(1),
};

const deleteClient = {
  params: Joi.object().keys({
    clientId: Joi.string().required(),
  }),
};

module.exports = {
  postClient,
  patchClient,
  deleteClient,
};
