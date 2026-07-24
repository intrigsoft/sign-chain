import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    name: text('name'),
    authProvider: text('auth_provider').notNull().default('email'),
    providerId: text('provider_id'),
    walletAddress: text('wallet_address').unique(),
    anchorCount: integer('anchor_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('users_auth_provider_provider_id').on(
      t.authProvider,
      t.providerId
    ),
  ]
);

export const sessions = sqliteTable('sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

export const magicLinks = sqliteTable('magic_links', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  code: text('code').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  used: integer('used', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

export const anchors = sqliteTable('anchors', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  txHash: text('tx_hash').notNull().unique(),
  compositeHash: text('composite_hash').notNull(),
  encryptedPayload: text('encrypted_payload').notNull(),
  userId: text('user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

export const cloudSignatures = sqliteTable(
  'cloud_signatures',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    base64Png: text('base64_png').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (t) => [index('cloud_signatures_user_id').on(t.userId)]
);

export const cloudTextSnippets = sqliteTable(
  'cloud_text_snippets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    text: text('text').notNull(),
    fontSize: real('font_size').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (t) => [index('cloud_text_snippets_user_id').on(t.userId)]
);
