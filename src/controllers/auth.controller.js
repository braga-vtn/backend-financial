const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, userService, tokenService, emailService } = require('../services');
const ApiError = require('../utils/ApiError');

const register = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'Incomplete data to create an account');
  }

  const data = await userService.createUser(email, password);

  res.status(httpStatus.OK).send({
    code: data.code,
    message: data.message,
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await authService.login(email, password);
  if (!user || !user.clerkId) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'Invalid credentials');
  }

  const tokens = await tokenService.generateAuthTokens(user.clerkId);
  res.status(httpStatus.OK).send(tokens);
});

const refreshTokens = catchAsync(async (req, res) => {
  const xr = req.headers.authorization.replace('Bearer ', '');
  if (!xr) {
    throw new ApiError(
      httpStatus.NOT_ACCEPTABLE,
      'It was not possible to generate new tokens because the parameters are incomplete'
    );
  }

  const tokens = await authService.refreshAuth(xr);
  res.status(httpStatus.OK).send(tokens);
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'A valid email is not informed for account recovery');
  }

  const resetPasswordCode = await tokenService.generateResetPasswordCode(email);
  if (!resetPasswordCode) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The code was not generated correctly');
  }

  await emailService.sendVerificationEmail(
    'Código de Verificação',
    email,
    resetPasswordCode,
    'Insira o código a baixo no local indicado na página de recuperação de conta, caso isso seja um engano, não realize nenhuma ação!'
  );

  res.status(httpStatus.OK).send({ code: 200, message: 'Verification code sent' });
});

const resetPassword = catchAsync(async (req, res) => {
  const { email, code } = req.payload;
  if (!email || !code) {
    throw new ApiError(
      httpStatus.NOT_ACCEPTABLE,
      'The parameters are not complete. It is not possible to redefine the password'
    );
  }

  const { password } = req.body;
  if (!password) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The password does not comply with the minimum requirements to change');
  }

  await authService.resetPassword(password, code, email);
  res.status(httpStatus.OK).send({ code: 200, message: 'Redefined password' });
});

const verifyCode = catchAsync(async (req, res) => {
  const { email } = req.payload;
  if (!email) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The data sent is not complete. It is not possible to identify the user');
  }

  const { code } = req.body;
  if (!code) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The code was not sent correctly to validate account recovery');
  }

  const isVerifyCode = await authService.verifyCode(code, email);
  res.status(httpStatus.OK).send(isVerifyCode);
});

module.exports = {
  register,
  login,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyCode,
};
