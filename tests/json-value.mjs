// Independent bridge fixture validation. Do not JSON.stringify before this
// check: doing so would hide the undefined values that structured clone keeps.
export function assertJsonValue(value, path = 'message') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertJsonValue(value[index], `${path}[${index}]`)
    return
  }
  if (value && Object.prototype.toString.call(value) === '[object Object]') {
    for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${path}.${key}`)
    return
  }
  throw new Error(`Non-JSON value at ${path}: ${typeof value}`)
}
