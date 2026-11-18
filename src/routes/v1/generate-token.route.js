const express = require('express');
const moment = require('moment');
const { tokenTypes } = require('../../config/tokens');
const { generateToken } = require('../../services/token.service');

const router = express.Router();

router.post('/', (req, res) => {
  const userId = '4c213301-26a6-4747-bdfb-bb951c2bf9d8';
  const expires = moment().add(1, 'hour');
  const email = 'matheusbr722@gmail.com';

  const token = generateToken(userId, email, expires, tokenTypes.SYSTEM);
  res.send({ token });
});

module.exports = router;
