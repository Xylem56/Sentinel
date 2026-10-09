import { getNumericPrefix } from 'node-pg-migrate/utils/fileNameUtils';

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
    pgm.createTable ('location_history', {
        id: {type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()')},
        user_id: {type: 'UUID', notNull: true, references: 'users', onDelete: 'CASCADE'},
        latitude: {type: 'NUMERIC(9,6)', notNull: true},
        longitude: {type: 'NUMERIC(9,6)', notNull: true},
        last_seen_at: {type: 'TIMESTAMPZ', notNull: true, default: pgm.func('now()')},


    })
    pgm.createIndex('location_history', 'user_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('location_history');
};
