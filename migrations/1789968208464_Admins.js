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
    pgm.createTable('admins', {
        id: {type:  'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()')},
        email: {type: 'TEXT', notNull: true},
        hashed_password: {type: 'TEXT', notNull: true},
        created_at: {type: 'TIMESTAMPZ', notNull: true, default: pgm.func('NOW()')},


    })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('admins');
};
