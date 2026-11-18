const Joi = require('joi');

const postUser = {
  body: Joi.object().keys({
    name: Joi.string().required(),
  }),
};

module.exports = {
  postUser,
};
