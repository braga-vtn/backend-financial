const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.post('/register', auth('system'), validate(authValidation.register), authController.register);
router.post('/login', auth('system'), validate(authValidation.login), authController.login);
router.post('/forgot-password', auth('system'), validate(authValidation.forgotPassword), authController.forgotPassword);
router.post('/verify-code', auth('system'), validate(authValidation.verifyCode), authController.verifyCode);
router.post('/reset-password', auth('system'), validate(authValidation.resetPassword), authController.resetPassword);
router.get('/refresh-tokens', auth('refresh'), authController.refreshTokens);

module.exports = router;
