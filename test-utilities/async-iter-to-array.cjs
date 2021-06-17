'use strict';

// utility, given an async iterable, eventually returns an array of everything it output in order
async function asyncIterableToArray (iter) {
  const arr = [];
  for await (const val of iter) arr.push(val);
  return arr
}

module.exports = asyncIterableToArray;
