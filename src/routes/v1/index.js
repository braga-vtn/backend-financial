const express = require('express');
const config = require('../../config/config');
const generateRoute = require('./generate-token.route');
const authRoute = require('./auth.route');
const professionalsRoute = require('./professionals.route');
const financialRoute = require('./financial.route');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/professionals',
    route: professionalsRoute,
  },
  {
    path: '/financial',
    route: financialRoute,
  },
];

const devRoutes = [
  {
    path: '/generate-token',
    route: generateRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
