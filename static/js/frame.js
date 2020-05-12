$(document).ready(async () => {
  console.log('new?!?!?');
  await loadImages();
  setUpFancyBox();

  // Clicking the 'view fullscreen' button opens the gallery from the first image.
  $('#startSlideshow')
    .on('click', (e) => $('#images-container a').first().click());

  // Clicking log out opens the log out screen.
  $('#logout').on('click', (e) => {
    window.location = '/logout';
  });
});

// Empties the grid of images.
function clearPreview() {
  showPreview(null, null);
}

// Shows a grid of media items in the photo frame.
// The source is an object that describes how the items were loaded.
// The media items are rendered on screen in a grid, with a caption based
// on the description, model of the camera that took the photo and time stamp.
// Each photo is displayed through the fancybox library for full screen and
// caption support.
function showPreview(source, mediaItems) {

  $('#images-container').empty();

  // Display the length and the source of the items if set.
  if (source && mediaItems) {
    $('#images-count').text(mediaItems.length);
    $('#images-source').text(JSON.stringify(source));
    $('#preview-description').show();
  } else {
    $('#images-count').text(0);
    $('#images-source').text('No photo search selected');
    $('#preview-description').hide();
  }

  // Show an error message and disable the slideshow button if no items are
  // loaded.
  if (!mediaItems || !mediaItems.length) {
    $('#images_empty').show();
    $('#startSlideshow').prop('disabled', true);
  } else {
    $('#images_empty').hide();
    $('startSlideshow').removeClass('disabled');
  }

  // Loop over each media item and render it.
  $.each(mediaItems, (i, item) => {
    // Construct a thumbnail URL from the item's base URL at a small pixel size.
    const thumbnailUrl = `${item.baseUrl}=w256-h256`;
    // Constuct the URL to the image in its original size based on its width and
    // height.
    const fullUrl = `${item.baseUrl}=w${item.mediaMetadata.width}-h${
      item.mediaMetadata.height}`;

    // Compile the caption, conisting of the description, model and time.
    const description = item.description ? item.description : '';
    const model = item.mediaMetadata.photo.cameraModel ?
      `#Shot on ${item.mediaMetadata.photo.cameraModel}` :
      '';
    const time = item.mediaMetadata.creationTime;
    const captionText = `${description} ${model} (${time})`

    // Each image is wrapped by a link for the fancybox gallery.
    // The data-width and data-height attributes are set to the
    // height and width of the original image. This allows the
    // fancybox library to display a scaled up thumbnail while the
    // full sized image is being loaded.
    // The original width and height are part of the mediaMetadata of
    // an image media item from the API.
    const linkToFullImage = $('<a />')
      .attr('href', fullUrl)
      .attr('data-fancybox', 'gallery')
      .attr('data-width', item.mediaMetadata.width)
      .attr('data-height', item.mediaMetadata.height);
    // Add the thumbnail image to the link to the full image for fancybox.
    const thumbnailImage = $('<img />')
      .attr('src', thumbnailUrl)
      .attr('alt', captionText)
      .addClass('img-fluid rounded thumbnail');
    linkToFullImage.append(thumbnailImage);

    // The caption consists of the caption text and a link to open the image
    // in Google Photos.
    const imageCaption =
      $('<figcaption />').addClass('hidden').text(captionText);
    const linkToGooglePhotos = $('<a />')
      .attr('href', item.productUrl)
      .text('[Click to open in Google Photos]');
    imageCaption.append($('<br />'));
    imageCaption.append(linkToGooglePhotos);
    linkToFullImage.append(imageCaption);

    // Add the link (consisting of the thumbnail image and caption) to
    // container.
    $('#images-container').append(linkToFullImage);
  });
};

// Makes a backend request to display the queue of photos currently loaded into
// the photo frame. The backend returns a list of media items that the user has
// selected. They are rendered in showPreview(..).
async function loadImages(refresh= false) {
  showLoadingDialog();

  return _loadRandomImages();

  async function _loadRandomImages() {
    return $.ajax({
      type: 'GET',
      url: '/photos',
      dataType: 'json',
      data: {
        refresh: refresh
      },
      success: (data) => {
        hideLoadingDialog();
        showPreview(data.parameters, data.photos);
      },
      error: (data) => {
        hideLoadingDialog();
        handleError('Could not load queue', data)
      }
    });
  }
}

function setUpFancyBox() {
  let loopIsOver = false;
  let newImagesLoaded = false;
  $().fancybox({
    selector: '[data-fancybox="gallery"]',
    loop: true,
    afterShow: function (box) {
      if (box.currIndex === Math.round(box.group.length * 0.7)) {
        if (!newImagesLoaded) {
          loadImages(true).then(() => newImagesLoaded = true);
        }
      }
      if (box.currIndex === box.group.length - 1 && newImagesLoaded) {
        loopIsOver = true;
        $.fancybox.close();
      }
    },
    afterClose: function () {
      if (loopIsOver && newImagesLoaded) {
        setUpFancyBox();
        $('#images-container a').first().click();
      }
    },
    buttons: ['slideShow', 'fullScreen', 'close'],
    image: {preload: true},
    transitionEffect: 'fade',
    transitionDuration: 1000,
    fullScreen: {autoStart: false},
    // Automatically advance after 45s to next photo.
    slideShow: {autoStart: true, speed: 45000},
    // Display the contents figcaption element as the caption of an image
    caption: function (instance, item) {
      return $(this).find('figcaption').html();
    }
  });
}