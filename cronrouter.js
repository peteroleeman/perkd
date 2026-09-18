const fs = require('fs');
const path = require('path');
const express = require('express');
const { CloudSchedulerClient } = require('@google-cloud/scheduler');
const CeriaRouter = require('./ceriarouter');

/**
 * Cron router: Google Cloud Scheduler helpers for SQL Account stock → Firestore sync jobs.
 */
class CronRouter {
  constructor() {
    this.router = express.Router();
    // Align with Firebase .env PROJECT_ID when scheduler project not overridden
    this.projectId =
      process.env.GCP_SCHEDULER_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.PROJECT_ID ||
      'foodio-ab3b2';
    this.location = process.env.GCP_SCHEDULER_LOCATION || 'asia-east1';
    this.timeZone = process.env.GCP_SCHEDULER_TIME_ZONE || 'Asia/Kuala_Lumpur';
    this.stockSyncHttpUri =
      process.env.SQL_STOCK_SYNC_HTTP_URI ||
      'https://sql-app-261774603679.asia-east1.run.app/sqlaccount/stockitem/sync-firestore';

    this.ceriaTopupHttpUri =
      process.env.CERIA_TOPUP_HTTP_URI ||
      'https://crm--app-261774603679.asia-east1.run.app/ceria/execute-corporate-carry-forward-topup';

    this.ceriaResetSpendHttpUri =
      process.env.CERIA_RESET_SPEND_HTTP_URI ||
      'https://crm--app-261774603679.asia-east1.run.app/ceria/reset-corporate-spend-today';

    this.ceriaStandingInstructionsHttpUri =
      process.env.CERIA_STANDING_INSTRUCTIONS_HTTP_URI ||
      'https://crm--app-261774603679.asia-east1.run.app/ceria/apply-standing-instructions';

    this.prepMonitorHttpUri =
      process.env.KDS_PREP_MONITOR_HTTP_URI ||
      'https://sql-app-261774603679.asia-east1.run.app/kds/preparation-monitor';

    this._client = null;
    this.initializeRoutes();
  }

