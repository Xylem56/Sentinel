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
    pgm.createTable('audit_logs', {
        id: {type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()')},
        transaction_id: {type: 'UUID', references: 'transactions', onDelete: 'SET NULL'},
        event_type: {type: 'TEXT', notNull: true, defualt: 'decision'},
        decision: {type: 'TEXT'},
        reasons: {type: 'JSONB'},
        previous_hash: {type: 'TEXT'},
        current_hash: {type: 'TEXT', notNull: true},
        created_at: {type: 'TIMESTAMPZ', notNull: true, default: pgm.func('now()')},


    });
    pgm.createIndex('audit_logs', 'transaction_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('audit_logs');
};
