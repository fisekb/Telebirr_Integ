const { DataTypes } = require('sequelize');

function defineModels(sequelize) {
  const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    username: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
      validate: { len: [3, 32], is: /^[A-Za-z0-9_]+$/ }
    },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true, len: [1, 120] } },
    phone: {
      type: DataTypes.STRING(12),
      allowNull: false,
      unique: true,
      validate: { is: /^251[79]\d{8}$/ }
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { tableName: 'Users', timestamps: false });

  const Payment = sequelize.define('Payment', {
    txId: { type: DataTypes.STRING(10), primaryKey: true, allowNull: false },
    amountSantim: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    payerName: { type: DataTypes.STRING(120), allowNull: true },
    payerLast4: { type: DataTypes.STRING(4), allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    creditedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { tableName: 'Payments', timestamps: false });

  const ManualRequest = sequelize.define('ManualRequest', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    userId: { type: DataTypes.UUID, allowNull: false },
    txId: { type: DataTypes.STRING(10), allowNull: false, validate: { is: /^[A-Z0-9]{10}$/ } },
    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'rejected']] }
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewedAt: { type: DataTypes.DATE, allowNull: true }
  }, { tableName: 'ManualRequests', timestamps: false });

  const SmsLog = sequelize.define('SmsLog', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    body: { type: DataTypes.TEXT, allowNull: false },
    parsed: { type: DataTypes.BOOLEAN, allowNull: false },
    receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { tableName: 'SmsLogs', timestamps: false });

  User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
  Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(ManualRequest, { foreignKey: 'userId', as: 'manualRequests' });
  ManualRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  return { User, Payment, ManualRequest, SmsLog };
}

module.exports = { defineModels };
