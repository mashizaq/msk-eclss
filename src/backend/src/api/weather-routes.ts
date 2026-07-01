import { Express } from 'express';
import { weatherMonitoring } from '../ai/weather/weather-monitoring';
import { logger } from '../utils/logger';

export function setupWeatherRoutes(app: Express): void {
  /**
   * Get current weather conditions
   */
  app.get('/api/weather/current', (req, res) => {
    try {
      const conditions = weatherMonitoring.getCurrentConditions();
      if (!conditions) {
        return res.status(503).json({ error: 'Weather data not available yet' });
      }
      res.json(conditions);
    } catch (error: any) {
      logger.error('Failed to get current weather', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get weather trends
   */
  app.get('/api/weather/trends', (req, res) => {
    try {
      const trends = weatherMonitoring.getWeatherTrends();
      res.json({
        trends,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error('Failed to get weather trends', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get active weather alerts
   */
  app.get('/api/weather/alerts', (req, res) => {
    try {
      const alerts = weatherMonitoring.getActiveAlerts();
      res.json({
        total: alerts.length,
        alerts,
      });
    } catch (error: any) {
      logger.error('Failed to get weather alerts', { error });
      res.status(500).json({ error: error.message });
    }
  });
}
