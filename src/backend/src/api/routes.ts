import { Express } from 'express';
import { getControlState, setSetpoint } from '../services/control-engine';
import { queryTelemetry } from '../db/influx-client';
import { logger } from '../utils/logger';
import { setupCrewRoutes } from './crew-routes';
import { setupWeatherRoutes } from './weather-routes';
import { setupNGINARoutes } from './ngina-routes';
import Joi from 'joi';

export function setupRoutes(app: Express): void {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get current system state
  app.get('/api/state', (req, res) => {
    try {
      const state = getControlState();
      res.json(state);
    } catch (error) {
      logger.error('Failed to get state', { error });
      res.status(500).json({ error: 'Failed to get state' });
    }
  });

  // Get telemetry data
  app.get('/api/telemetry/:measurement', async (req, res) => {
    try {
      const { measurement } = req.params;
      const { range } = req.query as { range?: string };

      const schema = Joi.object({
        measurement: Joi.string().required(),
        range: Joi.string().optional().default('-1h'),
      });

      const { error } = schema.validate({ measurement, range });
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      const data = await queryTelemetry(measurement, range || '-1h');
      res.json(data);
    } catch (error) {
      logger.error('Failed to query telemetry', { error });
      res.status(500).json({ error: 'Failed to query telemetry' });
    }
  });

  // Set control setpoint
  app.post('/api/setpoint', async (req, res) => {
    try {
      const { system, parameter, value } = req.body;

      const schema = Joi.object({
        system: Joi.string().valid('digesters', 'ro', 'system').required(),
        parameter: Joi.string().required(),
        value: Joi.number().required(),
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      await setSetpoint(system, parameter, value);
      res.json({
        success: true,
        message: `Setpoint updated: ${system}.${parameter} = ${value}`,
      });
    } catch (error: any) {
      logger.error('Failed to set setpoint', { error });
      res.status(400).json({ error: error.message });
    }
  });

  // Get historical trends
  app.get('/api/trends/:system', async (req, res) => {
    try {
      const { system } = req.params;
      const { period } = req.query as { period?: string };

      const measurement = `eclss_${system}`;
      const data = await queryTelemetry(measurement, period || '-24h');

      // Format for charting
      const trends = data.map((d) => ({
        timestamp: d._time,
        value: d._value,
        field: d._field,
      }));

      res.json(trends);
    } catch (error) {
      logger.error('Failed to get trends', { error });
      res.status(500).json({ error: 'Failed to get trends' });
    }
  });

  // Manual override (CapComm control)
  app.post('/api/manual-override', async (req, res) => {
    try {
      const { component, command, args } = req.body;

      const schema = Joi.object({
        component: Joi.string().required(),
        command: Joi.string().required(),
        args: Joi.object().optional(),
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      logger.warn('Manual override command', { component, command, args });
      res.json({
        success: true,
        message: `Manual override executed: ${component}.${command}`,
      });
    } catch (error: any) {
      logger.error('Failed to execute manual override', { error });
      res.status(400).json({ error: error.message });
    }
  });

  // Setup subsystem routes
  setupCrewRoutes(app);
  setupWeatherRoutes(app);
  setupNGINARoutes(app);

  // API Error handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}
