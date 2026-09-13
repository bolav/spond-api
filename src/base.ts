import fetch from 'node-fetch'

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export abstract class SpondBase {
  private _username: string
  private _password: string
  private _api_url: string
  private _token: string | null
  private _tokenExpiration: number | null
  private _session: typeof fetch

  constructor(username: string, password: string, api_url: string) {
    this._username = username
    this._password = password
    this._api_url = api_url
    this._token = null
    this._tokenExpiration = null
    this._session = fetch
  }

  get username(): string {
    return this._username
  }

  set username(value: string) {
    this._username = value
  }

  get password(): string {
    return this._password
  }

  set password(value: string) {
    this._password = value
  }

  get apiUrl(): string {
    return this._api_url
  }

  set apiUrl(value: string) {
    this._api_url = value
  }

  get token(): string | null {
    return this._token
  }

  set token(value: string | null) {
    this._token = value
    this._tokenExpiration = null
  }

  get authHeaders(): { [key: string]: string } {
    return {
      'content-type': 'application/json',
      'api-level': '2.7.9',
      'Authorization': `Bearer ${this.token}`
    }
  }

  static requireAuthentication(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function(this: SpondBase, ...args: any[]) {
      if (!this.token || (this._tokenExpiration !== null && Date.now() >= this._tokenExpiration)) {
        try {
          await this.login()
        } catch (e) {
          throw e
        }
      }
      return await originalMethod.apply(this, args)
    }

    return descriptor
  }

  async login(): Promise<void> {
    const login_url = `${this.apiUrl}auth2/login`
    const data = { email: this.username, password: this.password }
    this.token = null

    const response = await this._session(login_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new AuthenticationError(`Login failed (HTTP ${response.status}).`)
    }

    const login_result: any = await response.json()
    const accessToken = login_result?.accessToken

    if (typeof accessToken?.token !== 'string' || !accessToken.token) {
      throw new AuthenticationError('Login failed. Response did not contain an access token.')
    }

    this.token = accessToken.token
    const expiration = Date.parse(accessToken.expiration)
    this._tokenExpiration = Number.isFinite(expiration) ? expiration : null
  }
}
