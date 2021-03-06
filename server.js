require('dotenv').config()
require('./logging')
var fs = require('fs')
var path = require('path')
var express = require('express')
var session = require('express-session')
var bodyParser = require('body-parser')
var cors = require('cors')
var helmet = require('helmet')
var csurf = require('csurf')
var logger = require('morgan')

var https = require('https')
var privateKey = fs.readFileSync('sslcert/server.key', 'utf8')
var certificate = fs.readFileSync('sslcert/server.crt', 'utf8')
var credentials = { key: privateKey, cert: certificate }

var host = process.env.SERVER_HOST || 'localhost'
var https_port = process.env.SERVER_HTTPS_PORT || '8443'
var env = process.env.NODE_ENV || 'development'

var server = express()
server.disable('x-powered-by')

// ======== *** BODY-PARSER MIDDLEWARE ***
server.use(bodyParser.urlencoded({
  extended: false,
  type: 'application/x-www-form-urlencoded'
}))
server.use(bodyParser.json({
  type: [ 'application/json', 'application/vnd.api+json' ]
}))

// ======== *** SESSION MIDDLEWARE ***
// TODO: implement session store:
// https://www.npmjs.com/package/connect-session-knex
// https://www.npmjs.com/package/connect-redis
server.use(session({
  secret: process.env.SESSION_SECRET,
  // store: ,
  resave: false,
  saveUninitialized: true,
  expires: new Date(Date.now() + 3600000), // 1 Hour
  cookie: { httpOnly: true, secure: true }
}))

// ======== *** CORS MIDDLEWARE ***
// TODO: fix multi origin
// var corsWhitelist = ['localhost', 'http://example2.com']

// Set CORS
server.use(cors({
  origin: host,
  methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'HEAD'],
  allowedHeaders: ['Content-type', 'Accept', 'X-Access-Token', 'X-Key'],
  credentials: true,
  maxAge: 3600
}))

// ======== *** SECURITY MIDDLEWARE ***
server.use(helmet())
// set CSP
server.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: [ "'self'" ],
    scriptSrc: [ "'self'", "'unsafe-inline'", "'unsafe-eval'",
      'ajax.googleapis.com', 'www.google-analytics.com' ],
    styleSrc: [ "'self'", "'unsafe-inline'", 'ajax.googleapis.com' ],
    imgSrc: [ "'self'", 'data:' ],
    connectSrc: [ "'self'" ],
    reportOnly: false,
    setAllHeaders: false,
    safari5: false
  }
}))

// ======== *** CSURF MIDDLEWARE ***
var valueFunction = function (req) {
  var result = (req.body && req.body._csrf) ||
    (req.query && req.query._csrf) ||
    (req.cookies && req.cookies[ 'XSRF-TOKEN' ]) ||
    (req.headers[ 'csrf-token' ]) ||
    (req.headers[ 'xsrf-token' ]) ||
    (req.headers[ 'x-csrf-token' ]) ||
    (req.headers[ 'x-xsrf-token' ])

  return result
}
// set CSURF
server.use(csurf({ value: valueFunction }))

server.use(function (req, res, next) {
  res.cookie('XSRF-TOKEN', req.csrfToken())
  res.locals.csrftoken = req.csrfToken()
  next()
})

// error handlers

// development error handler
// will print stacktrace
if (process.env.NODE_ENV === 'development') {
  server.use(function (err, req, res, next) {
    res.status(err.status || 500)
    res.render('error', {
      message: err.message,
      error: err
    })
  })
  server.use(logger('dev'))
} else {
  // production error handler
  // no stacktraces leaked to user
  server.use(function (err, req, res, next) {
    res.status(err.status || 500)
    res.render('error', {
      message: err.message,
      error: {}
    })
  })
  server.use(logger('common', {
    skip: function (req, res) {
      return res.statusCode < 400
    },
    stream: path.resolve(__dirname, '/../app_errors.log')
  }))
}

server.use(require('./source'))

server = https.createServer(credentials, server)
server.listen(https_port, host)
console.log('Server running on, %s:%d. NODE_ENV = %s', host, https_port, env)

module.exports = server
