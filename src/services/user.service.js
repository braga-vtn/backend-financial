const { PrismaClient } = require('@prisma/client');
const httpStatus = require('http-status');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
// eslint-disable-next-line import/order

const prisma = new PrismaClient();

const encryptData = (data, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decryptData = (encryptedData, key) => {
  const [iv, encrypted] = encryptedData.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const getClientByIdentifier = async (identifier, userId) => {
  try {
    const client = await prisma.clients.findFirst({
      where: { identifier, userId },
    });

    if (!client) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
    }

    return client;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred when checking the client credentials. Try again later'
    );
  }
};

const createUser = async (email, password) => {
  try {
    const isEmailTaken = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (isEmailTaken) {
      return { code: 201, message: 'Email already in use' };
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const encryptedPassword = encryptData(hashedPassword, config.encryptionKey);

    await prisma.user.create({
      data: {
        email,
        password: encryptedPassword,
      },
    });

    return { code: 200, message: 'user created' };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to create the user');
  }
};

const getUser = async (email, password) => {
  try {
    const user = await prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        clerkId: true,
        password: true,
      },
    });

    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
    }

    const decryptedPassword = decryptData(user.password, config.encryptionKey);

    const isPasswordValid = await bcrypt.compare(password, decryptedPassword);
    if (!isPasswordValid) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred when checking the user credentials. Try again later'
    );
  }
};

const getUserByClerkId = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
    }

    return user;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred when checking the user credentials. Try again later'
    );
  }
};

const resetPassword = async (password, userId) => {
  try {
    if (!password || !userId) {
      throw new ApiError(httpStatus.NOT_ACCEPTABLE, 'The data to reset the password is not complete');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const encryptedPassword = encryptData(hashedPassword, config.encryptionKey);

    await prisma.user.update({
      where: { clerkId: userId },
      data: {
        password: encryptedPassword,
      },
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'It was not possible to replace the user password');
  }
};

module.exports = {
  getClientByIdentifier,
  createUser,
  getUser,
  getUserByClerkId,
  resetPassword,
};
