/**
 * Typed fixtures for the web suite (plan item 4.2).
 *
 * `createSeed()` returns a fresh, self-consistent workspace: one signed-in owner, three sites
 * (owned / shared-as-viewer / favourite), folders and files with tags, site members, a user group,
 * access keys and Better Auth sessions. Tests mutate their own copy freely.
 */
import type {
  AccessKey,
  Account,
  AuthSession,
  FileItem,
  Folder,
  Session,
  Site,
  User,
  UserGroup,
} from '../../../src-web/src/types/domain'

/** A Mongo ObjectId-shaped id (the contracts-core request schemas validate ids). */
export const oid = (n: number) => `66${n.toString(16).padStart(22, '0')}`

/** Readable names for every seeded entity id. */
export const ID = {
  me: oid(0x01),
  grace: oid(0x02),
  alan: oid(0x03),
  handbook: oid(0x10),
  wiki: oid(0x11),
  partner: oid(0x12),
  policies: oid(0x20),
  archive: oid(0x21),
  archive2024: oid(0x22),
  welcome: oid(0x30),
  roadmap: oid(0x31),
  leave: oid(0x32),
  travel: oid(0x33),
  oldPlan: oid(0x34),
  nda: oid(0x35),
  groupEng: oid(0x40),
} as const

export const ME = { id: ID.me, email: 'ada@example.test', name: 'Ada Lovelace' } as const

/** Fixed instants so lists sort deterministically. Relative labels ("2 hours ago") are not asserted. */
export const T = {
  older: '2026-03-01T09:00:00.000Z',
  old: '2026-04-10T09:00:00.000Z',
  recent: '2026-05-01T10:00:00.000Z',
  newest: '2026-05-02T15:30:00.000Z',
}

export function file(id: string, name: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    id,
    name,
    key: `keys/${id}`,
    size: 1024,
    contentType: 'application/pdf',
    uploadedAt: T.recent,
    updatedAt: T.recent,
    tags: [],
    ...overrides,
  }
}

export function folder(
  id: string,
  name: string,
  files: FileItem[] = [],
  overrides: Partial<Folder> = {},
): Folder {
  return { id, name, files, createdAt: T.old, updatedAt: T.old, ...overrides }
}

export interface Seed {
  session: Session
  profile: User
  account: Account
  sites: Site[]
  suppressedSites: Site[]
  users: User[]
  userGroups: UserGroup[]
  accessKeys: AccessKey[]
  authSessions: AuthSession[]
  currentSessionId: string
}

export function createSeed(): Seed {
  const handbook: Site = {
    id: ID.handbook,
    name: 'Product Handbook',
    icon: 'fa-book',
    visibility: 'private',
    owned: true,
    currentUserRole: 'owner',
    tags: ['docs', 'internal'],
    members: [
      { userId: ME.id, role: 'owner' },
      { userId: ID.grace, role: 'editor' },
      { userId: ID.alan, role: 'viewer' },
    ],
    attributes: { ai: { chatEnabled: true, mcpEnabled: false }, notifications: true },
    createdAt: T.older,
    updatedAt: T.newest,
    files: [
      file(ID.welcome, 'welcome.md', { contentType: 'text/markdown', size: 2048, tags: ['intro'] }),
      file(ID.roadmap, 'Roadmap.pdf', { size: 512_000, updatedAt: T.newest, tags: ['planning', 'q3'] }),
    ],
    folders: [
      folder(ID.policies, 'Policies', [
        file(ID.leave, 'Leave policy.pdf', { size: 80_000, tags: ['hr'] }),
        file(ID.travel, 'Travel.docx', {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 40_000,
        }),
      ]),
      folder(ID.archive, 'Archive', [], { updatedAt: T.older }),
      folder(ID.archive2024, '2024', [file(ID.oldPlan, 'Old plan.pdf')], { parentId: ID.archive }),
    ],
  }
  const wiki: Site = {
    id: ID.wiki,
    name: 'Engineering Wiki',
    visibility: 'public',
    owned: true,
    currentUserRole: 'owner',
    tags: [],
    members: [{ userId: ME.id, role: 'owner' }],
    attributes: {},
    createdAt: T.old,
    updatedAt: T.old,
    files: [],
    folders: [],
  }
  const partner: Site = {
    id: ID.partner,
    name: 'Partner Data Room',
    visibility: 'private',
    owned: false,
    currentUserRole: 'viewer',
    tags: ['external'],
    members: [
      { userId: ID.grace, role: 'owner' },
      { userId: ME.id, role: 'viewer' },
    ],
    attributes: {},
    createdAt: T.older,
    updatedAt: T.recent,
    files: [file(ID.nda, 'NDA.pdf', { size: 120_000 })],
    folders: [],
  }

  const profile: User = {
    id: ME.id,
    email: ME.email,
    displayName: ME.name,
    roles: ['owner'],
    attributes: {
      timeZone: 'Europe/London',
      sites: { favourites: [ID.handbook], autoAcceptInvites: false, suppressedSites: [] },
      notifications: {
        frequency: 'daily',
        hours: ['09:00', '17:00'],
        days: ['monday', 'wednesday'],
        subscribedActions: ['uploaded', 'deleted'],
      },
    },
  }
  const grace: User = {
    id: ID.grace,
    email: 'grace@example.test',
    displayName: 'Grace Hopper',
    status: 'active',
    lastActive: T.recent,
    sites: [
      { siteId: ID.handbook, name: 'Product Handbook', role: 'editor', expiresAt: null },
      { siteId: ID.partner, name: 'Partner Data Room', role: 'owner', expiresAt: null },
    ],
  }
  const alan: User = {
    id: ID.alan,
    email: 'alan@example.test',
    displayName: 'Alan Turing',
    status: 'invited',
    sites: [{ siteId: ID.handbook, name: 'Product Handbook', role: 'viewer', expiresAt: T.newest }],
  }
  const me: User = {
    ...profile,
    status: 'active',
    lastActive: T.newest,
    sites: [
      { siteId: ID.handbook, name: 'Product Handbook', role: 'owner' },
      { siteId: ID.wiki, name: 'Engineering Wiki', role: 'owner' },
    ],
  }

  const now = Date.now()
  const authSessions: AuthSession[] = [
    {
      id: 'sess-current',
      token: 'tok-current',
      userId: ME.id,
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 6 * 86_400_000).toISOString(),
      ipAddress: '198.51.100.4',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    {
      id: 'sess-phone',
      token: 'tok-phone',
      userId: ME.id,
      createdAt: new Date(now - 3 * 86_400_000).toISOString(),
      updatedAt: new Date(now - 2 * 3_600_000).toISOString(),
      expiresAt: new Date(now + 4 * 86_400_000).toISOString(),
      ipAddress: '203.0.113.7',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  ]

  return {
    session: { user: { ...ME } },
    profile,
    account: { id: 'account-1', name: "Ada's Workspace" },
    sites: [handbook, wiki, partner],
    suppressedSites: [],
    users: [me, grace, alan],
    userGroups: [{ id: ID.groupEng, name: 'Engineering', users: [ID.grace], members: [grace] }],
    accessKeys: [
      {
        id: 'key-1',
        name: 'Claude Desktop',
        keyType: 'mcp',
        scopes: ['mcp:read'],
        isActive: true,
        createdAt: T.old,
        lastUsedAt: T.recent,
        expiresAt: null,
      },
    ],
    authSessions,
    currentSessionId: 'sess-current',
  }
}
