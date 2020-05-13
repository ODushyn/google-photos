'use strict';

const api = require('./api.js');
const bodyParser = require('body-parser');
const config = require('./config.js');
const express = require('express');
const expressWinston = require('express-winston');
const http = require('http');
const path = require('path');
const persist = require('node-persist');
const session = require('express-session');
const sessionFileStore = require('session-file-store');

const logger = require('./logger');
const app = express();
const fileStore = sessionFileStore(session);
const server = http.Server(app);

// Use the EJS template engine
app.set('view engine', 'ejs');

// Set up a cache for media items that expires after 55 minutes.
// This caches the baseUrls for media items that have been selected
// by the user for the photo frame. They are used to display photos in
// thumbnails and in the frame. The baseUrls are send to the frontend and
// displayed from there. The baseUrls are cached temporarily to ensure that the
// app is responsive and quick. Note that this data should only be stored for a
// short amount of time and that access to the URLs expires after 60 minutes.
// See the 'best practices' and 'acceptable use policy' in the developer
// documentation.
const mediaItemCache = persist.create({
  dir: 'persist-mediaitemcache/',
  ttl: 3300000,  // 55 minutes
});
mediaItemCache.init();

// Set up OAuth 2.0 authentication through the passport.js library.
const passport = require('passport');
const auth = require('./auth');
auth(passport);

// Set up a session middleware to handle user sessions.
// NOTE: A secret is used to sign the cookie. This is just used for this sample
// app and should be changed.
const sessionMiddleware = session({
  resave: true,
  saveUninitialized: true,
  store: new fileStore({}),
  secret: config.sessionSecret,
});

// Enable extensive logging if the DEBUG environment variable is set.
if (process.env.DEBUG) {
  // Print all winston log levels.
  logger.level = 'silly';

  // Enable express.js debugging. This logs all received requests.
  app.use(expressWinston.logger({
    transports: [
      consoleTransport
    ],
    winstonInstance: logger
  }));
  // Enable request debugging.
  require('request-promise').debug = true;
} else {
  // By default, only print all 'verbose' log level messages or below.
  logger.level = 'verbose';
}


// Set up static routes for hosted libraries.
app.use(express.static('static'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist/'));
app.use(
  '/fancybox',
  express.static(__dirname + '/node_modules/@fancyapps/fancybox/dist/'));
app.use(
  '/mdlite',
  express.static(__dirname + '/node_modules/material-design-lite/dist/'));


// Parse application/json request data.
app.use(bodyParser.json());

// Parse application/xwww-form-urlencoded request data.
app.use(bodyParser.urlencoded({extended: true}));

// Enable user session handling.
app.use(sessionMiddleware);

// Set up passport and session handling.
app.use(passport.initialize());
app.use(passport.session());

// Middleware that adds the user of this session as a local variable,
// so it can be displayed on all pages when logged in.
app.use((req, res, next) => {
  res.locals.name = '-';
  if (req.user && req.user.profile && req.user.profile.name) {
    res.locals.name =
      req.user.profile.name.givenName || req.user.profile.displayName;
  }

  res.locals.avatarUrl = '';
  if (req.user && req.user.profile && req.user.profile.photos) {
    res.locals.avatarUrl = req.user.profile.photos[0].value;
  }
  next();
});


app.get('/', (req, res) => {
  if (!req.user || !req.isAuthenticated()) {
    // Not logged in yet.
    res.render('pages/login');
  } else {
    res.render('pages/frame');
  }
});

app.get('/googlea24351d6b803c6e8.html', function(req, res) {
  res.sendFile(path.join(__dirname, '/views/googlea24351d6b803c6e8.html'));
});

// Star the OAuth login process for Google.
app.get('/auth/google', passport.authenticate('google', {
  scope: config.scopes,
  failureFlash: true,  // Display errors to the user.
  session: true,
}));

// Callback receiver for the OAuth process after log in.
app.get('/auth/google/callback',
  passport.authenticate(
    'google', {failureRedirect: '/', failureFlash: true, session: true}),
  (req, res) => {
    // User has logged in.
    logger.info('User has logged in.');
    res.redirect('/');
  });

app.get('/photos', async (req, res) => {
  const userId = req.user.profile.id;
  const authToken = req.user.token;
  const refresh = (req.query.refresh === "true");

  let cachedPhotos = mediaItemCache.getItemSync(userId);
  if (!refresh && (cachedPhotos && cachedPhotos.length > 0)) {
    res.send({photos: cachedPhotos})
  } else {
    let albums = await getRandomAlbums(req, res, userId);
    let photos = await getRandomPhotos(albums, authToken, res, userId);
    res.send({photos})
  }
})

app.get('/logout', (req, res) => {
  req.logout();
  req.session.destroy();
  res.redirect('/');
});

async function getRandomAlbums(req) {
  const data = await api.getAlbums(req.user.token);
  let albums = data.albums;
  //return _randomItems(albums, 2);
  return _randomItems(albums, Math.round(albums.length / 15));
}


async function getRandomPhotos(randomAlbums, authToken, res, userId) {
  let photos = [];
  const forLoop = async _ => {
    for (let i = 0; i < randomAlbums.length; i++) {
      const parameters = {albumId: randomAlbums[i].id};
      const data = await api.search(authToken, parameters);
      photos.push(..._randomItems(fetchPhotos(res, userId, data), Math.ceil(randomAlbums.length / 10)));
    }
    shuffle(photos);
  }
  await forLoop();

  mediaItemCache.setItemSync(userId, photos);

  return photos;

  function fetchPhotos(res, userId, data) {
    if (data.error) {
      returnError(res, data)
    } else {
      mediaItemCache.setItemSync(userId, data.photos);
      return data.photos;
    }
  }
}

function _randomItems(items, n) {
  let result = [];
  let uniqueNumbers = [];
  if (!n || n > items.length) n = items.length;

  for (let j = 0; j < n; j++) {
    let randomNum = Math.floor(Math.random() * items.length);
    if (uniqueNumbers.indexOf(randomNum) === -1) {
      uniqueNumbers.push(randomNum);
      result.push(items[randomNum]);
    } else {
      j--;
    }
  }
  return result;
}

function shuffle(array) {
  let currentIndex = array.length, temporaryValue, randomIndex;

  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

// Start the server
const listener = server.listen(process.env.PORT || config.port, () => {
  console.log("Your app is listening on port " + listener.address().port);
  console.log(listener.address());
});

// Responds with an error status code and the encapsulated data.error.
function returnError(res, data) {
  // Return the same status code that was returned in the error or use 500
  // otherwise.
  const statusCode = data.error.code || 500;
  // Return the error.
  res.status(statusCode).send(data.error);
}