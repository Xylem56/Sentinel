/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => { pgm.createTable('device_history', {
    id: { type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'UUID', notNull: true, references: 'users', onDelete: 'CASCADE' },
    device_id: { type: 'TEXT', notNull: true },
    last_seen_at: { type: 'TIMESTAMPTZ', notNull: true, default: pgm.func('now()') },
  });
   pgm.createIndex('device_history', ['user_id', 'device_id'], { unique: true });

};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('device_history');
};
