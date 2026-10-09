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
    pgm.createTable('api_clients', {
        id: { type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
        client_name: { type: 'TEXT', notNull: true },
        hashed_key: { type: 'TEXT', notNull: true },
        created_at: { type: 'TIMESTAMPZ', notNull: true, default: pgm.func('NOW()') },
    });
    pgm.createIndex('api_clients', 'hashed_key', { unique: true });
};


/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('api_clients');
};