  /**
   * Same auth pattern as KaotimHQRouter BigQuery: Firebase uses apiKey in config.js;
   * Cloud Scheduler needs a service account (key file or JSON env), not the web API key.
   */
  buildSchedulerClientOptions() {
    const opts = { projectId: this.projectId };
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const p = process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
      const resolved = path.isAbsolute(p) ? p : path.join(__dirname, p);
      if (fs.existsSync(resolved)) {
        console.log('[CronRouter] Using GOOGLE_APPLICATION_CREDENTIALS:', resolved);
        opts.keyFilename = resolved;
        return opts;
      }
      console.warn(
        `[CronRouter] GOOGLE_APPLICATION_CREDENTIALS not found (${resolved}); checking GOOGLE_SERVICE_ACCOUNT_KEY`
      );
    }
    
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const keyValue = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim();
        if (!keyValue || keyValue === '') {
          console.warn('[CronRouter] GOOGLE_SERVICE_ACCOUNT_KEY is set but empty');
        } else {
          console.log('[CronRouter] GOOGLE_SERVICE_ACCOUNT_KEY found, length:', keyValue.length);
          opts.credentials = JSON.parse(keyValue);
          console.log('[CronRouter] Successfully parsed service account credentials');
          return opts;
        }
      } catch (error) {
        console.error('[CronRouter] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', error.message);
      }
    } else {
      console.warn('[CronRouter] GOOGLE_SERVICE_ACCOUNT_KEY not set');
    }
    
    console.log('[CronRouter] Falling back to Application Default Credentials');
    return opts;
  }

  getClient() {
    if (!this._client) {
      this._client = new CloudSchedulerClient(this.buildSchedulerClientOptions());
    }
    return this._client;
  }

  parentPath() {
    return `projects/${this.projectId}/locations/${this.location}`;
  }

  /**
   * Job IDs: letters, numbers, hyphens only (Cloud Scheduler constraint).
   */
  sanitizeJobId(raw) {
    const s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s.slice(0, 500) || 'job';
  }

  /**
   * Daily cron at HH:mm in the configured timeZone (24h).
   * @param {string} time - e.g. "2:30" or "02:30"
   */
  cronFromDailyTime(time) {
    const m = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      return null;
    }
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return `${minute} ${hour} * * *`;
  }

  resolveCronSchedule(body) {
    const cronSchedule = body?.cronSchedule;
    if (cronSchedule && String(cronSchedule).trim()) {
      return String(cronSchedule).trim();
    }
    const time = body?.time ?? body?.scheduleTime ?? body?.dailyAt;
    if (time) {
      const c = this.cronFromDailyTime(time);
      if (c) return c;
    }
    return null;
  }

  initializeRoutes() {
    this.router.post('/scheduler/create', this.createStockSyncJob.bind(this));
    this.router.post(
      '/scheduler/ceria-topup',
      this.createCeriaTopupSyncJob.bind(this),
    );
    this.router.post(
      '/scheduler/ceria-reset-spend-today',
      this.createCeriaResetSpendTodayJob.bind(this),
    );
    this.router.post(
      '/scheduler/ceria-standing-instructions',
      this.createCeriaStandingInstructionsJob.bind(this),
    );
    this.router.post(
      '/scheduler/prep-monitor',
      this.createPrepMonitorJob.bind(this),
    );
    this.router.get('/scheduler/jobs', this.listJobs.bind(this));
    this.router.delete('/scheduler/jobs/:jobId', this.deleteJob.bind(this));
  }

  async createStockSyncJob(req, res) {
    try {
      const body = req.body || {};
      const storeId = body.storeId ?? body.storeid;
      if (!storeId || String(storeId).trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'storeId is required',
        });
      }

      const cronSchedule = this.resolveCronSchedule(body);
      if (!cronSchedule) {
        return res.status(400).json({
          success: false,
          error:
            'Provide cronSchedule (cron string) or time (HH:mm) for a daily run in ' + this.timeZone,
        });
      }

      const nameInput = body.name;
      const jobId = this.sanitizeJobId(
        nameInput || `sql-stock-sync-${String(storeId).trim()}`
      );

      const pageSizeRaw = body.pageSize;
      const pageSize = Math.min(
        Math.max(parseInt(pageSizeRaw, 10) || 50, 1),
        250
      );
      const enrich =
        String(body.enrich || '').toLowerCase() === 'true' || body.enrich === true;

      const parent = this.parentPath();
      const jobName = `${parent}/jobs/${jobId}`;

      const job = {
        name: jobName,
        description:
          body.description ||
          `Stock sync for store ${String(storeId).trim()}`,
        schedule: cronSchedule,
        timeZone: this.timeZone,
        httpTarget: {
          uri: this.stockSyncHttpUri,
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(
            JSON.stringify({
              storeId: String(storeId).trim(),
              pageSize,
              enrich,
            })
          ).toString('base64'),
        },
      };

      const client = this.getClient();
      const [response] = await client.createJob({ parent, job });
      return res.json({ success: true, job: response });
    } catch (error) {
      console.error('[CronRouter] createJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Creates a Cloud Scheduler job that POSTs only `{ companyId }` to
   * `/ceria/execute-corporate-carry-forward-topup` (carry-forward math + dual-write live there).
   *
   * POST /cron/scheduler/ceria-topup
   * Body: { companyId, cronSchedule | time, name?, description?, dryRun?, timeZone? }
   * Optional `timeZone` is stored on the scheduler job only; HTTP body remains `{ companyId }`.
   */
  async createCeriaTopupSyncJob(req, res) {
    const runId = `ceria-topup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const body = req.body || {};
      const companyId = (body.companyId ?? '').toString().trim();
      const dryRun =
        String(body.dryRun || '').toLowerCase() === 'true' || body.dryRun === true;

      if (!companyId) {
        console.warn(
          '[CronRouter][CeriaTopup] rejected',
          JSON.stringify({ runId, reason: 'missing_companyId', dryRun }),
        );
        return res.status(400).json({
          success: false,
          error: 'companyId is required',
        });
      }

      const cronSchedule = this.resolveCronSchedule(body);
      if (!cronSchedule) {
        console.warn(
          '[CronRouter][CeriaTopup] rejected',
          JSON.stringify({ runId, companyId, dryRun, reason: 'missing_cronSchedule' }),
        );
        return res.status(400).json({
          success: false,
          error:
            'Provide cronSchedule (cron string) or time (HH:mm) for a daily run in ' +
            this.timeZone,
        });
      }

      const schedulerTz =
        (body.timeZone && String(body.timeZone).trim()) || this.timeZone;

      console.log(
        '[CronRouter][CeriaTopup] start',
        JSON.stringify({
          runId,
          companyId,
          dryRun,
          cronSchedule,
          schedulerTz,
          ceriaTopupHttpUri: this.ceriaTopupHttpUri,
          path: req.originalUrl || req.url,
          ip: req.ip,
        }),
      );

      if (dryRun) {
        const preview = await CeriaRouter.executeCorporateCarryForwardTopupCore({
          companyId,
          dryRun: true,
          timeZone: schedulerTz,
          logRunId: runId,
        });
        if (!preview.success) {
          console.warn(
            '[CronRouter][CeriaTopup] preview_failed',
            JSON.stringify({ runId, companyId, ...preview }),
          );
          return res.status(400).json({
            success: false,
            runId,
            error: preview.message || 'Carry-forward preview failed',
            code: preview.code,
          });
        }
        console.log(
          '[CronRouter][CeriaTopup] dry_run_complete',
          JSON.stringify({
            runId,
            companyId,
            employeesRead: preview.employeesProcessed,
            ceriaTopupHttpUri: this.ceriaTopupHttpUri,
          }),
        );
        return res.json({
          success: true,
          dryRun: true,
          runId,
          cronSchedule,
          timeZone: schedulerTz,
          ceriaTopupHttpUri: this.ceriaTopupHttpUri,
          schedulerHttpBody: { companyId },
          carryForwardPreview: preview,
        });
      }

      const nameInput = body.name;
      const jobId = this.sanitizeJobId(
        nameInput || `ceria-topup-${companyId}`,
      );

      const parent = this.parentPath();
      const jobName = `${parent}/jobs/${jobId}`;

      const httpBody = { companyId };

      const job = {
        name: jobName,
        description:
          body.description ||
          `Ceria corporate carry-forward top-up for company ${companyId} (POST body: companyId only)`,
        schedule: cronSchedule,
        timeZone: schedulerTz,
        httpTarget: {
          uri: this.ceriaTopupHttpUri,
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(httpBody)).toString('base64'),
        },
      };

      const client = this.getClient();
      const [response] = await client.createJob({ parent, job });
      console.log(
        '[CronRouter][CeriaTopup] scheduler_job_created',
        JSON.stringify({
          runId,
          companyId,
          jobName: response && response.name,
          jobId,
          ceriaTopupHttpUri: this.ceriaTopupHttpUri,
          schedulerHttpBody: httpBody,
        }),
      );
      return res.json({
        success: true,
        runId,
        job: response,
        companyId,
        ceriaTopupHttpUri: this.ceriaTopupHttpUri,
        schedulerHttpBody: httpBody,
      });
    } catch (error) {
      console.error(
        '[CronRouter][CeriaTopup] error',
        JSON.stringify({
          runId,
          message: error.message || String(error),
          stack: error.stack,
        }),
      );
      return res.status(500).json({
        success: false,
        runId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Creates a Cloud Scheduler job that POSTs `{ storeId }` to `/kds/preparation-monitor`
   * every minute (default) to promote Start → Preparing and trigger Feie kitchen printing.
   *
   * POST /cron/scheduler/prep-monitor
   * Body: { storeId, cronSchedule | time, name?, description? }
   */
  async createPrepMonitorJob(req, res) {
    try {
      const body = req.body || {};
      const storeId = (body.storeId ?? body.storeid ?? '').toString().trim();
      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: 'storeId is required',
        });
      }

      const cronSchedule = this.resolveCronSchedule(body) || '*/1 * * * *';

      const nameInput = body.name;
      const jobId = this.sanitizeJobId(
        nameInput || `prep-monitor-${storeId}`,
      );

      const parent = this.parentPath();
      const jobName = `${parent}/jobs/${jobId}`;
      const httpBody = { storeId };

      const job = {
        name: jobName,
        description:
          body.description ||
          `KDS preparation monitor for store ${storeId} (POST body: storeId only)`,
        schedule: cronSchedule,
        timeZone: this.timeZone,
        httpTarget: {
          uri: this.prepMonitorHttpUri,
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(httpBody)).toString('base64'),
        },
      };

      const client = this.getClient();
      const [response] = await client.createJob({ parent, job });
      return res.json({
        success: true,
        job: response,
        storeId,
        prepMonitorHttpUri: this.prepMonitorHttpUri,
        schedulerHttpBody: httpBody,
      });
    } catch (error) {
      console.error('[CronRouter] createPrepMonitorJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Creates a Cloud Scheduler job that POSTs `{ companyId, timeZone }` to
   * `/ceria/reset-corporate-spend-today` (zeros corporate_spent_today for each employee; dual-write).
   *
   * POST /cron/scheduler/ceria-reset-spend-today
   * Body: { companyId, cronSchedule | time, name?, description?, dryRun?, timeZone? }
   * `timeZone` is the IANA zone for `todayDayKey` on the Ceria service and is included in the HTTP body
   * so it matches the scheduler job's `timeZone`.
   */
  async createCeriaResetSpendTodayJob(req, res) {
    const runId = `ceria-reset-spend-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const body = req.body || {};
      const companyId = (body.companyId ?? '').toString().trim();
      const dryRun =
        String(body.dryRun || '').toLowerCase() === 'true' || body.dryRun === true;

      if (!companyId) {
        console.warn(
          '[CronRouter][CeriaResetSpend] rejected',
          JSON.stringify({ runId, reason: 'missing_companyId', dryRun }),
        );
        return res.status(400).json({
          success: false,
          error: 'companyId is required',
        });
      }

      const cronSchedule = this.resolveCronSchedule(body);
      if (!cronSchedule) {
        console.warn(
          '[CronRouter][CeriaResetSpend] rejected',
          JSON.stringify({ runId, companyId, dryRun, reason: 'missing_cronSchedule' }),
        );
        return res.status(400).json({
          success: false,
          error:
            'Provide cronSchedule (cron string) or time (HH:mm) for a daily run in ' +
            this.timeZone,
        });
      }

      const schedulerTz =
        (body.timeZone && String(body.timeZone).trim()) || this.timeZone;

      console.log(
        '[CronRouter][CeriaResetSpend] start',
        JSON.stringify({
          runId,
          companyId,
          dryRun,
          cronSchedule,
          schedulerTz,
          ceriaResetSpendHttpUri: this.ceriaResetSpendHttpUri,
          path: req.originalUrl || req.url,
          ip: req.ip,
        }),
      );

      if (dryRun) {
        const preview = await CeriaRouter.resetCorporateSpendTodayCore({
          companyId,
          dryRun: true,
          timeZone: schedulerTz,
          logRunId: runId,
        });
        if (!preview.success) {
          console.warn(
            '[CronRouter][CeriaResetSpend] preview_failed',
            JSON.stringify({ runId, companyId, ...preview }),
          );
          return res.status(400).json({
            success: false,
            runId,
            error: preview.message || 'Reset spend preview failed',
            code: preview.code,
          });
        }
        console.log(
          '[CronRouter][CeriaResetSpend] dry_run_complete',
          JSON.stringify({
            runId,
            companyId,
            employeesRead: preview.employeesProcessed,
            ceriaResetSpendHttpUri: this.ceriaResetSpendHttpUri,
          }),
        );
        const httpBody = { companyId, timeZone: schedulerTz };
        return res.json({
          success: true,
          dryRun: true,
          runId,
          cronSchedule,
          timeZone: schedulerTz,
          ceriaResetSpendHttpUri: this.ceriaResetSpendHttpUri,
          schedulerHttpBody: httpBody,
          resetSpendPreview: preview,
        });
      }

      const nameInput = body.name;
      const jobId = this.sanitizeJobId(
        nameInput || `ceria-reset-spend-${companyId}`,
      );

      const parent = this.parentPath();
      const jobName = `${parent}/jobs/${jobId}`;

      const httpBody = { companyId, timeZone: schedulerTz };

      const job = {
        name: jobName,
        description:
          body.description ||
          `Ceria reset corporate spend today for company ${companyId} (POST body: companyId, timeZone)`,
        schedule: cronSchedule,
        timeZone: schedulerTz,
        httpTarget: {
          uri: this.ceriaResetSpendHttpUri,
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(httpBody)).toString('base64'),
        },
      };

      const client = this.getClient();
      const [response] = await client.createJob({ parent, job });
      console.log(
        '[CronRouter][CeriaResetSpend] scheduler_job_created',
        JSON.stringify({
          runId,
          companyId,
          jobName: response && response.name,
          jobId,
          ceriaResetSpendHttpUri: this.ceriaResetSpendHttpUri,
          schedulerHttpBody: httpBody,
        }),
      );
      return res.json({
        success: true,
        runId,
        job: response,
        companyId,
        ceriaResetSpendHttpUri: this.ceriaResetSpendHttpUri,
        schedulerHttpBody: httpBody,
      });
    } catch (error) {
      console.error(
        '[CronRouter][CeriaResetSpend] error',
        JSON.stringify({
          runId,
          message: error.message || String(error),
          stack: error.stack,
        }),
      );
      return res.status(500).json({
        success: false,
        runId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Creates a Cloud Scheduler job that POSTs `{ companyId, timeZone }` to
   * `/ceria/apply-standing-instructions` (join / resign / limit-change worker).
   *
   * POST /cron/scheduler/ceria-standing-instructions
   * Body: { companyId, cronSchedule | time, name?, description?, dryRun?, timeZone? }
   */
  async createCeriaStandingInstructionsJob(req, res) {
    const runId = `ceria-standing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const body = req.body || {};
      const companyId = (body.companyId ?? '').toString().trim();
      const dryRun =
        String(body.dryRun || '').toLowerCase() === 'true' || body.dryRun === true;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: 'companyId is required',
        });
      }

      const cronSchedule = this.resolveCronSchedule(body);
      if (!cronSchedule) {
        return res.status(400).json({
          success: false,
          error:
            'Provide cronSchedule (cron string) or time (HH:mm) for a daily run in ' +
            this.timeZone,
        });
      }

      const schedulerTz =
        (body.timeZone && String(body.timeZone).trim()) || this.timeZone;

      if (dryRun) {
        const preview = await CeriaRouter.applyStandingInstructionsCore({
          companyId,
          dryRun: true,
          timeZone: schedulerTz,
          logRunId: runId,
        });
        if (!preview.success) {
          return res.status(400).json({
            success: false,
            runId,
            error: preview.message || 'Standing instructions preview failed',
            code: preview.code,
          });
        }
        const httpBody = { companyId, timeZone: schedulerTz };
        return res.json({
          success: true,
          dryRun: true,
          runId,
          cronSchedule,
          timeZone: schedulerTz,
          ceriaStandingInstructionsHttpUri: this.ceriaStandingInstructionsHttpUri,
          schedulerHttpBody: httpBody,
          standingInstructionsPreview: preview,
        });
      }

      const nameInput = body.name;
      const jobId = this.sanitizeJobId(
        nameInput || `ceria-standing-instructions-${companyId}`,
      );

      const parent = this.parentPath();
      const jobName = `${parent}/jobs/${jobId}`;
      const httpBody = { companyId, timeZone: schedulerTz };

      const job = {
        name: jobName,
        description:
          body.description ||
          `Ceria apply standing instructions for company ${companyId} (POST body: companyId, timeZone)`,
        schedule: cronSchedule,
        timeZone: schedulerTz,
        httpTarget: {
          uri: this.ceriaStandingInstructionsHttpUri,
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(httpBody)).toString('base64'),
        },
      };

      const client = this.getClient();
      const [response] = await client.createJob({ parent, job });
      return res.json({
        success: true,
        runId,
        job: response,
        companyId,
        ceriaStandingInstructionsHttpUri: this.ceriaStandingInstructionsHttpUri,
        schedulerHttpBody: httpBody,
      });
    } catch (error) {
      console.error('[CronRouter][CeriaStandingInstructions] error', error);
      return res.status(500).json({
        success: false,
        runId,
        error: error.message || String(error),
      });
    }
  }

  async listJobs(req, res) {
    try {
      const parent = this.parentPath();
      const client = this.getClient();
      const jobs = [];
      let pageToken;

      do {
        const [jobList, , listResponse] = await client.listJobs({
          parent,
          pageSize: 100,
          pageToken,
        });
        if (jobList && jobList.length) {
          jobs.push(...jobList);
        }
        pageToken =
          listResponse && listResponse.nextPageToken
            ? listResponse.nextPageToken
            : undefined;
      } while (pageToken);

      const summary = jobs.map((j) => ({
        name: j.name,
        id: j.name ? j.name.split('/').pop() : undefined,
        schedule: j.schedule,
        timeZone: j.timeZone,
        state: j.state,
        description: j.description,
      }));

      return res.json({ success: true, jobs: summary, count: summary.length });
    } catch (error) {
      console.error('[CronRouter] listJobs:', error);
      return res.status(500).json({
        success: false,
        error: error.message || String(error),
      });
    }
  }

  async deleteJob(req, res) {
    try {
      let jobId = req.params.jobId;
      if (!jobId) {
        return res.status(400).json({ success: false, error: 'jobId is required' });
      }

      let name = decodeURIComponent(jobId);
      if (!name.includes('/')) {
        name = `${this.parentPath()}/jobs/${this.sanitizeJobId(name)}`;
      }

      const client = this.getClient();
      await client.deleteJob({ name });
      return res.json({ success: true, deleted: name });
    } catch (error) {
      console.error('[CronRouter] deleteJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || String(error),
      });
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = CronRouter;
