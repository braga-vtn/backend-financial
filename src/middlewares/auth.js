const passport = require('passport');
const httpStatus = require('http-status');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const ApiError = require('../utils/ApiError');

const prisma = new PrismaClient();

const verifyCallback = (req, resolve, reject, type) => async (err, user, payload) => {
  if (err || !user) {
    return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required. Please provide valid credentials.'));
  }
  if (payload.type && type && type[0] && !type.includes(payload.type)) {
    return reject(new ApiError(httpStatus.FORBIDDEN, 'Access denied: insufficient privileges to access this resource.'));
  }

  req.user = user;
  req.payload = payload;

  resolve();
};

const validateSecretToken = async (token) => {
  const tokenWithoutPrefix = token.slice(3);
  const fragment = tokenWithoutPrefix.slice(0, 34);

  const tokenRecord = await prisma.apiToken.findFirst({
    where: { fragment },
  });

  if (!tokenRecord) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'The provided token is invalid.');
  }

  const isValid = await bcrypt.compare(tokenWithoutPrefix, tokenRecord.tokenHash);
  if (!isValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'The provided token is invalid.');
  }

  if (tokenRecord.revoked) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'The token has been revoked. Please request a new token.');
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: tokenRecord.userId },
  });
  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'No user is associated with the provided token.');
  }

  return { user, payload: tokenRecord };
};

const auth =
  (...type) =>
  async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Authentication token missing.'));
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'The token format is invalid.'));
    }

    if (token.startsWith('sk-')) {
      if (!type.includes('public')) {
        return next(new ApiError(httpStatus.UNAUTHORIZED, 'Secret token authentication is not permitted for this route.'));
      }
      try {
        const { user, payload } = await validateSecretToken(token);
        req.user = user;
        req.payload = payload;
        return next();
      } catch (error) {
        return next(error);
      }
    } else {
      return new Promise((resolve, reject) => {
        passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, type))(req, res, next);
      })
        .then(() => next())
        .catch((err) => next(err));
    }
  };

module.exports = auth;
