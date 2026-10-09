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
    pgm.createTable('users', {
        id: { type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
        current_balance: { type: 'NUMERIC(14,2)', notNull: true, default: 0 },
        created_at: { type: 'TIMESTAMPZ', notNull: true, default: pgm.func('NOW()') },
        updated_at: { type: 'TIMESTAMPZ', notNull: true, default: pgm.func('NOW()') }
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
pgm.dropTable('users');
};
