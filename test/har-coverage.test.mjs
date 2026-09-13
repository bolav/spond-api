import assert from 'node:assert/strict'
import test from 'node:test'
import { Spond } from '../dist/spond.js'

const cases = [
  ['getProfile', 'profile'], ['getProfileHash', 'profile/hash'],
  ['getProfileFundraising', 'profile/fundraising'], ['getFavoriteGroups', 'groups/favorites'],
  ['getGroupSignupRequests', 'groupSignupCode/myRequests'], ['getPostsBadge', 'posts/badge'],
  ['getClock', 'clock'], ['getConfig', 'config'],
  ['getUploadRestrictions', '/storage/upload/restrictions'],
  ['getActivitiesSummary', 'activities/summary', { lang: 'en' }, { lang: 'en' }],
  ['getPosts', 'posts', { type: 'PLAIN', includeComments: false, includeReadStatus: true, includeSeenCount: true, max: 0 },
    { type: 'PLAIN', includeComments: 'false', includeReadStatus: 'true', includeSeenCount: 'true', max: '0' }],
  ['getUnansweredPosts', 'posts/unanswered', { prevId: 'a/b', maxTimestamp: new Date('2026-01-01T00:00:00Z'), max: 10 },
    { prevId: 'a/b', maxTimestamp: '2026-01-01T00:00:00.000Z', max: '10' }],
  ['getPostsSeenCount', 'seen/postsCount', { ids: ['a/b', 'c&d'] }, { ids: 'a/b,c&d' }],
  ['markPostsSeen', 'seen/posts', { ids: ['post-1', 'post-2'] }, {}, 'POST', ['post-1', 'post-2']],
  ['markEventsSeen', 'seen/sponds', { ids: ['event-1'] }, {}, 'POST', ['event-1']],
  ['testAuthentication', 'test']
]

test('new routes preserve query values, authentication, and captured body formats', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  for (const [name, path, args, query = {}, method = 'GET', body] of cases) {
    const client = new Spond('unused', 'unused')
    client.token = 'token'
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url)
      assert.equal(parsed.origin, 'https://api.spond.com')
      assert.equal(parsed.pathname, path.startsWith('/') ? path : `/core/v1/${path}`)
      assert.deepEqual(Object.fromEntries(parsed.searchParams), query)
      assert.equal(options.method, method)
      assert.equal(options.headers.Authorization, 'Bearer token')
      assert.equal(options.headers['api-level'], '2.7.9')
      assert.deepEqual(options.body === undefined ? undefined : JSON.parse(options.body), body)
      return Response.json({ result: name })
    }
    assert.deepEqual(await client[name](args), { result: name })
  }
})

test('chat badge authenticates core and chat sessions and uses the supplied chat URL', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const client = new Spond('unused', 'unused')
  let logins = 0
  client.login = async () => { logins++; client.token = 'token' }
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    assert.equal(options.headers.Authorization, 'Bearer token')
    if (options.method === 'POST') {
      return Response.json({ url: 'https://api.spond.com/chat/v1/', auth: 'chat-token' })
    }
    assert.equal(options.headers.auth, 'chat-token')
    return Response.json({ badge: 2 })
  }
  assert.deepEqual(await client.getChatBadge(), { badge: 2 })
  await client.getChatBadge()
  assert.equal(logins, 1)
  assert.deepEqual(calls, ['https://api.spond.com/core/v1/chat',
    'https://api.spond.com/chat/v1/chats/badge', 'https://api.spond.com/chat/v1/chats/badge'])
})

test('event flags and descending order are supported while defaults stay compatible', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const client = new Spond('unused', 'unused')
  client.token = 'token'
  const queries = []
  globalThis.fetch = async (url) => { queries.push(Object.fromEntries(new URL(url).searchParams)); return Response.json([]) }
  await client.getEvents()
  await client.getEvents({ includeComments: false, includeHidden: true, addProfileInfo: false, order: 'desc' })
  assert.deepEqual(queries, [
    { order: 'asc', max: '100', scheduled: 'false' },
    { order: 'desc', max: '100', scheduled: 'false', includeComments: 'false', includeHidden: 'true', addProfileInfo: 'false' }
  ])
})

test('new authenticated methods log in, and the probe reports 401 without logging in', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const client = new Spond('unused', 'unused')
  let logins = 0
  client.login = async () => { logins++; client.token = 'token' }
  globalThis.fetch = async () => Response.json({ id: 'profile' })
  await client.getProfile()
  assert.equal(logins, 1)
  client.token = null
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401 })
  await assert.rejects(client.testAuthentication(), /HTTP 401/)
  assert.equal(logins, 1)
  globalThis.fetch = async () => new Response(null, { status: 204 })
  client.token = 'token'
  assert.equal(await client.markPostsSeen({ ids: [] }), undefined)
})

// Successful GET /posts from the new HAR, without using its credentials or data.
test('posts defaults reproduce the successful browser request and support partial overrides', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const client = new Spond('unused', 'unused')
  client.token = 'token'
  const expected = {
    type: 'PLAIN', includeComments: 'true', includeReadStatus: 'true',
    includeSeenCount: 'true', max: '5'
  }
  const calls = []
  globalThis.fetch = async (url) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/core/v1/posts')
    const query = Object.fromEntries(parsed.searchParams)
    calls.push(query)
    // Model the server rejecting a posts request without its type selector.
    if (!query.type) return new Response(null, { status: 400 })
    return Response.json([{ id: 'post-1' }])
  }
  assert.deepEqual(await client.getPosts(), [{ id: 'post-1' }])
  await client.getPosts({})
  await client.getPosts({ max: 50, includeComments: false })
  await client.getPosts({ type: 'CUSTOM', includeSeenCount: false })
  assert.deepEqual(calls, [expected, expected,
    { ...expected, max: '50', includeComments: 'false' },
    { ...expected, type: 'CUSTOM', includeSeenCount: 'false' }])
})
