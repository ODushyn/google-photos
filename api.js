const config = require('./config');
const logger = require('./logger');
const request = require('request-promise');
const passportRefresh = require('passport-oauth2-refresh');

let obj = {
  search: async function (req, res, parameters) {
    let retries = 0;
    let photos = [];
    let error = null;
    parameters.pageSize = config.searchPageSize;

    let photoRequest = async () => {
      try {
        do {
          logger.info(
            `Submitting search with parameters: ${JSON.stringify(parameters)}`);
          const result =
            await request.post(config.apiEndpoint + '/v1/mediaItems:search', {
              headers: {'Content-Type': 'application/json'},
              json: parameters,
              auth: {'bearer': req.user.token},
            });

          logger.debug(`Response: ${result}`);

          // The list of media items returned may be sparse and contain missing
          // elements. Remove all invalid elements.
          // Also remove all elements that are not images by checking its mime type.
          // Media type filters can't be applied if an album is loaded, so an extra
          // filter step is required here to ensure that only images are returned.
          const items = result && result.mediaItems ?
            result.mediaItems
              .filter(x => x)  // Filter empty or invalid items.
              // Only keep media items with an image mime type.
              .filter(x => x.mimeType && x.mimeType.startsWith('image/')) :
            [];

          photos = photos.concat(items);

          // Set the pageToken for the next request.
          parameters.pageToken = result.nextPageToken;

          logger.verbose(
            `Found ${items.length} images in this request. Total images: ${
              photos.length}`);

        } while (photos.length < config.photosToLoad &&
        parameters.pageToken);

        return {photos, parameters, error};
      } catch (err) {
        error = err.error.error ||
          {name: err.name, code: err.statusCode, message: err.message};
        if (err.error.error.code === 401) {
          retries--;
          if (!retries) {
            // Couldn't refresh the access token.
            return res.status(401).end();
          }
          return await _handleTokenExpiration(req, res, photoRequest)
        } else {
          logger.error(error);
        }
      }
    }

    let response = await photoRequest();

    logger.info('Search complete.');
    return response;
  },
  getAlbums: async function (req, res) {
    let retries = 0;
    let albums = [];
    let error = null;
    let parameters = {pageSize: config.albumPageSize};

    let albumsRequest = async () => {
      try {
        do {
          logger.verbose(`Loading albums. Received so far: ${albums.length}`);
          const result = await request.get(config.apiEndpoint + '/v1/albums', {
            headers: {'Content-Type': 'application/json'},
            qs: parameters,
            json: true,
            auth: {'bearer': req.user.token},
          });

          if (result && result.albums) {
            logger.verbose(`Number of albums received: ${result.albums.length}`);
            const items = result.albums.filter(x => !!x);
            albums = albums.concat(items);
          }
          parameters.pageToken = result.nextPageToken;
        } while (parameters.pageToken);

        return {albums, error};
      } catch (err) {
        error = err.error.error ||
          {name: err.name, code: err.statusCode, message: err.message};
        if (err.error.error.code === 401) {
          retries--;
          if (!retries) {
            // Couldn't refresh the access token.
            return res.status(401).end();
          }
          return await _handleTokenExpiration(req, res, albumsRequest)
        } else {
          logger.error(error);
        }
      }
    }

    let response = await albumsRequest();

    logger.info('Albums loaded.');
    return response;
  }
}

async function _handleTokenExpiration(req, res, callback) {
  return new Promise((resolve, reject) => {
    passportRefresh.requestNewAccessToken('google', config.refreshToken, async function (err, accessToken) {
      if (err || !accessToken) return res.status(401).end();
      logger.info('Save the new accessToken for future use');
      req.session.passport.user.token = accessToken;
      req.session.save();

      resolve(await callback());
    });
  })
}

module.exports = obj;