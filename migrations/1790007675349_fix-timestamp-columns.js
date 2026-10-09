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
    pgm.alterColumn('admins', 'created_at', { type: 'TIMESTAMPTZ' });
  pgm.alterColumn('location_history', 'last_seen_at', { type: 'TIMESTAMPTZ' });
  pgm.alterColumn('amount_baseline', 'last_updated_at', { type: 'TIMESTAMPTZ' });
  pgm.alterColumn('flagged_recipients', 'flagged_at', { type: 'TIMESTAMPTZ' });
  pgm.alterColumn('audit_logs', 'created_at', { type: 'TIMESTAMPTZ' });
  pgm.alterColumn('amount_baseline', 'min_amount', { notNull: true });
  pgm.renameColumn('audit_logs', 'reason', 'reasons');

};


/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {};
