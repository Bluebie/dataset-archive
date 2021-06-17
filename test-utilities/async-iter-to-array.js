// utility, given an async iterable, eventually returns an array of everything it output in order
export default async function asyncIterableToArray (iter) {
  const arr = []
  for await (const val of iter) arr.push(val)
  return arr
}
