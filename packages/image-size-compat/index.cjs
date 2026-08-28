'use strict';

const { readFileSync } = require('node:fs');
const imageSizeNext = require('image-size-next');

const imageSize = input =>
  imageSizeNext.imageSize(typeof input === 'string' ? readFileSync(input) : input);

// Granite and Metro still consume the callable CommonJS API from image-size 0.x/1.x.
module.exports = imageSize;
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
module.exports.disableTypes = imageSizeNext.disableTypes;
module.exports.types = imageSizeNext.types;
