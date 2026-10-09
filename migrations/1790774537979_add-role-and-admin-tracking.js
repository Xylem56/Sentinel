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
    pgm.addColumn('admins', {
        role: {type: 'TEXT', notNull: true, default: 'admin'},
    });
    pgm.addColumn ('audit_logs', {
        admin_id: {type: 'UUID', references: 'admins', onDelete: 'sET NULL'},
    })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropColumn ('audit_logs', 'admin_id');
    pgm.dropColumn ('admins', 'role');
};
