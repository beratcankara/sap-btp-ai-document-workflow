const cds = require('@sap/cds');
const xsenv = require('@sap/xsenv');
const xssec = require('@sap/xssec');
const passport = require('passport');

xsenv.loadEnv();

cds.on('bootstrap', (app) => {
  const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
  const uaaService = services.uaa;

  passport.use(new xssec.JWTStrategy(uaaService));
  app.use(passport.initialize());
  app.use(passport.authenticate('JWT', { session: false }));
});

module.exports = cds.server;
