import { Express } from 'express';
import { crewAI } from '../ai/crew/crew-ai-system';
import Joi from 'joi';
import { logger } from '../utils/logger';

export function setupCrewRoutes(app: Express): void {
  /**
   * Add crew member
   */
  app.post('/api/crew', async (req, res) => {
    try {
      const { crew_id, name, role } = req.body;

      const schema = Joi.object({
        crew_id: Joi.string().required(),
        name: Joi.string().required(),
        role: Joi.string().required(),
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.message });
      }

      await crewAI.addCrewMember(crew_id, name, role);
      res.json({ success: true, message: `Crew member ${name} added` });
    } catch (error: any) {
      logger.error('Failed to add crew member', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Remove crew member
   */
  app.delete('/api/crew/:crew_id', async (req, res) => {
    try {
      const { crew_id } = req.params;
      const { reason } = req.query;

      await crewAI.removeCrewMember(crew_id, reason as string);
      res.json({ success: true, message: `Crew member removed` });
    } catch (error: any) {
      logger.error('Failed to remove crew member', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get crew member info
   */
  app.get('/api/crew/:crew_id', (req, res) => {
    try {
      const { crew_id } = req.params;
      const member = crewAI.getCrewMember(crew_id);

      if (!member) {
        return res.status(404).json({ error: 'Crew member not found' });
      }

      res.json(member);
    } catch (error: any) {
      logger.error('Failed to get crew member', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get all crew members
   */
  app.get('/api/crew', (req, res) => {
    try {
      const crew = crewAI.getAllCrew();
      res.json({
        total: crew.length,
        crew,
      });
    } catch (error: any) {
      logger.error('Failed to get crew', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get crew wellness summary
   */
  app.get('/api/crew-wellness/summary', (req, res) => {
    try {
      const summary = crewAI.getCrewWellnessSummary();
      res.json(summary);
    } catch (error: any) {
      logger.error('Failed to get wellness summary', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get crew logs
   */
  app.get('/api/crew-logs', (req, res) => {
    try {
      const { crew_id, log_type, since } = req.query;
      const logs = crewAI.getCrewLogs(
        crew_id as string,
        log_type as string,
        since ? parseInt(since as string) : undefined
      );

      res.json({
        total: logs.length,
        logs,
      });
    } catch (error: any) {
      logger.error('Failed to get crew logs', { error });
      res.status(500).json({ error: error.message });
    }
  });
}
