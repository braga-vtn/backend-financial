const zxcvbn = require('zxcvbn');

const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

const password = (value, helpers) => {
  const result = zxcvbn(value);
  if (result.score >= 3) {
    return value;
  }

  return helpers.message('Your password is not strong the sulficial, type something safer');
};

module.exports = {
  objectId,
  password,
};
