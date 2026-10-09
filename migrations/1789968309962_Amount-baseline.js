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
    pgm.createTable('amount_baseline', {
        id: { type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
        user_id: { type: 'UUID', notNull: true, references: 'users', onDelete: 'CASCADE' },
        min_amount: {type: 'NUMERIC(14,2)', notNUll: true},
        max_amount: {type: 'NUMERIC(14,2)', notNull: true},
        last_updated_at: {type: 'TIMESTAMPZ', notNull: true, default: pgm.func('now()')},

});

};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('amount_baseline');
};
