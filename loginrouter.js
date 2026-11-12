const express = require('express');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const leaseMs = 120000;
const validId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const digest = value => createHash('sha256').update(value).digest();

function isActiveAgent(agent) {
  const role = agent?.role ?? 'pos_agent';
  return agent && typeof agent.companyid === 'string' && agent.companyid.trim() &&
    agent.islock !== true && agent.islock !== 'true' &&
    (role === 'pos_agent' || role === 'kitchen_coordinator');
}

function createAgentSessionService(db, now = Date.now) {
  const agentRef = id => db.collection('kds_agent_user').doc(id);
  const sessionRef = id => db.collection('pos_agent_sessions').doc(id);

  return {
    async claim({ agentId, username, password }) {
      if (!validId(agentId) || typeof username !== 'string' || !username ||
          typeof password !== 'string' || !password || password.length > 1024) {
        return { status: 401, code: 'invalid_credentials' };
      }
      const token = randomBytes(32).toString('hex');
      const ref = sessionRef(agentId);
      return db.runTransaction(async tx => {
        const agent = (await tx.get(agentRef(agentId))).data();
        if (!isActiveAgent(agent) || agent.username !== username ||
            typeof agent.password !== 'string' ||
            !timingSafeEqual(digest(agent.password), digest(password))) {
          return { status: 401, code: 'invalid_credentials' };
        }
        const current = (await tx.get(ref)).data();
        const time = now();
        if (current?.expiresAt > time) {
          return { status: 409, code: 'session_in_use' };
        }
        tx.set(ref, { tokenHash: digest(token).toString('hex'), expiresAt: time + leaseMs });
        return { status: 200, token, leaseMs };
      });
    },

    async update({ agentId, token }, release = false) {
      if (!validId(agentId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        return { status: 401, code: 'invalid_session' };
      }
      const ref = sessionRef(agentId);
      return db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        const hash = digest(token).toString('hex');
        if (!current || current.tokenHash !== hash) {
          return { status: 401, code: 'invalid_session' };
        }
        if (release) {
          tx.delete(ref);
          return { status: 200 };
        }
        const agent = (await tx.get(agentRef(agentId))).data();
        const time = now();
        if (current.expiresAt <= time || !isActiveAgent(agent)) {
          return { status: 401, code: 'invalid_session' };
        }
        tx.update(ref, { expiresAt: time + leaseMs });
        return { status: 200, leaseMs };
      });
    },
  };
}

function createLoginRouter(db) {
  const router = express.Router();
  const sessions = createAgentSessionService(db);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function handle(action) {
    return async (req, res) => {
      try {
        const { status, ...body } = await action(req.body ?? {});
        res.status(status).json(body);
      } catch (_) {
        console.error('[POS agent login] Session request failed');
        res.status(503).json({ code: 'session_unavailable' });
      }
    };
  }

  const path = '/pos-agent/session';
  router.post(path, handle(body => sessions.claim(body)));
  router.post(`${path}/renew`, handle(body => sessions.update(body)));
  router.post(`${path}/release`, handle(body => sessions.update(body, true)));
  return router;
}

module.exports = { createLoginRouter, createAgentSessionService };
