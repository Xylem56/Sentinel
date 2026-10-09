/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    pgm.createTable('flagged_recipients', {
        id:{type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()')},
        recipient_account: { type: 'TEXT', notNull: true, unique: true},
        reason: {type: 'TEXT'},
        flagged_at: { type: 'TIMESTAMPZ', notNull: true, default: pgm.func('now()')},
    })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('flagged_accounts');
};
