import { SpondBase } from './base.js';

interface GetGroupsParams {
  uid?: string;
}

interface GetPersonParams {
  user?: string;
}

export interface GetEventsParams {
  groupId?: string;
  subgroupId?: string;
  includeScheduled?: boolean;
  maxEnd?: Date;
  minEnd?: Date;
  maxStart?: Date;
  minStart?: Date;
  maxEvents?: number;
  includeComments?: boolean;
  includeHidden?: boolean;
  addProfileInfo?: boolean;
  order?: 'asc' | 'desc';
}

export interface GetPostsParams {
  type?: string;
  includeComments?: boolean;
  includeReadStatus?: boolean;
  includeSeenCount?: boolean;
  max?: number;
}

export interface GetUnansweredPostsParams extends GetPostsParams {
  prevId?: string;
  maxTimestamp?: Date | string;
}

interface UpdateEventParams {
  uid: string;
  updates: any;
}

export class Spond extends SpondBase {
  private _chatUrl: string | null;
  private _auth: string | null;
  private _groups: any[];
  private _events: any[];

  constructor(username: string, password: string) {
    super(username, password, 'https://api.spond.com/core/v1/');
    this._chatUrl = null;
    this._auth = null;
    this._groups = [];
    this._events = [];
  }

  get chatUrl(): string | null {
    return this._chatUrl;
  }

  set chatUrl(value: string | null) {
    this._chatUrl = value;
  }

  get auth(): string | null {
    return this._auth;
  }

  set auth(value: string | null) {
    this._auth = value;
  }

  get groups(): any[] {
    return this._groups;
  }

  set groups(value: any[]) {
    this._groups = value;
  }

  get events(): any[] {
    return this._events;
  }

  set events(value: any[]) {
    this._events = value;
  }

