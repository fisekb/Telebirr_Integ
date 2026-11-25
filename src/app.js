const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { Op, UniqueConstraintError } = require('sequelize');
const { formatSantim, normalizeName, parseAdminAmount, parseSms } = require('./money');
const { normalizePhone, requireJson, secretMatches, validTxId } = require('./security');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const MAX_SANTIM = 2147483647;

function createApp({ config, sequelize, models }) {
  const app = express();
  const { User, Payment, ManualRequest, SmsLog } = models;

  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.use(cookieSession({
    name: 'telebirr_session',
    keys: [config.sessionSecret],
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }));

  const smsRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  const userLoginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  });
  const manualRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  });
  const adminLoginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false
  });

  function requireUser(req, res, next) {
    if (!req.session || typeof req.session.userId !== 'string') {
      return res.status(401).json({ error: 'Login required' });
    }
    return next();
  }

  function requireAdmin(req, res, next) {
    if (!req.session || req.session.admin !== true) {
      return res.status(401).json({ error: 'Admin login required' });
    }
    return next();
  }

  async function handleSms(req, res, next) {
    try {
      if (!req.body || req.body.from !== '127') {
        return res.status(200).json({ ok: true, ignored: true });
      }

      const body = typeof req.body.text === 'string' ? req.body.text : '';
      const parsedPayment = parseSms(body);
      await SmsLog.create({ body, parsed: Boolean(parsedPayment) });
      if (!parsedPayment) {
        return res.status(200).json({ ok: true, parsed: false });
      }

      try {
        await sequelize.transaction(async transaction => {
          const candidates = await User.findAll({
            where: { phone: { [Op.like]: `%${parsedPayment.payerLast4}` } },
            transaction
          });
          const matches = candidates.filter(user =>
            normalizeName(user.fullName) === normalizeName(parsedPayment.payerName)
          );
          const creditUser = matches.length === 1 ? matches[0] : null;
          await Payment.create({
            txId: parsedPayment.txId,
            amountSantim: parsedPayment.amountSantim,
            payerName: parsedPayment.payerName,
            payerLast4: parsedPayment.payerLast4,
            paidAt: parsedPayment.paidAt,
            userId: creditUser ? creditUser.id : null,
            creditedAt: creditUser ? new Date() : null
          }, { transaction });
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          return res.status(200).json({ ok: true, parsed: true, duplicate: true });
        }
        throw error;
      }

      return res.status(200).json({ ok: true, parsed: true });
    } catch (error) {
      return next(error);
    }
  }

  app.post(
    '/api/telebirr/sms',
    (req, res, next) => {
      if (!secretMatches(req.get('x-sms-secret'), config.smsSecret)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return next();
    },
    smsRateLimit,
    requireJson,
    express.json({ limit: '10kb' }),
    handleSms
  );

  app.use(express.json({ limit: '10kb' }));

  app.post('/api/signup', requireJson, async (req, res, next) => {
    try {
      const { username, password, fullName } = req.body || {};
      const phone = normalizePhone(req.body && req.body.phone);
      if (
        typeof username !== 'string' ||
        !/^[A-Za-z0-9_]{3,32}$/.test(username) ||
        typeof password !== 'string' ||
        password.length < 10 ||
        Buffer.byteLength(password, 'utf8') > 72 ||
        typeof fullName !== 'string' ||
        fullName.trim().length < 1 ||
        fullName.trim().length > 120 ||
        !phone
      ) {
        return res.status(400).json({ error: 'Please provide valid account details' });
      }

      const user = await User.create({
        username: username.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        fullName,
        phone
      });
      req.session = { userId: user.id };
      return res.status(201).json({ user: { username: user.username } });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return res.status(409).json({ error: 'Username or phone is already registered' });
      }
      return next(error);
    }
  });

  app.post('/api/login', userLoginRateLimit, requireJson, async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const user = await User.findOne({ where: { username: username.toLowerCase() } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      req.session = { userId: user.id };
      return res.json({ user: { username: user.username } });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/logout', requireJson, (req, res) => {
    req.session = null;
    return res.json({ ok: true });
  });

  app.get('/api/dashboard', requireUser, async (req, res, next) => {
    try {
      const user = await User.findByPk(req.session.userId, {
        attributes: ['id', 'username']
      });
      if (!user) {
        req.session = null;
        return res.status(401).json({ error: 'Login required' });
      }
      const [total, payments, requests] = await Promise.all([
        Payment.sum('amountSantim', { where: { userId: user.id } }),
        Payment.findAll({
          where: { userId: user.id },
          attributes: ['txId', 'amountSantim', 'creditedAt', 'paidAt'],
          order: [['creditedAt', 'DESC']]
        }),
        ManualRequest.findAll({
          where: { userId: user.id },
          attributes: ['txId', 'status', 'createdAt'],
          order: [['createdAt', 'DESC']]
        })
      ]);
      return res.json({
        username: user.username,
        points: formatSantim(total || 0),
        telebirr: {
          number: config.telebirrNumber,
          accountName: config.telebirrAccountName
        },
        payments: payments.map(payment => ({
          txId: payment.txId,
          amount: formatSantim(payment.amountSantim),
          creditedAt: payment.creditedAt,
          paidAt: payment.paidAt
        })),
        manualRequests: requests
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/manual-requests', requireUser, manualRateLimit, requireJson, async (req, res, next) => {
    try {
      if (!validTxId(req.body && req.body.txId)) {
        return res.status(400).json({ error: 'Transaction ID must be 10 letters or digits' });
      }
      const txId = req.body.txId.toUpperCase();
      const alreadyAdded = await Payment.findOne({
        where: { txId, userId: req.session.userId }
      });
      if (alreadyAdded) {
        return res.json({ message: 'Already added' });
      }

      try {
        await ManualRequest.create({ userId: req.session.userId, txId, status: 'pending' });
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error;
        const existing = await ManualRequest.findOne({
          where: { userId: req.session.userId, txId, status: 'pending' }
        });
        if (!existing) throw error;
      }
      return res.status(201).json({ message: 'Transaction ID submitted for review' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/login', adminLoginRateLimit, requireJson, (req, res) => {
    const password = req.body && req.body.password;
    if (!secretMatches(password, config.adminPassword)) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    req.session = { admin: true };
    return res.json({ ok: true });
  });

  app.post('/api/admin/logout', requireAdmin, requireJson, (req, res) => {
    req.session = null;
    return res.json({ ok: true });
  });

  app.get('/api/admin/data', requireAdmin, async (req, res, next) => {
    try {
      const [requests, uncreditedPayments, unparsedSms] = await Promise.all([
        ManualRequest.findAll({
          where: { status: 'pending' },
          include: [{ model: User, as: 'user', attributes: ['username', 'fullName', 'phone'] }],
          order: [['createdAt', 'ASC']]
        }),
        Payment.findAll({
          where: { userId: null },
          order: [['createdAt', 'DESC']]
        }),
        SmsLog.findAll({
          where: { parsed: false },
          order: [['receivedAt', 'DESC']],
          limit: 100
        })
      ]);

      const paymentIds = requests.map(request => request.txId);
      const payments = paymentIds.length
        ? await Payment.findAll({ where: { txId: { [Op.in]: paymentIds } } })
        : [];
      const paymentsById = new Map(payments.map(payment => [payment.txId, payment]));

      return res.json({
        requests: requests.map(request => {
          const payment = paymentsById.get(request.txId);
          return {
            id: request.id,
            txId: request.txId,
            createdAt: request.createdAt,
            user: request.user,
            payment: payment ? {
              amount: formatSantim(payment.amountSantim),
              amountSantim: payment.amountSantim,
              payerName: payment.payerName,
              payerLast4: payment.payerLast4,
              userId: payment.userId
            } : null
          };
        }),
        uncreditedPayments: uncreditedPayments.map(payment => ({
          txId: payment.txId,
          amount: formatSantim(payment.amountSantim),
          payerName: payment.payerName,
          payerLast4: payment.payerLast4,
          paidAt: payment.paidAt,
          createdAt: payment.createdAt
        })),
        unparsedSms: unparsedSms.map(entry => ({
          body: entry.body,
          receivedAt: entry.receivedAt
        }))
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/requests/:id/approve', requireAdmin, requireJson, async (req, res, next) => {
    try {
      const result = await sequelize.transaction(async transaction => {
        const request = await ManualRequest.findOne({
          where: { id: req.params.id, status: 'pending' },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!request) {
          const error = new Error('Request is no longer pending');
          error.statusCode = 409;
          throw error;
        }

        let payment = await Payment.findByPk(request.txId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!payment) {
          const amountSantim = parseAdminAmount(req.body && req.body.amountBirr);
          if (!amountSantim || amountSantim > MAX_SANTIM) {
            const error = new Error('A valid amount with two decimal places is required');
            error.statusCode = 400;
            throw error;
          }
          payment = await Payment.create({
            txId: request.txId,
            amountSantim,
            payerName: null,
            payerLast4: null,
            paidAt: null,
            userId: null,
            creditedAt: null
          }, { transaction });
        }

        const [credited] = await Payment.update({
          userId: request.userId,
          creditedAt: new Date()
        }, {
          where: { txId: request.txId, userId: null },
          transaction
        });
        if (credited !== 1) {
          const error = new Error('Payment has already been credited');
          error.statusCode = 409;
          throw error;
        }

        const [reviewed] = await ManualRequest.update({
          status: 'approved',
          reviewedAt: new Date()
        }, {
          where: { id: request.id, status: 'pending' },
          transaction
        });
        if (reviewed !== 1) {
          const error = new Error('Request is no longer pending');
          error.statusCode = 409;
          throw error;
        }
        return { txId: payment.txId };
      });
      return res.json({ ok: true, txId: result.txId });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/requests/:id/reject', requireAdmin, requireJson, async (req, res, next) => {
    try {
      const [updated] = await ManualRequest.update({
        status: 'rejected',
        reviewedAt: new Date()
      }, {
        where: { id: req.params.id, status: 'pending' }
      });
      if (updated !== 1) {
        return res.status(409).json({ error: 'Request is no longer pending' });
      }
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDirectory, 'admin.html'));
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDirectory, 'index.html'));
  });
  app.use((req, res, next) => {
    if (req.path === '/admin.html') return res.sendStatus(404);
    return next();
  });
  app.use(express.static(publicDirectory, { index: false }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body exceeds 10kb' });
    }
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
