import { Express } from 'express';
import { ngina } from '../ai/ngina/ngina-orchestrator';
import { logger } from '../utils/logger';

export function setupNGINARoutes(app: Express): void {
  /**
   * Get NGINA status
   */
  app.get('/api/ngina/status', (req, res) => {
    try {
      const status = ngina.getStatus();
      res.json(status);
    } catch (error: any) {
      logger.error('Failed to get NGINA status', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get NGINA personality info
   */
  app.get('/api/ngina/personality/:name', (req, res) => {
    try {
      const { name } = req.params;
      const personality = ngina.getPersonality(name);

      if (!personality) {
        return res.status(404).json({ error: 'Personality not found' });
      }

      res.json(personality);
    } catch (error: any) {
      logger.error('Failed to get personality', { error });
      res.status(500).json({ error: error.message });
    }
  });
}
