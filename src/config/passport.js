const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { PrismaClient } = require('@prisma/client');
const config = require('./config');
const { tokenTypes } = require('./tokens');

const prisma = new PrismaClient();

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

const jwtVerify = async (payload, done) => {
  try {
    if (payload.type === tokenTypes.SYSTEM || payload.type === tokenTypes.REFRESH) {
      done(null, true, payload);
    } else if (payload.type !== tokenTypes.ACCESS && payload.type !== tokenTypes.VERIFY_EMAIL) {
      throw new Error('Invalid token type');
    }
    const user = await prisma.user.findUnique({
      where: {
        clerkId: payload.userId,
      },
    });

    if (!user) {
      return done(null, false, payload);
    }
    done(null, user, payload);
  } catch (error) {
    done(error, false, payload);
  }
};

const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);

module.exports = {
  jwtStrategy,
};
