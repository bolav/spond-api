import assert from 'node:assert/strict'
import test from 'node:test'
import { SpondBase } from '../dist/base.js'

const apiUrl = 'https://api.spond.com/core/v1/'

function clientWithSession(session) {
  const client = new SpondBase('user@example.com', 'test-password', apiUrl)
  client._session = session
  return client
}

function authenticatedHeaders(client) {
  const descriptor = {
    value: async function () { return this.authHeaders }
  }
  SpondBase.requireAuthentication(null, 'headers', descriptor)
  return descriptor.value.call(client)
}

test('logs in with auth2 and uses the access token for authenticated requests', async () => {
  let loginCount = 0
  const client = clientWithSession(async (url, options) => {
    loginCount++
    assert.equal(url, `${apiUrl}auth2/login`)
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), {
      email: 'user@example.com', password: 'test-password'
    })
    return new Response(JSON.stringify({
      accessToken: { token: 'access-token', expiration: new Date(Date.now() + 86400000).toISOString() },
      refreshToken: { token: 'refresh-token', expiration: '2099-01-01T00:00:00Z' },
      passwordToken: { token: 'password-token', expiration: '2099-01-01T00:00:00Z' }
    }))
  })

  assert.equal((await authenticatedHeaders(client)).Authorization, 'Bearer access-token')
  await authenticatedHeaders(client)
  assert.equal(loginCount, 1)
})

test('logs in again before a request when the access token expires', async () => {
  let loginCount = 0
  const client = clientWithSession(async () => {
    loginCount++
    return new Response(JSON.stringify({
      accessToken: {
        token: `access-token-${loginCount}`,
        expiration: new Date(Date.now() + (loginCount === 1 ? -1000 : 86400000)).toISOString()
      }
    }))
  })

  await client.login()
  assert.equal((await authenticatedHeaders(client)).Authorization, 'Bearer access-token-2')
  assert.equal(loginCount, 2)
})

test('manually supplied tokens still skip login', async () => {
  const client = clientWithSession(async () => { assert.fail('Unexpected login') })
  client.token = 'manual-token'
  assert.equal((await authenticatedHeaders(client)).Authorization, 'Bearer manual-token')
})

test('HTTP login errors are reported even when the response is not JSON', async () => {
  const client = clientWithSession(async () => new Response('Unauthorized', { status: 401 }))
  client.token = 'old-token'
  await assert.rejects(client.login(), {
    name: 'AuthenticationError', message: 'Login failed (HTTP 401).'
  })
  assert.equal(client.token, null)
})

test('missing or invalid access tokens fail without disclosing the response', async () => {
  for (const result of [null, {}, { loginToken: 'old-format' },
    { accessToken: { token: '' } }, { accessToken: { token: 123 } },
    { refreshToken: { token: 'sensitive-token' } }]) {
    const client = clientWithSession(async () => new Response(JSON.stringify(result)))
    await assert.rejects(client.login(), {
      name: 'AuthenticationError',
      message: 'Login failed. Response did not contain an access token.'
    })
    assert.equal(client.token, null)
  }
})
