const httpStatus = require('http-status');
const { PrismaClient } = require('@prisma/client');
const tokenService = require('./token.service');
const userService = require('./user.service');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');

const prisma = new PrismaClient();

const login = async (email, password) => {
  try {
    const user = await userService.getUser(email, password);
    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
    }

    return user;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred during login');
  }
};

const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const tokens = await tokenService.generateAuthTokens(refreshTokenDoc.userId);

    return tokens;
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

const resetPassword = async (password, code, email) => {
  try {
    const verifyData = await tokenService.checkCode(code, 'register', email);
    if (!verifyData || !verifyData.id) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The code is invalid and the recovery of the account is not allowed');
    }

    await prisma.token.delete({ where: { id: verifyData.id } });
    await userService.resetPassword(password, verifyData.userId);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to replace the user password');
  }
};

const verifyCode = async (code, email) => {
  try {
    const isValid = await tokenService.checkCode(code, 'register', email);
    if (!isValid || !isValid.id) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The code is invalid and the recovery of the account is not allowed');
    }

    return {
      code: 200,
      message: 'The code is valid',
    };
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Code verification failed');
  }
};

module.exports = {
  login,
  refreshAuth,
  resetPassword,
  verifyCode,
};
