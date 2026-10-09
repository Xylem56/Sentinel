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
    pgm.createTable('transactions', {
    id: { type: 'UUID', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'UUID', notNull: true, references: 'users', onDelete: 'CASCADE' },
    amount: { type: 'NUMERIC(14,2)', notNull: true },
    device_id: { type: 'TEXT', notNull: true },
    latitude: { type: 'NUMERIC(9,6)', notNull: true },
    longitude: { type: 'NUMERIC(9,6)', notNull: true },
    recipient_account: { type: 'TEXT', notNull: true },
    balance_at_time: { type: 'NUMERIC(14,2)', notNull: true },
    idempotency_key: { type: 'TEXT', unique: true },
    decision: { type: 'TEXT', notNull: true, check: "decision IN ('approve','challenge','block')" },
    risk_score: { type: 'INTEGER', notNull: true },
    reasons: { type: 'JSONB', notNull: true, default: pgm.func("'[]'::jsonb") },
    created_at: { type: 'TIMESTAMPTZ', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('transactions', ['user_id', 'created_at']);

};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable ('transactions');
};
