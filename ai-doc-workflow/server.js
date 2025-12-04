const path = require('path');
const cds = require('@sap/cds');
const xsenv = require('@sap/xsenv');
const xssec = require('@sap/xssec');
const passport = require('passport');
const express = require('express');

xsenv.loadEnv();

cds.on('bootstrap', (app) => {
  const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
  const uaaService = services.uaa;

  passport.use(new xssec.JWTStrategy(uaaService));
  app.use(passport.initialize());
  app.use(passport.authenticate('JWT', { session: false }));

  const staticPath = path.join(__dirname, 'app');
  app.use(express.static(staticPath));
});

module.exports = cds.server;
