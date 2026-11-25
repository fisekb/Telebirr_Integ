'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('Users', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      username: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(100), allowNull: false },
      fullName: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(12), allowNull: false, unique: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addConstraint('Users', {
      fields: ['phone'],
      type: 'check',
      name: 'users_phone_format',
      where: queryInterface.sequelize.literal(`"phone" ~ '^251[79][0-9]{8}$'`)
    });

    await queryInterface.createTable('Payments', {
      txId: { type: DataTypes.STRING(10), primaryKey: true, allowNull: false },
      amountSantim: { type: DataTypes.INTEGER, allowNull: false },
      payerName: { type: DataTypes.STRING(120), allowNull: true },
      payerLast4: { type: DataTypes.STRING(4), allowNull: true },
      paidAt: { type: DataTypes.DATE, allowNull: true },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      creditedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['amountSantim'],
      type: 'check',
      name: 'payments_amount_positive',
      where: { amountSantim: { [require('sequelize').Op.between]: [1, 2147483647] } }
    });
    await queryInterface.addConstraint('Payments', {
      fields: ['userId', 'creditedAt'],
      type: 'check',
      name: 'payments_credit_fields_consistent',
      where: queryInterface.sequelize.literal(
        `("userId" IS NULL AND "creditedAt" IS NULL) OR ("userId" IS NOT NULL AND "creditedAt" IS NOT NULL)`
      )
    });
    await queryInterface.addIndex('Payments', ['userId', 'creditedAt'], { name: 'payments_user_credit_idx' });

    await queryInterface.createTable('ManualRequests', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      txId: { type: DataTypes.STRING(10), allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'pending' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reviewedAt: { type: DataTypes.DATE, allowNull: true }
    });
    await queryInterface.addConstraint('ManualRequests', {
      fields: ['status'],
      type: 'check',
      name: 'manual_requests_status_valid',
      where: { status: ['pending', 'approved', 'rejected'] }
    });
    await queryInterface.addConstraint('ManualRequests', {
      fields: ['txId'],
      type: 'check',
      name: 'manual_requests_tx_id_format',
      where: queryInterface.sequelize.literal(`"txId" ~ '^[A-Z0-9]{10}$'`)
    });
    await queryInterface.addIndex('ManualRequests', ['userId', 'status'], {
      name: 'manual_requests_user_status_idx'
    });
    await queryInterface.addIndex('ManualRequests', ['userId', 'txId'], {
      name: 'manual_requests_one_pending_per_user_tx',
      unique: true,
      where: { status: 'pending' }
    });

    await queryInterface.createTable('SmsLogs', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      parsed: { type: DataTypes.BOOLEAN, allowNull: false },
      receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SmsLogs');
    await queryInterface.dropTable('ManualRequests');
    await queryInterface.dropTable('Payments');
    await queryInterface.dropTable('Users');
  }
};
