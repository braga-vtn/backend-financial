const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const httpStatus = require('http-status');
const config = require('../config/config');
const userService = require('./user.service');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const generateCode = require('../utils/generateCode');

const prisma = new PrismaClient();

const generateToken = (userId, email, expires, type, secret = config.jwt.secret) => {
  try {
    const payload = {
      jti: uuidv4(),
      iat: moment().unix(),
      exp: expires.unix(),
      userId,
      type,
      email,
    };

    return jwt.sign(payload, secret);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error generating the token. Try again later');
  }
};

const saveToken = async (token, userId, expires, type) => {
  try {
    if (type !== 'refresh') {
      await prisma.token.deleteMany({
        where: { type, userId },
      });
    }

    const tokenDoc = await prisma.token.create({
      data: {
        type,
        token,
        payload: { type },
        expires,
        userId,
      },
    });

    return tokenDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error saving the token. Try again later');
  }
};

const saveCode = async (type, userId, code) => {
  try {
    await prisma.token.deleteMany({
      where: {
        type,
        userId,
      },
    });

    await prisma.token.create({
      data: {
        type,
        userId,
        token: code,
      },
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error saving the code. Try again later');
  }
};

const verifyToken = async (token, type) => {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const tokenDoc = await prisma.token.findFirst({
      where: {
        token,
        type,
        userId: payload.sub,
      },
    });

    if (!tokenDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Token not found');
    }

    return tokenDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error checking the token. Try again later');
  }
};

const checkCode = async (code, type, email) => {
  try {
    const codeDoc = await prisma.token.findFirst({
      where: {
        token: code,
        type,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!codeDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Code not found or invalid');
    }

    const user = await userService.getUserByClerkId(codeDoc.userId);
    if (!user || !user.email) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The user was not found with this id');
    }

    if (user.email !== email) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The Code is invalid for this user ');
    }

    return codeDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error when checking the code. Try again later');
  }
};

const generateAuthTokens = async (clerkId) => {
  try {
    const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'minutes');
    const accessToken = generateToken(clerkId, '', accessTokenExpires, tokenTypes.ACCESS);

    const refreshTokenExpires = moment().add(config.jwt.refreshExpirationDays, 'days');
    const refreshToken = generateToken(clerkId, '', refreshTokenExpires, tokenTypes.REFRESH);

    await saveToken(refreshToken, clerkId, refreshTokenExpires, 'refresh');

    return {
      code: accessToken && refreshToken ? 200 : 400,
      access: {
        token: accessToken,
        expires: accessTokenExpires.toDate(),
      },
      refresh: {
        token: refreshToken,
        expires: refreshTokenExpires.toDate(),
      },
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error generating authentication tokens. Try again later');
  }
};

const generateResetPasswordCode = async (email) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        email,
      },
      select: {
        clerkId: true,
      },
    });

    if (!user || !user.clerkId) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The email is not registered as a user');
    }

    const generate = generateCode();
    await saveCode('register', user.clerkId, generate);

    return generate;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred when generating the password reset code. Try again later'
    );
  }
};

module.exports = {
  generateToken,
  saveCode,
  saveToken,
  verifyToken,
  checkCode,
  generateAuthTokens,
  generateResetPasswordCode,
};
