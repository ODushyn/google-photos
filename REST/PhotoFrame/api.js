const config = require('./config');
const logger = require('./logger');
const request = require('request-promise');

let obj = {
  search: async function (authToken, parameters) {
    let photos = [];
    let error = null;
    parameters.pageSize = config.searchPageSize;
    try {
      do {
        logger.info(
          `Submitting search with parameters: ${JSON.stringify(parameters)}`);
        const result =
          await request.post(config.apiEndpoint + '/v1/mediaItems:search', {
            headers: {'Content-Type': 'application/json'},
            json: parameters,
            auth: {'bearer': authToken},
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
      parameters.pageToken != null);

    } catch (err) {
      // If the error is a StatusCodeError, it contains an error.error object that
      // should be returned. It has a name, statuscode and message in the correct
      // format. Otherwise extract the properties.
      error = err.error.error ||
        {name: err.name, code: err.statusCode, message: err.message};
      logger.error(error);
    }

    logger.info('Search complete.');
    return {photos, parameters, error};
  },
  getAlbums: async function (authToken) {
    let albums = [];
    let error = null;
    let parameters = {pageSize: config.albumPageSize};
    try {
      do {
        logger.verbose(`Loading albums. Received so far: ${albums.length}`);
        const result = await request.get(config.apiEndpoint + '/v1/albums', {
          headers: {'Content-Type': 'application/json'},
          qs: parameters,
          json: true,
          auth: {'bearer': authToken},
        });

        if (result && result.albums) {
          logger.verbose(`Number of albums received: ${result.albums.length}`);
          const items = result.albums.filter(x => !!x);
          albums = albums.concat(items);
        }
        parameters.pageToken = result.nextPageToken;
      } while (parameters.pageToken != null);
    } catch (err) {
      console.log(err);
      // If the error is a StatusCodeError, it contains an error.error object that
      // should be returned. It has a name, statuscode and message in the correct
      // format. Otherwise extract the properties.
      error = err.error.error ||
        {name: err.name, code: err.statusCode, message: err.message};
      logger.error(error);
    }
    logger.info('Albums loaded.');
    return {albums, error};
  }
}

module.exports = obj;