  private async requestJson(path: string, {
    method = 'GET', params = {}, body, headers = this.authHeaders
  }: {
    method?: string;
    params?: object;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}): Promise<any> {
    const url = new URL(path, this.apiUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
      }
    }
    const response = await fetch(url.toString(), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Spond request failed (HTTP ${response.status}): ${method} ${url.pathname}`);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }

  @SpondBase.requireAuthentication
  async getProfile(): Promise<any> {
    return this.requestJson('profile');
  }

  @SpondBase.requireAuthentication
  async getProfileHash(): Promise<any> {
    return this.requestJson('profile/hash');
  }

  @SpondBase.requireAuthentication
  async getProfileFundraising(): Promise<any> {
    return this.requestJson('profile/fundraising');
  }

  @SpondBase.requireAuthentication
  async getFavoriteGroups(): Promise<any> {
    return this.requestJson('groups/favorites');
  }

  @SpondBase.requireAuthentication
  async getGroupSignupRequests(): Promise<any> {
    return this.requestJson('groupSignupCode/myRequests');
  }

  @SpondBase.requireAuthentication
  async getPostsBadge(): Promise<any> {
    return this.requestJson('posts/badge');
  }

  @SpondBase.requireAuthentication
  async getClock(): Promise<any> {
    return this.requestJson('clock');
  }

  @SpondBase.requireAuthentication
  async getConfig(): Promise<any> {
    return this.requestJson('config');
  }

  @SpondBase.requireAuthentication
  async getUploadRestrictions(): Promise<any> {
    return this.requestJson('/storage/upload/restrictions');
  }

  @SpondBase.requireAuthentication
  async getActivitiesSummary({ lang }: { lang?: string } = {}): Promise<any> {
    return this.requestJson('activities/summary', { params: { lang } });
  }

  @SpondBase.requireAuthentication
  async getPosts(params: GetPostsParams = {}): Promise<any> {
    return this.requestJson('posts', { params });
  }

  @SpondBase.requireAuthentication
  async getUnansweredPosts(params: GetUnansweredPostsParams = {}): Promise<any> {
    return this.requestJson('posts/unanswered', { params });
  }

  @SpondBase.requireAuthentication
  async markPostsSeen({ ids }: { ids: string[] }): Promise<any> {
    return this.requestJson('seen/posts', { method: 'POST', body: ids });
  }

  @SpondBase.requireAuthentication
  async markEventsSeen({ ids }: { ids: string[] }): Promise<any> {
    return this.requestJson('seen/sponds', { method: 'POST', body: ids });
  }

  @SpondBase.requireAuthentication
  async getPostsSeenCount({ ids }: { ids: string[] }): Promise<any> {
    return this.requestJson('seen/postsCount', { params: { ids: ids.join(',') } });
  }

  @SpondBase.requireAuthentication
  async getChatBadge(): Promise<any> {
    if (!this.auth) await this.loginChat();
    const url = `${this.chatUrl!.replace(/\/$/, '')}/chats/badge`;
    return this.requestJson(url, { headers: { ...this.authHeaders, auth: this.auth ?? '' } });
  }

  // Probe the current token without automatically logging in; HTTP 401 rejects.
  async testAuthentication(): Promise<any> {
    return this.requestJson('test');
  }

  @SpondBase.requireAuthentication
  async loginChat(): Promise<void> {
    const result = await this.requestJson('chat', { method: 'POST' });
    this.chatUrl = result.url;
    this.auth = result.auth;
  }

  @SpondBase.requireAuthentication
  async getGroups({ uid }: GetGroupsParams = {}): Promise<any[]> {
    const url = `${this.apiUrl}groups/`;
    const response = await fetch(url, { method: 'GET', headers: this.authHeaders });
    this.groups = await response.json();
    return this.groups ?? [];
  }

  @SpondBase.requireAuthentication
  async getGroup({ uid }: { uid: string }): Promise<any> {
    if (!this.groups) {
      await this.getGroups({});
    }
    for (const group of this.groups) {
      if (group.id === uid) {
        return group;
      }
    }
    throw new Error(`No group with id='${uid}'.`);
  }

  @SpondBase.requireAuthentication
  async getPerson({ user }: GetPersonParams): Promise<any> {
    if (!this.groups) {
      await this.getGroups({});
    }
    for (const group of this.groups) {
      for (const member of group.members) {
        if (
          member.id === user ||
          (member.email && member.email === user) ||
          `${member.firstName} ${member.lastName}` === user ||
          (member.profile && member.profile.id === user)
        ) {
          return member;
        }
        if (member.guardians) {
          for (const guardian of member.guardians) {
            if (
              guardian.id === user ||
              (guardian.email && guardian.email === user) ||
              `${guardian.firstName} ${guardian.lastName}` === user ||
              (guardian.profile && guardian.profile.id === user)
            ) {
              return guardian;
            }
          }
        }
      }
    }
    throw new Error(`No person matched with identifier '${user}'.`);
  }

  @SpondBase.requireAuthentication
  async getMessages(): Promise<any[]> {
    if (!this.auth) {
      await this.loginChat();
    }
    const url = `${this.chatUrl}/chats/?max=10`;
    const response = await fetch(url, { method: 'GET', headers: { ...this.authHeaders, 'auth': this.auth ?? '' } });
    return await response.json();
  }

  @SpondBase.requireAuthentication
  async continueChat({ chatId, text }: { chatId: string, text: string }): Promise<any> {
    if (!this.auth) {
      await this.loginChat();
    }
    const url = `${this.chatUrl}/messages`;
    const data = { chatId, text, type: 'TEXT' };
    const response = await fetch(url, { method: 'POST', headers: { ...this.authHeaders, 'auth': this.auth ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return await response.json();
  }

  @SpondBase.requireAuthentication
  async sendMessage({ text, user, groupUid, chatId }: { text: string, user?: string, groupUid?: string, chatId?: string }): Promise<any> {
    if (!this.auth) {
      await this.loginChat();
    }

    if (chatId) {
      return this.continueChat({ chatId, text });
    } else if (!groupUid || !user) {
      return { error: 'wrong usage, groupId and userId needed or continue chat with chatId' };
    }

    const userObj = await this.getPerson({ user });
    if (userObj) {
      const userUid = userObj.profile.id;
      const url = `${this.chatUrl}/messages`;
      const data = { text, type: 'TEXT', recipient: userUid, groupId: groupUid };
      const response = await fetch(url, { method: 'POST', headers: { ...this.authHeaders, 'auth': this.auth ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return await response.json();
    } else {
      return false;
    }
  }

  @SpondBase.requireAuthentication
  async getEvents({ groupId, subgroupId, includeScheduled = false, maxEnd, minEnd, maxStart, minStart, maxEvents = 100, includeComments, includeHidden, addProfileInfo, order = 'asc' }: GetEventsParams = {}): Promise<any[]> {
    const url = `${this.apiUrl}sponds/`;
    const params: { [key: string]: string } = {
      'order': order,
      'max': maxEvents.toString(),
      'scheduled': includeScheduled.toString()
    };

    for (const [key, value] of Object.entries({ includeComments, includeHidden, addProfileInfo })) {
      if (value !== undefined) params[key] = String(value);
    }

    if (maxEnd) {
      params['maxEndTimestamp'] = maxEnd.toISOString();
    }
    if (maxStart) {
      params['maxStartTimestamp'] = maxStart.toISOString();
    }
    if (minEnd) {
      params['minEndTimestamp'] = minEnd.toISOString();
    }
    if (minStart) {
      params['minStartTimestamp'] = minStart.toISOString();
    }
    if (groupId) {
      params['groupId'] = groupId;
    }
    if (subgroupId) {
      params['subgroupId'] = subgroupId;
    }

    const urlWithParams = new URL(url);
    for (const key in params) {
      urlWithParams.searchParams.append(key, params[key]);
    }
    const response = await fetch(urlWithParams.toString(), { method: 'GET', headers: this.authHeaders });
    this.events = await response.json();
    return this.events;
  }

  @SpondBase.requireAuthentication
  async getEvent({ uid }: { uid: string }): Promise<any> {
    if (!this.events) {
      await this.getEvents({});
    }
    for (const event of this.events) {
      if (event.id === uid) {
        return event;
      }
    }
    throw new Error(`No event with id='${uid}'.`);
  }

  @SpondBase.requireAuthentication
  async updateEvent({ uid, updates }: UpdateEventParams): Promise<any> {
    if (!this.events) {
      await this.getEvents({});
    }

    let baseEvent: any = {
      heading: null,
      description: null,
      spondType: 'EVENT',
      startTimestamp: null,
      endTimestamp: null,
      commentsDisabled: false,
      maxAccepted: 0,
      rsvpDate: null,
      location: {
        id: null,
        feature: null,
        address: null,
        latitude: null,
        longitude: null
      },
      owners: [{ id: null }],
      visibility: 'INVITEES',
      participantsHidden: false,
      autoReminderType: 'DISABLED',
      autoAccept: false,
      payment: {},
      attachments: [],
      id: null,
      tasks: {
        openTasks: [],
        assignedTasks: [{
          name: null,
          description: '',
          type: 'ASSIGNED',
          id: null,
          adultsOnly: true,
          assignments: { memberIds: [], profiles: [], remove: [] }
        }]
      }
    };

    for (const key in baseEvent) {
      if (this.events[0][key] && !updates[key]) {
        baseEvent[key] = this.events[0][key];
      } else if (updates[key]) {
        baseEvent[key] = updates[key];
      }
    }

    const data = { ...baseEvent };
    const url = `${this.apiUrl}sponds/${uid}`;
    const response = await fetch(url, { method: 'POST', headers: this.authHeaders, body: JSON.stringify(data) });
    this.events = await response.json();
    return this.events;
  }

  @SpondBase.requireAuthentication
  async getEventAttendanceXlsx({ uid }: { uid: string }): Promise<Buffer> {
    const url = `${this.apiUrl}sponds/${uid}/export`;
    const response = await fetch(url, { method: 'GET', headers: this.authHeaders });
    const buffer = await (response as Response & { buffer: () => Promise<Buffer> }).buffer();
    return buffer;
  }

  @SpondBase.requireAuthentication
  async changeResponse({ uid, user, payload }: { uid: string, user: string, payload: any }): Promise<any> {
    const url = `${this.apiUrl}sponds/${uid}/responses/${user}`;
    const response = await fetch(url, { method: 'PUT', headers: this.authHeaders, body: JSON.stringify(payload) });
    return await response.json();
  }
}
